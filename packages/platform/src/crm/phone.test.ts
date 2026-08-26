import { describe, it, expect } from "vitest";
import { normalizePhoneE164, phoneMatchesSuffix, phoneSuffix } from "./phone";

describe("normalizePhoneE164", () => {
  it("keeps a valid international number as-is", () => {
    expect(normalizePhoneE164("+14155552671")).toBe("+14155552671");
    expect(normalizePhoneE164("+34 600 123 456")).toBe("+34600123456");
    expect(normalizePhoneE164("  +14155552671  ")).toBe("+14155552671");
  });

  it("resolves a country-less number against the default region", () => {
    // The old regex produced "+4155552671" — a different, wrong number.
    expect(normalizePhoneE164("(415) 555-2671")).toBe("+14155552671");
    expect(normalizePhoneE164("415-555-2671")).toBe("+14155552671");
  });

  it("honours an explicit region", () => {
    expect(normalizePhoneE164("600 123 456", "ES")).toBe("+34600123456");
  });

  it("drops an extension instead of appending it to the number", () => {
    // The old regex returned "+1415555267122".
    expect(normalizePhoneE164("+1 415 555 2671 ext 22")).toBe("+14155552671");
  });

  it("still normalizes unparseable-but-plausible CRM values", () => {
    // Kept lenient on purpose: CRM records hold numbers libphonenumber cannot
    // parse, and they matched each other under the previous behaviour.
    expect(normalizePhoneE164("555-2671")).toBe("+5552671");
    expect(normalizePhoneE164("123456")).toBe("+123456");
  });

  it("rejects empty and out-of-range input", () => {
    expect(normalizePhoneE164(null)).toBeNull();
    expect(normalizePhoneE164(undefined)).toBeNull();
    expect(normalizePhoneE164("")).toBeNull();
    expect(normalizePhoneE164("   ")).toBeNull();
    expect(normalizePhoneE164("12345")).toBeNull();
  });
});

describe("phoneSuffix / phoneMatchesSuffix", () => {
  it("matches numbers that differ only by prefix", () => {
    expect(phoneSuffix("+14155552671")).toBe("155552671");
    expect(phoneMatchesSuffix("+14155552671", "4155552671")).toBe(true);
    expect(phoneMatchesSuffix("+14155552671", "+14155559999")).toBe(false);
  });
});
