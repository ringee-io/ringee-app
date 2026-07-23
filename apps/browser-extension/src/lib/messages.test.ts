import { describe, expect, it } from "vitest";
import {
  MessageType,
  isCallCommand,
  isDialRequest,
  isStartCall,
} from "@ringee/dialer-core/contracts";

// The service worker and offscreen document validate every cross-context
// message with these shared guards before acting. These tests assert the
// extension's real message shapes pass/fail validation as expected.
describe("extension message validation", () => {
  it("accepts a content-script DIAL_REQUEST with page origin", () => {
    const msg = {
      type: MessageType.DialRequest,
      target: {
        destination: "+18095551234",
        name: "Jane Doe",
        origin: { url: "https://app.example.com", title: "CRM" },
      },
    };
    expect(isDialRequest(msg)).toBe(true);
  });

  it("rejects a DIAL_REQUEST without a destination", () => {
    expect(
      isDialRequest({ type: MessageType.DialRequest, target: { name: "x" } }),
    ).toBe(false);
  });

  it("accepts a START_CALL carrying backend creds + caller ID", () => {
    expect(
      isStartCall({
        type: MessageType.StartCall,
        sip: { username: "u", password: "p" },
        callerId: "+14155550000",
        destination: "+18095551234",
        userId: "user_1",
      }),
    ).toBe(true);
  });

  it("rejects a START_CALL missing SIP credentials", () => {
    expect(
      isStartCall({
        type: MessageType.StartCall,
        sip: { username: "u" },
        callerId: "+14155550000",
        destination: "+18095551234",
        userId: "user_1",
      }),
    ).toBe(false);
  });

  it("validates in-call commands from the side panel", () => {
    expect(
      isCallCommand({
        type: MessageType.CallCommand,
        command: { action: "mute", value: true },
      }),
    ).toBe(true);
    expect(
      isCallCommand({
        type: MessageType.CallCommand,
        command: { action: "dtmf", digit: "9" },
      }),
    ).toBe(true);
    expect(
      isCallCommand({
        type: MessageType.CallCommand,
        command: { action: "dtmf", digit: "D" },
      }),
    ).toBe(true);
    expect(
      isCallCommand({
        type: MessageType.CallCommand,
        command: { action: "dtmf", digit: "+" },
      }),
    ).toBe(false);
  });
});
