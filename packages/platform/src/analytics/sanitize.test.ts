import { describe, expect, it } from "vitest";
import {
  BACKEND_ANALYTICS_FACTS,
  technicalDistinctId,
  sizeBucket,
} from "./event-contract";
import {
  normalizeErrorCode,
  redactSensitiveText,
  sanitizeError,
  sanitizeFactProperties,
  sanitizePath,
  sanitizeStackTrace,
  sanitizeUrl,
  toSanitizedErrorObject,
} from "./sanitize";
import { scrubExceptionEvent } from "./exception-scrub";

/**
 * Synthetic sensitive values only — none of these is a real person, number or
 * credential. Each assertion is about what must NOT survive sanitization.
 */
const PHONE = "+1 (786) 555-0193";
const E164 = "+17865550193";
const EMAIL = "valeria.gomez@example.test";
const API_KEY = `ringee_sk_${"a1b2c3d4".repeat(8)}`;
const JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIn0.c2lnbmF0dXJlLXZhbHVlLXRlc3Q";
const WORKSPACE_ID = "6f1c2d3e-4a5b-4c6d-8e7f-901234567890";

describe("redactSensitiveText", () => {
  it("removes phones, emails, keys and tokens but keeps opaque ids", () => {
    const text = `Lead ${EMAIL} at ${PHONE} (${E164}) key=${API_KEY} jwt ${JWT} for workspace ${WORKSPACE_ID}`;
    const out = redactSensitiveText(text, 500);
    expect(out).not.toContain(EMAIL);
    expect(out).not.toContain("555-0193");
    expect(out).not.toContain(E164);
    expect(out).not.toContain(API_KEY);
    expect(out).not.toContain(JWT);
    expect(out).toContain(WORKSPACE_ID);
    expect(out).toContain("[email]");
    expect(out).toContain("[phone]");
  });

  it("redacts quoted user text such as names and meeting titles", () => {
    const out = redactSensitiveText(
      'The calendar "Valeria Gómez private" is archived; meeting «Pricing walkthrough» moved',
    );
    expect(out).not.toContain("Valeria");
    expect(out).not.toContain("Pricing walkthrough");
    expect(out).toContain("is archived");
  });

  it("redacts the credential after an auth scheme and sensitive pairs", () => {
    const out = redactSensitiveText(
      "Authorization: Bearer abc123 password=hunter22 otp:123456 code=987654",
    );
    expect(out).not.toContain("abc123");
    expect(out).not.toContain("hunter22");
    expect(out).not.toContain("123456");
    expect(out).not.toContain("987654");
  });

  it("keeps ISO dates and short numbers, cuts long input", () => {
    expect(redactSensitiveText("due 2026-11-10T14:00:00.000Z in 15 min")).toBe(
      "due 2026-11-10T14:00:00.000Z in 15 min",
    );
    expect(redactSensitiveText("word ".repeat(300), 50).length).toBe(50);
    // One huge opaque token is a token, whatever its length.
    expect(redactSensitiveText("x".repeat(1_000))).toBe("[token]");
  });

  it("stays linear on adversarial input", () => {
    const hostile = `${"a@".repeat(20_000)}${"1-".repeat(20_000)}`;
    const started = Date.now();
    redactSensitiveText(hostile);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe("sanitizeUrl / sanitizePath", () => {
  it("drops query strings except campaign attribution, and the fragment", () => {
    const out = sanitizeUrl(
      `https://app.ringee.io/dashboard/call?phoneNumber=17865550193&utm_source=newsletter&token=${API_KEY}#settings/billing`,
    );
    expect(out).toBe(
      "https://app.ringee.io/dashboard/call?utm_source=newsletter",
    );
  });

  it("replaces path segments that hold a number, an email or a token", () => {
    expect(
      sanitizePath(
        `/c/${E164}/contact/${WORKSPACE_ID}/${EMAIL}/${"z".repeat(40)}`,
      ),
    ).toBe(`/c/:number/contact/${WORKSPACE_ID}/:email/:token`);
  });

  it("refuses non-http schemes", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBe("[url]");
  });
});

describe("errors and stacks", () => {
  it("sanitizes messages and nested causes without touching the original", () => {
    const root = new Error(`Telnyx refused ${E164}`);
    // The platform's lib target predates `ErrorOptions`: set the cause as
    // runtimes do.
    const error = Object.assign(new Error(`Booking for ${EMAIL} failed`), {
      cause: root,
    });
    const sanitized = sanitizeError(error);
    expect(sanitized.message).not.toContain(EMAIL);
    expect(sanitized.cause?.message).not.toContain(E164);
    const copy = toSanitizedErrorObject(error);
    expect(copy.message).not.toContain(EMAIL);
    expect(String(copy.stack)).not.toContain(EMAIL);
    expect(error.message).toContain(EMAIL);
  });

  it("cuts absolute paths and query strings from frames", () => {
    const stack = [
      `Error: failed for ${EMAIL}`,
      "    at book (/Users/someone/ringee/packages/services/src/meeting.service.ts:10:5)",
      "    at https://app.ringee.io/_next/static/chunks/app.js?dpl=secret123:1:2345",
    ].join("\n");
    const out = sanitizeStackTrace(stack);
    expect(out).not.toContain(EMAIL);
    expect(out).not.toContain("/Users/someone");
    expect(out).toContain("packages/services/src/meeting.service.ts:10:5");
    expect(out).not.toContain("dpl=secret123");
  });

  it("normalizes error codes without reading messages", () => {
    expect(normalizeErrorCode({ code: "P2002", message: EMAIL })).toBe(
      "prisma_P2002",
    );
    expect(normalizeErrorCode({ response: { status: 503 } })).toBe("http_503");
    expect(normalizeErrorCode({ code: "ECONNREFUSED" })).toBe("ECONNREFUSED");
    expect(normalizeErrorCode(new TypeError("x"))).toBe("type_error");
  });

  it("scrubs SDK-built exception events: context lines and frame queries", () => {
    const event = scrubExceptionEvent({
      properties: {
        $current_url: `https://app.ringee.io/dashboard?phoneNumber=${E164}`,
        $exception_list: [
          {
            value: `Failed for ${PHONE}`,
            stacktrace: {
              frames: [
                {
                  filename: "app.js?dpl=tok",
                  context_line: `const key = "${API_KEY}"`,
                  pre_context: ["x"],
                  vars: { email: EMAIL },
                },
              ],
            },
          },
        ],
      },
    });
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain(API_KEY);
    expect(serialized).not.toContain(EMAIL);
    expect(serialized).not.toContain("555-0193");
    expect(serialized).not.toContain(E164);
    expect(serialized).not.toContain("dpl=tok");
  });
});

describe("fact properties", () => {
  it("keeps only the allowlisted properties of a fact", () => {
    const out = sanitizeFactProperties("credit_topup_confirmed", {
      amount_usd: 25,
      payment_source: "embedded_checkout",
      is_first_paid_topup: true,
      contact_phone: E164,
      email: EMAIL,
      workspace_key: `personal:${WORKSPACE_ID}`,
    });
    expect(out).toEqual({
      amount_usd: 25,
      payment_source: "embedded_checkout",
      is_first_paid_topup: true,
      workspace_key: `personal:${WORKSPACE_ID}`,
    });
  });

  it("redacts a free-text value that slipped into an allowed property", () => {
    const out = sanitizeFactProperties("number_lookup_completed", {
      error_code: `failed for ${E164}`,
      country_code: "NZ",
      filters_used: ["area_code", "features", `bad ${EMAIL}`],
    });
    expect(JSON.stringify(out)).not.toContain(E164);
    expect(JSON.stringify(out)).not.toContain(EMAIL);
    expect(out.country_code).toBe("NZ");
    expect(out.filters_used).toEqual(["area_code", "features"]);
  });

  it("names technical actors apart from people", () => {
    expect(technicalDistinctId("ai", `organization:${WORKSPACE_ID}`)).toBe(
      `ai:organization:${WORKSPACE_ID}`,
    );
    expect(sizeBucket(1)).toBe("1");
    expect(Object.keys(BACKEND_ANALYTICS_FACTS)).toContain(
      "followup_business_result_recorded",
    );
  });
});
