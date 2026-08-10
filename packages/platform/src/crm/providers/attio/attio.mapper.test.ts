import { describe, it, expect } from "vitest";
import { buildAttioPersonName } from "./attio.mapper";

describe("buildAttioPersonName", () => {
  // Attio's object syntax requires first_name, last_name AND full_name to all
  // be strings — a missing key is a non-retryable 400 that kills the call-log
  // note, so every non-null result must carry the three of them.
  const assertComplete = (v: unknown) => {
    expect(v).toEqual({
      first_name: expect.any(String),
      last_name: expect.any(String),
      full_name: expect.any(String),
    });
  };

  it("splits a display-name-only contact (the shape that used to 400)", () => {
    const v = buildAttioPersonName({
      displayName: "Brian Foster",
      firstName: null,
      lastName: null,
    });
    assertComplete(v);
    expect(v).toEqual({
      first_name: "Brian",
      last_name: "Foster",
      full_name: "Brian Foster",
    });
  });

  it("keeps an empty last name for a single-token display name", () => {
    const v = buildAttioPersonName({ displayName: "Brian" });
    assertComplete(v);
    expect(v?.last_name).toBe("");
  });

  it("puts every extra token in the last name", () => {
    expect(
      buildAttioPersonName({ displayName: "Ana María de la Cruz" }),
    ).toEqual({
      first_name: "Ana",
      last_name: "María de la Cruz",
      full_name: "Ana María de la Cruz",
    });
  });

  it("prefers explicit first/last and derives full_name from them", () => {
    expect(
      buildAttioPersonName({ firstName: "Ada", lastName: "Lovelace" }),
    ).toEqual({
      first_name: "Ada",
      last_name: "Lovelace",
      full_name: "Ada Lovelace",
    });
  });

  it("fills the missing half when only one of first/last is known", () => {
    const v = buildAttioPersonName({ displayName: "Ada L.", firstName: "Ada" });
    assertComplete(v);
    expect(v).toEqual({
      first_name: "Ada",
      last_name: "",
      full_name: "Ada L.",
    });
  });

  it("returns null when there is no usable name", () => {
    expect(buildAttioPersonName({})).toBeNull();
    expect(
      buildAttioPersonName({ displayName: "  ", firstName: " ", lastName: "" }),
    ).toBeNull();
  });
});
