import { describe, expect, it, vi } from "vitest";

vi.mock("@telnyx/webrtc", () => ({ TelnyxRTC: class {} }));

import {
  TELNYX_EVENTS,
  getCallPeerConnection,
  onCallWarning,
  placeCall,
  type PlaceCallOptions,
} from "./telnyx-engine";

function options(extra: Partial<PlaceCallOptions> = {}) {
  const newCall = vi.fn((sent) => ({ options: sent }));
  return {
    newCall,
    options: {
      client: { newCall },
      destination: "+12125550199",
      callerId: "+13055550101",
      userId: "user",
      ...extra,
    } as unknown as PlaceCallOptions,
  };
}

describe("placeCall with the host's own microphone stream", () => {
  it("hands the stream to the SDK so it does not open the device again", () => {
    const localStream = { id: "mic" } as unknown as MediaStream;
    const { newCall, options: sent } = options({ localStream });
    placeCall(sent);
    expect(newCall.mock.calls[0]![0].localStream).toBe(localStream);
  });

  it("lets the SDK capture the microphone when the host has none", () => {
    const { newCall, options: sent } = options();
    placeCall(sent);
    expect(newCall.mock.calls[0]![0]).not.toHaveProperty("localStream");
  });
});

describe("onCallWarning", () => {
  it("hands over the warning's name only, and unsubscribes", () => {
    const handlers = new Map<string, (event: unknown) => void>();
    const client = {
      on: vi.fn((name: string, fn: (event: unknown) => void) =>
        handlers.set(name, fn),
      ),
      off: vi.fn((name: string) => handlers.delete(name)),
    };
    const names: string[] = [];
    const stop = onCallWarning(client as never, (name) => names.push(name));

    handlers.get(TELNYX_EVENTS.warning)?.({
      warning: { code: 31002, name: "HIGH_JITTER", message: "…" },
      sessionId: "s",
    });
    handlers.get(TELNYX_EVENTS.warning)?.({});
    stop();

    expect(names).toEqual(["HIGH_JITTER", "UNKNOWN"]);
    expect(handlers.has(TELNYX_EVENTS.warning)).toBe(false);
  });
});

describe("getCallPeerConnection", () => {
  it("reads the leg's current connection, if it has one yet", () => {
    const instance = { id: "pc" } as unknown as RTCPeerConnection;
    expect(getCallPeerConnection({ peer: { instance } } as never)).toBe(
      instance,
    );
    expect(getCallPeerConnection({} as never)).toBeUndefined();
    expect(getCallPeerConnection(null)).toBeUndefined();
  });
});
