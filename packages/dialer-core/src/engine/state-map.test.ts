import { describe, expect, it } from "vitest";
import { mapTelnyxState, TELNYX_TO_STATE } from "./state-map";

describe("mapTelnyxState", () => {
  it("maps the key Telnyx lifecycle states", () => {
    expect(mapTelnyxState("new")).toBe("connecting");
    expect(mapTelnyxState("ringing")).toBe("ringing");
    expect(mapTelnyxState("active")).toBe("active");
    expect(mapTelnyxState("held")).toBe("held");
    expect(mapTelnyxState("hangup")).toBe("ended");
    expect(mapTelnyxState("destroy")).toBe("ended");
  });

  it("defaults unknown / missing states to connecting", () => {
    expect(mapTelnyxState("something-new")).toBe("connecting");
    expect(mapTelnyxState(undefined)).toBe("connecting");
  });

  it("never maps a known state to idle/requesting (those are app-level)", () => {
    for (const mapped of Object.values(TELNYX_TO_STATE)) {
      expect(["idle", "requesting"]).not.toContain(mapped);
    }
  });
});
