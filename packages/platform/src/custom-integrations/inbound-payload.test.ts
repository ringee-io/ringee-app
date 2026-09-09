import { describe, expect, it } from "vitest";
import {
  validateInboundEnvelope,
  validateInboundEventData,
} from "./inbound-payload";

const CAMPAIGN_ID = "3f8a1c54-9d2b-4e7a-b1c6-5a0d9e8f7c21";

describe("validateInboundEnvelope", () => {
  it("accepts a complete envelope", () => {
    const result = validateInboundEnvelope({
      event: "contact.upserted",
      eventId: "evt_1",
      occurredAt: "2026-05-23T14:30:00.000Z",
      data: { externalId: "ext_1" },
    });

    expect(result).toEqual({
      ok: true,
      envelope: {
        event: "contact.upserted",
        eventId: "evt_1",
        occurredAt: "2026-05-23T14:30:00.000Z",
        data: { externalId: "ext_1" },
      },
    });
  });

  it("reports every missing field in one answer", () => {
    const result = validateInboundEnvelope({ event: "contact.upserted" });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors).toEqual([
      "eventId is required",
      "occurredAt is required",
      "data must be an object",
    ]);
  });

  it("names the supported events when the event is unknown", () => {
    const result = validateInboundEnvelope({
      event: "contact.created",
      eventId: "evt_1",
      occurredAt: "2026-05-23T14:30:00.000Z",
      data: {},
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors[0]).toContain(
      "Unsupported event: contact.created",
    );
    expect(result.ok === false && result.errors[0]).toContain(
      "contact.upserted",
    );
  });

  it("rejects a body that is not a JSON object", () => {
    for (const body of [null, undefined, "{}", 42, []]) {
      const result = validateInboundEnvelope(body);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.errors).toEqual([
        "body must be a JSON object",
      ]);
    }
  });
});

describe("validateInboundEventData", () => {
  it("accepts a documented payload with no remarks", () => {
    const issues = validateInboundEventData("contact.upserted", {
      externalId: "ext_1",
      phoneNumber: "+14155550123",
      firstName: "Ada",
      customFields: { tier: "vip" },
      campaignId: CAMPAIGN_ID,
    });

    expect(issues).toEqual({ errors: [], warnings: [] });
  });

  it("reports every missing required field at once", () => {
    const issues = validateInboundEventData("contact.upserted", {});

    expect(issues.errors).toEqual([
      "data.externalId is required",
      "data.phoneNumber is required",
    ]);
  });

  it("treats a blank required field as missing", () => {
    const issues = validateInboundEventData("contact.upserted", {
      externalId: "   ",
      phoneNumber: "+14155550123",
    });

    expect(issues.errors).toEqual(["data.externalId is required"]);
  });

  it("fails a malformed id instead of dropping it silently", () => {
    const issues = validateInboundEventData("contact.upserted", {
      externalId: "ext_1",
      phoneNumber: "+14155550123",
      campaignId: "campaign-42",
    });

    expect(issues.errors).toEqual(["data.campaignId must be a UUID"]);
  });

  it("warns about an optional field of the wrong type instead of failing", () => {
    const issues = validateInboundEventData("contact.upserted", {
      externalId: "ext_1",
      phoneNumber: "+14155550123",
      email: 42,
      customFields: ["not", "an", "object"],
    });

    expect(issues.errors).toEqual([]);
    expect(issues.warnings).toEqual([
      "data.email was ignored: expected a string, received a number",
      "data.customFields was ignored: expected an object, received an array",
    ]);
  });

  it("treats null and empty strings as 'leave it alone', not as errors", () => {
    const issues = validateInboundEventData("contact.upserted", {
      externalId: "ext_1",
      phoneNumber: "+14155550123",
      email: null,
      jobTitle: "",
    });

    expect(issues).toEqual({ errors: [], warnings: [] });
  });

  it("warns about unknown fields so a typo is visible", () => {
    const issues = validateInboundEventData("contact.upserted", {
      externalId: "ext_1",
      phoneNumber: "+14155550123",
      campagnId: CAMPAIGN_ID,
      phone_number: "+14155550123",
    });

    expect(issues.errors).toEqual([]);
    expect(issues.warnings).toEqual([
      "Unknown contact.upserted fields were ignored: campagnId, phone_number. Check them for typos.",
    ]);
  });

  it("summarizes instead of listing an unbounded number of unknown fields", () => {
    const data: Record<string, unknown> = {
      externalId: "ext_1",
      phoneNumber: "+14155550123",
    };
    for (let i = 0; i < 14; i += 1) data[`extra${i}`] = i;

    const issues = validateInboundEventData("contact.upserted", data);

    expect(issues.warnings).toHaveLength(1);
    expect(issues.warnings[0]).toContain("extra9");
    expect(issues.warnings[0]).toContain("and 4 more");
  });

  it("validates the delete events against their own single field", () => {
    expect(
      validateInboundEventData("contact.deleted", { externalId: "ext_1" }),
    ).toEqual({ errors: [], warnings: [] });

    expect(validateInboundEventData("company.deleted", {}).errors).toEqual([
      "data.externalId is required",
    ]);
  });

  it("requires a company name on company.upserted", () => {
    expect(
      validateInboundEventData("company.upserted", { externalId: "ext_1" })
        .errors,
    ).toEqual(["data.name is required"]);
  });
});
