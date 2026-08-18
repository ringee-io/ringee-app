/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Offer } from "@ringee/database";
import { OfferActionService } from "./offer-action.service";

/**
 * Submission rules come entirely from `actionConfig`. "Trustpilot" appears here
 * only as a value in `allowedDomains` — never as a type, a flag, or a branch.
 */
function urlOffer(overrides: Record<string, unknown> = {}): Offer {
  return {
    actionConfig: {
      type: "EXTERNAL_URL_SUBMISSION",
      field: "url",
      allowedDomains: ["trustpilot.com"],
      unique: true,
      ...overrides,
    },
  } as unknown as Offer;
}

describe("OfferActionService — external URL submission", () => {
  const service = new OfferActionService();

  it("accepts a valid URL on an allowed domain", () => {
    const result = service.normalize(urlOffer(), {
      url: "https://www.trustpilot.com/reviews/abc123",
    });
    assert.equal(result.data.url, "https://www.trustpilot.com/reviews/abc123");
  });

  it("rejects a missing value", () => {
    assert.throws(() => service.normalize(urlOffer(), {}), /required/i);
    assert.throws(
      () => service.normalize(urlOffer(), { url: "   " }),
      /required/i,
    );
  });

  it("rejects something that is not a URL", () => {
    assert.throws(
      () => service.normalize(urlOffer(), { url: "not a url at all" }),
      /valid URL/i,
    );
  });

  it("rejects a URL on a different domain", () => {
    assert.throws(
      () =>
        service.normalize(urlOffer(), {
          url: "https://g2.com/reviews/ringee",
        }),
      /must point to/i,
    );
  });

  it("rejects a lookalike domain that only ends with the allowed one", () => {
    assert.throws(
      () =>
        service.normalize(urlOffer(), {
          url: "https://trustpilot.com.evil.test/reviews/abc",
        }),
      /must point to/i,
    );
  });

  it("accepts a subdomain of an allowed domain", () => {
    const result = service.normalize(urlOffer(), {
      url: "https://uk.trustpilot.com/reviews/abc",
    });
    assert.equal(result.data.url, "https://uk.trustpilot.com/reviews/abc");
  });

  it("gives two spellings of the same link the same fingerprint", () => {
    // The unique index is what actually blocks a duplicate submission; this is
    // the normalization that makes the index effective.
    const a = service.normalize(urlOffer(), {
      url: "https://www.trustpilot.com/reviews/abc123/",
    });
    const b = service.normalize(urlOffer(), {
      url: "http://trustpilot.com/reviews/abc123?utm_source=email",
    });
    assert.equal(a.fingerprint, b.fingerprint);
    assert.equal(a.fingerprint, "trustpilot.com/reviews/abc123");
  });

  it("distinguishes different review pages", () => {
    const a = service.normalize(urlOffer(), {
      url: "https://trustpilot.com/reviews/abc123",
    });
    const b = service.normalize(urlOffer(), {
      url: "https://trustpilot.com/reviews/xyz789",
    });
    assert.notEqual(a.fingerprint, b.fingerprint);
  });

  it("skips uniqueness when the offer does not ask for it", () => {
    const result = service.normalize(urlOffer({ unique: false }), {
      url: "https://trustpilot.com/reviews/abc",
    });
    assert.equal(result.fingerprint, null);
  });

  it("allows any domain when the offer lists none", () => {
    const result = service.normalize(urlOffer({ allowedDomains: [] }), {
      url: "https://example.test/feedback",
    });
    assert.equal(result.data.url, "https://example.test/feedback");
  });

  it("asks for nothing when the action is a plain CTA", () => {
    const offer = { actionConfig: { type: "CTA_ONLY" } } as unknown as Offer;
    assert.equal(service.requiresSubmission(offer), false);
    assert.deepEqual(service.normalize(offer, undefined), {
      data: {},
      fingerprint: null,
    });
  });
});
