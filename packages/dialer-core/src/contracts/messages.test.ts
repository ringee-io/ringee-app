import { describe, expect, it } from "vitest";
import {
  MessageType,
  isRingeeMessage,
  isDialRequest,
  isDialResult,
  isStartCall,
  isCallCommand,
  isCallEvent,
  isCallSnapshot,
  isCallQuality,
  isRequestSnapshot,
  isEndCall,
  isRequestAuthToken,
  isAuthTokenResult,
} from "./messages";

describe("isRingeeMessage", () => {
  it("accepts any RINGEE_ prefixed message", () => {
    expect(isRingeeMessage({ type: MessageType.RequestSnapshot })).toBe(true);
  });
  it("rejects foreign / malformed messages", () => {
    expect(isRingeeMessage({ type: "OTHER_THING" })).toBe(false);
    expect(isRingeeMessage(null)).toBe(false);
    expect(isRingeeMessage("RINGEE_DIAL_REQUEST")).toBe(false);
    expect(isRingeeMessage({})).toBe(false);
  });
});

describe("isDialRequest", () => {
  it("requires a non-empty destination", () => {
    expect(
      isDialRequest({
        type: MessageType.DialRequest,
        target: { destination: "+14155552671" },
      }),
    ).toBe(true);
  });
  it("rejects a missing/empty target", () => {
    expect(isDialRequest({ type: MessageType.DialRequest })).toBe(false);
    expect(
      isDialRequest({
        type: MessageType.DialRequest,
        target: { destination: "" },
      }),
    ).toBe(false);
    expect(isDialRequest({ type: MessageType.CallCommand })).toBe(false);
  });
});

describe("isDialResult", () => {
  it("accepts a placed or refused dial", () => {
    expect(isDialResult({ placed: true })).toBe(true);
    expect(isDialResult({ placed: false })).toBe(true);
  });
  it("rejects anything else, a closed channel's undefined included", () => {
    expect(isDialResult(undefined)).toBe(false);
    expect(isDialResult({})).toBe(false);
    expect(isDialResult({ placed: "yes" })).toBe(false);
  });
});

describe("isStartCall", () => {
  const valid = {
    type: MessageType.StartCall,
    sip: { username: "u", password: "p" },
    callerId: "+14155550000",
    destination: "+14155552671",
    userId: "user_123",
  };
  it("accepts a fully-formed start-call", () => {
    expect(isStartCall(valid)).toBe(true);
  });
  it("rejects when credentials or attribution are missing", () => {
    expect(isStartCall({ ...valid, sip: { username: "u" } })).toBe(false);
    expect(isStartCall({ ...valid, callerId: undefined })).toBe(false);
    expect(isStartCall({ ...valid, userId: undefined })).toBe(false);
  });
});

describe("isCallCommand", () => {
  it("accepts hangup", () => {
    expect(
      isCallCommand({
        type: MessageType.CallCommand,
        command: { action: "hangup" },
      }),
    ).toBe(true);
  });
  it("validates mute/hold boolean values", () => {
    expect(
      isCallCommand({
        type: MessageType.CallCommand,
        command: { action: "mute", value: true },
      }),
    ).toBe(true);
    expect(
      isCallCommand({
        type: MessageType.CallCommand,
        command: { action: "mute", value: "yes" },
      }),
    ).toBe(false);
  });
  it("validates dtmf digits", () => {
    expect(
      isCallCommand({
        type: MessageType.CallCommand,
        command: { action: "dtmf", digit: "5" },
      }),
    ).toBe(true);
    expect(
      isCallCommand({
        type: MessageType.CallCommand,
        command: { action: "dtmf", digit: "A" },
      }),
    ).toBe(true);
    expect(
      isCallCommand({
        type: MessageType.CallCommand,
        command: { action: "dtmf", digit: "+" },
      }),
    ).toBe(false);
  });
  it("rejects unknown actions", () => {
    expect(
      isCallCommand({
        type: MessageType.CallCommand,
        command: { action: "explode" },
      }),
    ).toBe(false);
  });
  it("carries an optional per-press id, as a string", () => {
    const command = { action: "hangup" } as const;
    expect(
      isCallCommand({ type: MessageType.CallCommand, id: "press-1", command }),
    ).toBe(true);
    expect(
      isCallCommand({ type: MessageType.CallCommand, id: 7, command }),
    ).toBe(false);
  });
});

