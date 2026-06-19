import { describe, expect, it } from "vitest";
import {
  MessageType,
  isRingeeMessage,
  isDialRequest,
  isStartCall,
  isCallCommand,
  isCallEvent,
  isCallSnapshot,
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
      isDialRequest({ type: MessageType.DialRequest, target: { destination: "" } }),
    ).toBe(false);
    expect(isDialRequest({ type: MessageType.CallCommand })).toBe(false);
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
      isCallCommand({ type: MessageType.CallCommand, command: { action: "hangup" } }),
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
        command: { action: "dtmf", digit: "X" },
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
