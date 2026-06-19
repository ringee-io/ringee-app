import { describe, expect, it } from "vitest";
import { extractNumbers, resolveDialNumber } from "./detect";
import { normalize, isValidPhoneNumber, formatForDisplay } from "./normalize";

describe("normalize", () => {
  it("normalizes a US national number to E.164", () => {
    expect(normalize("(415) 555-2671", "US")).toBe("+14155552671");
  });

  it("keeps an already-E.164 number", () => {
    expect(normalize("+14155552671", "US")).toBe("+14155552671");
  });

  it("returns null for non-numbers and digit soup", () => {
    expect(normalize("not a phone")).toBeNull();
    expect(normalize("12345")).toBeNull();
    expect(normalize("")).toBeNull();
  });

  it("uses the region hint for local numbers", () => {
    // Same digits, different country interpretations.
    expect(normalize("020 7946 0958", "GB")).toBe("+442079460958");
  });

  it("isValidPhoneNumber agrees with normalize", () => {
    expect(isValidPhoneNumber("(415) 555-2671", "US")).toBe(true);
    expect(isValidPhoneNumber("nope")).toBe(false);
  });

  it("formats for display without throwing on junk", () => {
    expect(formatForDisplay("+14155552671", "US")).toContain("415");
    expect(formatForDisplay("junk")).toBe("junk");
  });
});

describe("extractNumbers", () => {
  it("finds a valid number embedded in text", () => {
    const found = extractNumbers("Call me at +1 415 555 2671 today", "US");
    expect(found).toHaveLength(1);
    expect(found[0].e164).toBe("+14155552671");
  });

  it("ignores digit soup (dates, ids, zips)", () => {
    const found = extractNumbers(
      "Order #100245 placed 2026-06-16, ZIP 90210",
      "US",
    );
    expect(found).toHaveLength(0);
  });

  it("dedupes repeated numbers within a chunk", () => {
    const found = extractNumbers(
      "Reach us on +1 415 555 2671 or +1 415 555 2671",
      "US",
    );
    expect(found).toHaveLength(1);
  });

  it("returns nothing for short / empty text", () => {
    expect(extractNumbers("")).toHaveLength(0);
    expect(extractNumbers("12")).toHaveLength(0);
  });

  it("reports the raw span it matched", () => {
    const text = "Phone: +14155552671.";
    const [m] = extractNumbers(text, "US");
    expect(text.slice(m.startsAt, m.endsAt)).toBe(m.raw);
    expect(m.raw).toContain("4155552671");
  });
});

describe("resolveDialNumber", () => {
  it("keeps a clean international number regardless of region", () => {
    // Default region is US, yet a +34/+44 number must resolve worldwide.
    expect(resolveDialNumber("+34 612 345 678")).toBe("+34612345678");
    expect(resolveDialNumber("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("recovers a number buried in label text (the right-click case)", () => {
    expect(resolveDialNumber("Tel: +1 809 555 1234")).toBe("+18095551234");
    expect(resolveDialNumber("Llámame al +44 20 7946 0958")).toBe(
      "+442079460958",
    );
  });

  it("uses the region hint for a bare local number", () => {
    expect(resolveDialNumber("020 7946 0958", "GB")).toBe("+442079460958");
  });

  it("accepts a possible (right-shaped) number even if not strictly valid", () => {
    // 999 isn't an assigned NANP area code, but the shape is dialable — the
    // button should still light up rather than block the user.
    expect(resolveDialNumber("+1 999 999 9999")).toBe("+19999999999");
  });

  it("returns null when there is no valid number", () => {
    expect(resolveDialNumber("not a phone")).toBeNull();
    expect(resolveDialNumber("")).toBeNull();
  });
});
