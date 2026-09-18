import { describe, expect, it, vi } from "vitest";

vi.mock("@telnyx/webrtc", () => ({ TelnyxRTC: class {} }));

import {
  EXTERNAL_CARRIER_CALL_HEADER,
  carrierCallFailure,
} from "./carrier-route";
import {
  getCallDestination,
  getCarrierCallToken,
  placeCall,
  type PlaceCallOptions,
} from "./telnyx-engine";

function setup() {
  const newCall = vi.fn((options) => ({ options }));
  const options = {
    client: { newCall },
    destination: "+12125550199",
    callerId: "+13055550101",
    userId: "user",
    organizationId: "org",
  } as unknown as PlaceCallOptions;
  return { newCall, options };
}

describe("placeCall through the existing WebRTC engine", () => {
  it("leaves Ringee-number calls exactly as before", () => {
    const { newCall, options } = setup();
    const call = placeCall(options);
    const sent = newCall.mock.calls[0][0];
    expect(sent.destinationNumber).toBe("+12125550199");
    expect(sent.callerNumber).toBe("+13055550101");
    expect(sent).not.toHaveProperty("userVariables");
    expect(sent.customHeaders).toEqual([
      { name: "From", value: "sip:+13055550101@sip.telnyx.com" },
      { name: "P-Asserted-Identity", value: "sip:+13055550101@sip.telnyx.com" },
      {
        name: "P-Preferred-Identity",
        value: "sip:+13055550101@sip.telnyx.com",
      },
      { name: "X-User-Id", value: "user" },
      { name: "X-Organization-Id", value: "org" },
    ]);
    expect(getCarrierCallToken(call as never)).toBeUndefined();
    expect(getCallDestination(call as never)).toBe("+12125550199");
  });

  it("sends a carrier leg to the server-issued destination without identity headers", () => {
    const { newCall, options } = setup();
    const call = placeCall({
      ...options,
      carrierRoute: {
        destinationUri: "sip:+12125550199@generated.example.net",
        callToken: "signed-token",
      },
      extraHeaders: [{ name: "X-Extra", value: "kept" }],
    });
    const sent = newCall.mock.calls[0][0];
    expect(sent.destinationNumber).toBe(
      "sip:+12125550199@generated.example.net",
    );
    expect(sent).not.toHaveProperty("callerNumber");
    expect(sent.customHeaders).toEqual([
      { name: EXTERNAL_CARRIER_CALL_HEADER, value: "signed-token" },
      { name: "X-Extra", value: "kept" },
    ]);
    expect(sent.audio).toBe(true);
    expect(sent.keepConnectionAliveOnSocketClose).toBe(true);
    // The UI and contact lookup keep seeing the number that was dialed.
    expect(getCallDestination(call as never)).toBe("+12125550199");
    expect(getCarrierCallToken(call as never)).toBe("signed-token");
  });
});

describe("carrierCallFailure", () => {
  it.each([
    [401, "rejected"],
    [403, "rejected"],
    ["407", "rejected"],
    [404, "destination"],
    [484, "destination"],
    [604, "destination"],
    [408, "timeout"],
    [504, "timeout"],
    [500, "unavailable"],
    [503, "unavailable"],
    [488, "unavailable"],
  ])("classifies SIP %s as %s", (code, expected) => {
    expect(carrierCallFailure(code)).toBe(expected);
  });

  it.each([undefined, null, "", "abc", 200, 180, 480, 486, 487, 600, 603])(
    "treats %s as an ordinary ending",
    (code) => {
      expect(carrierCallFailure(code)).toBeNull();
    },
  );
});
