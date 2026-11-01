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
    calls: [] as Array<{
      state: string;
      finalized: boolean;
      set: (next: string) => void;
      hangup: () => Promise<void>;
    }>,
    dtmf: [] as string[],
    placed: [] as Array<Record<string, unknown>>,
    onWarning: null as ((name: string) => void) | null,
    probe: {
      started: 0,
      warnings: [] as string[],
      summary: null as Record<string, unknown> | null,
    },
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
    // Like `BrowserSession.disconnect()`: a call the client still holds is
    // set to `purge` first, reported synchronously.
    disconnect() {
      state.connected = false;
      state.log.push("disconnect");
      for (const call of state.calls) if (!call.finalized) call.set("purge");
    },
  };
  function newCall() {
    const call = {
      state: "new",
      finalized: false,
      telnyxIDs: { telnyxSessionId: "session-1" },
      set(next: string) {
        call.state = next;
        state.onUpdate?.(call);
        // The SDK drops a leg (`_finalize`) only after reporting its end.
        if (next === "destroy" || next === "purge") call.finalized = true;
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
  placeCall: (options: Record<string, unknown>) => {
    sdk.state.placed.push(options);
    return sdk.newCall();
  },
  muteCall: async () => {},
  holdCall: async () => {},
  hangupCall: async (call: { hangup: () => Promise<void> } | null) =>
    call?.hangup(),
  sendDtmf: (_call: unknown, digit: string) => sdk.state.dtmf.push(digit),
  onCallUpdate: (_client: unknown, handler: (call: unknown) => void) => {
    sdk.state.onUpdate = handler;
    return () => {};
  },
  onCallWarning: (_client: unknown, handler: (name: string) => void) => {
    sdk.state.onWarning = handler;
    return () => {};
  },
  getCallPeerConnection: () => undefined,
  createCallQualityProbe: () => ({
    start: () => {
      sdk.state.probe.started += 1;
    },
    setHeld: () => {},
    warn: (name: string) => sdk.state.probe.warnings.push(name),
    finish: () => sdk.state.probe.summary,
  }),
  mapTelnyxState: (telnyxState: string) =>
    ({ new: "connecting", trying: "connecting", active: "active" })[
      telnyxState
    ] ??
    (["hangup", "destroy", "purge"].includes(telnyxState)
      ? "ended"
      : "connecting"),
  TELNYX_EVENTS: {
    ready: "telnyx.ready",
    error: "telnyx.error",
    warning: "telnyx.warning",
  },
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
/** Every microphone stream the engine opened, with how often it was stopped. */
let mics: Array<{ stopped: number; getTracks: () => { stop: () => void }[] }>;

beforeEach(async () => {
  Object.assign(sdk.state, {
    log: [],
    connected: false,
    readyLater: false,
    onUpdate: null,
    calls: [],
    dtmf: [],
    placed: [],
    onWarning: null,
    probe: { started: 0, warnings: [], summary: null },
  });
  sdk.client.handlers = {};
  sent = [];
  mics = [];
  vi.stubGlobal("document", { getElementById: () => null });
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: async () => {
        const mic = {
          stopped: 0,
          getTracks: () => [{ stop: () => (mic.stopped += 1) }],
        };
        mics.push(mic);
        return mic;
      },
    },
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

describe("offscreen engine — microphone and outgoing audio", () => {
  it("opens the microphone once and hands it to the leg", async () => {
    deliver(START_CALL);
    await flush();

    expect(mics).toHaveLength(1);
    expect(sdk.state.placed[0]?.localStream).toBe(mics[0]);
  });

  it("releases the microphone of a dial called off before its leg exists", async () => {
    sdk.state.readyLater = true;
    deliver(START_CALL);
    await flush();

    deliver(command("press-1", { action: "hangup" }));
    sdk.state.fireReady();
    await flush();

    expect(sdk.state.placed).toHaveLength(0);
    expect(mics[0]?.stopped).toBe(1);
  });

  it("reports the call's outgoing audio before it reports the end", async () => {
    sdk.state.probe.summary = { measuredSec: 30, warnings: {} };
    deliver(START_CALL);
    await flush();
    sdk.state.calls[0]!.set("active");
    sdk.state.onWarning?.("HIGH_JITTER");

    deliver(command("press-1", { action: "hangup" }));
    await flush();

    const order = sent.map((m) =>
      (m as { type: string }).type === MessageType.CallQuality
        ? "quality"
        : (m as CallEventMsg).state,
    );
    expect(order).toEqual(["connecting", "active", "quality", "ended"]);
    expect(sdk.state.probe.started).toBe(1);
    expect(sdk.state.probe.warnings).toEqual(["HIGH_JITTER"]);
  });

  it("reports nothing for a call that was never measured", async () => {
    deliver(START_CALL);
    await flush();
    deliver(command("press-1", { action: "hangup" }));
    await flush();

    expect(
      sent.some(
        (m) => (m as { type: string }).type === MessageType.CallQuality,
      ),
    ).toBe(false);
  });
});

describe("offscreen engine — the line's teardown after the end", () => {
  it("reports the end once, though disconnecting purges the leg it still holds", async () => {
    deliver(START_CALL);
    await flush();
    sdk.state.calls[0]!.set("active");

    deliver(command("press-1", { action: "hangup" }));
    await flush();

    expect(reported()).toEqual(["connecting", "active", "ended"]);
    expect(sdk.state.log).toEqual(["bye sent", "disconnect"]);
  });

  it("reports the end once when the server purges the leg", async () => {
    deliver(START_CALL);
    await flush();
    sdk.state.calls[0]!.set("active");

    // `serverDisconnect()`: purge first, then the SDK hangs the leg up itself.
    sdk.state.calls[0]!.set("purge");
    sdk.state.calls[0]!.set("hangup");
    sdk.state.calls[0]!.set("destroy");
    await flush();

    expect(reported()).toEqual(["connecting", "active", "ended"]);
    expect(sdk.state.log).toEqual(["disconnect"]);
  });
});
