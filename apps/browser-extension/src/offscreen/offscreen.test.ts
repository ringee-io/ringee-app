import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageType, type CallEventMsg } from "@ringee/dialer-core/contracts";

// A stand-in for @telnyx/webrtc 2.27.9 as the engine sees it. Its
// `call.hangup()` reports `hangup` synchronously, THEN sends the BYE over the
// socket, then reports `destroy` — the order the END CALL bug hid in.
const sdk = vi.hoisted(() => {
  const state = {
    log: [] as string[],
    connected: false,
    readyLater: false,
    fireReady: () => {},
    onUpdate: null as ((call: unknown) => void) | null,
    calls: [] as Array<{ state: string; hangup: () => Promise<void> }>,
    dtmf: [] as string[],
  };
  const client = {
    handlers: {} as Record<string, () => void>,
    on(event: string, fn: () => void) {
      this.handlers[event] = fn;
    },
    off() {},
    connect() {
      state.connected = true;
      state.fireReady = () => client.handlers["telnyx.ready"]?.();
      if (!state.readyLater) state.fireReady();
    },
    disconnect() {
      state.connected = false;
      state.log.push("disconnect");
    },
  };
  function newCall() {
    const call = {
      state: "new",
      telnyxIDs: { telnyxSessionId: "session-1" },
      set(next: string) {
        call.state = next;
        state.onUpdate?.(call);
      },
      hangup: async () => {
        call.set("hangup");
        await Promise.resolve();
        state.log.push(state.connected ? "bye sent" : "bye lost");
        call.set("destroy");
      },
    };
    state.calls.push(call);
    call.set("trying");
    return call;
  }
  return { state, client, newCall };
});

vi.mock("@ringee/dialer-core/engine", () => ({
  createTelnyxClient: () => sdk.client,
  placeCall: () => sdk.newCall(),
  muteCall: async () => {},
  holdCall: async () => {},
  hangupCall: async (call: { hangup: () => Promise<void> } | null) =>
    call?.hangup(),
  sendDtmf: (_call: unknown, digit: string) => sdk.state.dtmf.push(digit),
  onCallUpdate: (_client: unknown, handler: (call: unknown) => void) => {
    sdk.state.onUpdate = handler;
    return () => {};
  },
  mapTelnyxState: (telnyxState: string) =>
    ({ new: "connecting", trying: "connecting", active: "active" })[
      telnyxState
    ] ??
    (["hangup", "destroy", "purge"].includes(telnyxState)
      ? "ended"
      : "connecting"),
  TELNYX_EVENTS: { ready: "telnyx.ready", error: "telnyx.error" },
  OUTBOUND_RINGBACK_VOLUME: 0.3,
}));

const START_CALL = {
  type: MessageType.StartCall,
  sip: { username: "sip-user", password: "sip-pass" },
  callerId: "+14155550000",
  destination: "+18095551234",
  userId: "user_1",
};

const command = (id: string, cmd: Record<string, unknown>) => ({
  type: MessageType.CallCommand,
  id,
  command: cmd,
});

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
};

let deliver: (msg: unknown) => void;
let sent: unknown[];

beforeEach(async () => {
  Object.assign(sdk.state, {
    log: [],
    connected: false,
    readyLater: false,
    onUpdate: null,
    calls: [],
    dtmf: [],
  });
  sdk.client.handlers = {};
  sent = [];
  vi.stubGlobal("document", { getElementById: () => null });
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) },
  });
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: async (msg: unknown) => {
        sent.push(msg);
      },
      onMessage: {
        addListener: (fn: (msg: unknown) => void) => {
          deliver = fn;
        },
      },
    },
  });
  vi.resetModules();
  await import("./offscreen");
});

afterEach(() => vi.unstubAllGlobals());

const reported = () =>
  sent
    .filter(
      (m): m is CallEventMsg =>
        (m as CallEventMsg).type === MessageType.CallEvent,
    )
    .map((m) => m.state);

describe("offscreen engine — END CALL", () => {
  it("sends the BYE before tearing the line down", async () => {
    deliver(START_CALL);
    await flush();

    deliver(command("press-1", { action: "hangup" }));
    await flush();

    expect(sdk.state.log).toEqual(["bye sent", "disconnect"]);
    expect(reported()).toEqual(["connecting", "ended"]);
  });

  it("acts on a press once, though it arrives twice", async () => {
    deliver(START_CALL);
    await flush();
    const hangup = vi.spyOn(sdk.state.calls[0]!, "hangup");

    // From the side panel, then forwarded by the worker.
    deliver(command("press-1", { action: "dtmf", digit: "5" }));
    deliver(command("press-1", { action: "dtmf", digit: "5" }));
    deliver(command("press-2", { action: "hangup" }));
    deliver(command("press-2", { action: "hangup" }));
    await flush();

    expect(sdk.state.dtmf).toEqual(["5"]);
    expect(hangup).toHaveBeenCalledTimes(1);
  });

  it("calls the dial off when hung up before its leg exists", async () => {
    sdk.state.readyLater = true;
    deliver(START_CALL);
    await flush();

    // Still logging in: no call to end yet.
    deliver(command("press-1", { action: "hangup" }));
    sdk.state.fireReady();
    await flush();

    expect(sdk.state.calls).toHaveLength(0);
    expect(reported()).toEqual(["idle"]);
    expect(sdk.state.log).toEqual(["disconnect"]);
  });
});
