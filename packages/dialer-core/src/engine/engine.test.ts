import { describe, expect, it } from "vitest";
// Import from the telnyx-free module so the test runs in plain Node.
import { buildCallHeaders } from "./attribution";

// buildCallHeaders is the single, shared definition of how a call is attributed
// to a user/org and which caller ID it presents. The web app and the extension
// both rely on it, so a call lands identically in Ringee no matter the origin.
describe("buildCallHeaders (shared call attribution)", () => {
  it("emits the SIP identity + user header for a personal call", () => {
    const headers = buildCallHeaders({
      callerId: "+14155550000",
      userId: "user_123",
    });
    const byName = Object.fromEntries(headers.map((h) => [h.name, h.value]));
    expect(byName["From"]).toBe("sip:+14155550000@sip.telnyx.com");
    expect(byName["P-Asserted-Identity"]).toBe(
      "sip:+14155550000@sip.telnyx.com",
    );
    expect(byName["X-User-Id"]).toBe("user_123");
    expect(byName["X-Organization-Id"]).toBeUndefined();
  });

  it("adds the organization header only when an org is present", () => {
    const headers = buildCallHeaders({
      callerId: "+14155550000",
      userId: "user_123",
      organizationId: "org_456",
    });
    const org = headers.find((h) => h.name === "X-Organization-Id");
    expect(org?.value).toBe("org_456");
  });

  it("uses the provided caller ID verbatim (never a hardcoded number)", () => {
    const headers = buildCallHeaders({
      callerId: "+442079460958",
      userId: "u",
    });
    expect(headers.every((h) => !h.value.includes("17869460882"))).toBe(true);
    expect(headers[0].value).toContain("+442079460958");
  });
});
