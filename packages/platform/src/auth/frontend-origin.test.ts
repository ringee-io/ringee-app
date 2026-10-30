import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { trustedFrontendOrigin } from "./frontend-origin";

const previous = process.env.FRONTEND_URL;
beforeAll(() => {
  process.env.FRONTEND_URL = "https://app.ringee.io";
});
afterAll(() => {
  process.env.FRONTEND_URL = previous;
});

describe("trustedFrontendOrigin", () => {
  it("honors the configured and the known Ringee frontends", () => {
    expect(trustedFrontendOrigin("https://app.ringee.io/")).toBe(
      "https://app.ringee.io",
    );
    expect(trustedFrontendOrigin("https://phone.ringee.io")).toBe(
      "https://phone.ringee.io",
    );
  });

  it("refuses any other site", () => {
    expect(trustedFrontendOrigin("https://evil.example")).toBeNull();
    expect(
      trustedFrontendOrigin("https://app.ringee.io.evil.example"),
    ).toBeNull();
    expect(trustedFrontendOrigin("javascript:alert(1)")).toBeNull();
    expect(trustedFrontendOrigin("not a url")).toBeNull();
    expect(trustedFrontendOrigin(undefined)).toBeNull();
  });
});