describe("isCallEvent / isCallSnapshot", () => {
  it("accepts well-formed events and snapshots", () => {
    expect(isCallEvent({ type: MessageType.CallEvent, state: "active" })).toBe(
      true,
    );
    expect(
      isCallSnapshot({ type: MessageType.CallSnapshot, state: "idle" }),
    ).toBe(true);
  });
  it("rejects when state is missing", () => {
    expect(isCallEvent({ type: MessageType.CallEvent })).toBe(false);
    expect(isCallSnapshot({ type: MessageType.CallSnapshot })).toBe(false);
  });
});

describe("isRequestSnapshot / isEndCall / isRequestAuthToken", () => {
  it("accepts its own request only", () => {
    expect(isRequestSnapshot({ type: MessageType.RequestSnapshot })).toBe(true);
    expect(isEndCall({ type: MessageType.EndCall })).toBe(true);
    expect(isEndCall({ type: MessageType.RequestSnapshot })).toBe(false);
    expect(isRequestAuthToken({ type: MessageType.RequestAuthToken })).toBe(
      true,
    );
    expect(isRequestSnapshot({ type: MessageType.RequestAuthToken })).toBe(
      false,
    );
    expect(isRequestAuthToken({ type: MessageType.RequestSnapshot })).toBe(
      false,
    );
    expect(isRequestAuthToken(MessageType.RequestAuthToken)).toBe(false);
    expect(isRequestAuthToken(undefined)).toBe(false);
  });
});

describe("isAuthTokenResult", () => {
  it("accepts a token or an explicit null", () => {
    expect(isAuthTokenResult({ token: "eyJ.a.b" })).toBe(true);
    expect(isAuthTokenResult({ token: null })).toBe(true);
  });
  it("accepts whose session the token is, or that it has none", () => {
    expect(
      isAuthTokenResult({ token: "eyJ.a.b", userId: "user_1", orgId: "org_1" }),
    ).toBe(true);
    expect(
      isAuthTokenResult({ token: "eyJ.a.b", userId: "user_1", orgId: null }),
    ).toBe(true);
    expect(isAuthTokenResult({ token: "eyJ.a.b", userId: 1 })).toBe(false);
    expect(isAuthTokenResult({ token: "eyJ.a.b", orgId: {} })).toBe(false);
  });
  it("rejects anything else, a closed channel's undefined included", () => {
    expect(isAuthTokenResult(undefined)).toBe(false);
    expect(isAuthTokenResult({})).toBe(false);
    expect(isAuthTokenResult({ token: "" })).toBe(false);
    expect(isAuthTokenResult({ token: 42 })).toBe(false);
    expect(isAuthTokenResult({ placed: true })).toBe(false);
  });
});

describe("isCallQuality", () => {
  const summary = {
    measuredSec: 60,
    capturedSec: 59.8,
    captureGaps: 0,
    packetsSent: 3000,
    sentPerSec: 50,
    sendGaps: 0,
    packetsReceived: 3000,
    packetsLost: 0,
    warnings: {},
  };
  it("accepts a call's audio record", () => {
    expect(isCallQuality({ type: MessageType.CallQuality, summary })).toBe(
      true,
    );
  });
  it("rejects a record without its measurements", () => {
    expect(isCallQuality({ type: MessageType.CallQuality })).toBe(false);
    expect(
      isCallQuality({
        type: MessageType.CallQuality,
        summary: { ...summary, measuredSec: "60" },
      }),
    ).toBe(false);
    expect(isCallQuality({ type: MessageType.CallEvent, summary })).toBe(false);
  });
  it("rejects a partial record", () => {
    for (const key of Object.keys(summary)) {
      const partial: Record<string, unknown> = { ...summary };
      delete partial[key];
      expect(
        isCallQuality({ type: MessageType.CallQuality, summary: partial }),
      ).toBe(false);
    }
  });
});
