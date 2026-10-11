import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Call, CallQualitySnapshot } from "@ringee/dialer-core/engine";
import { TelnyxAdapter } from "./telnyx-adapter";

const mock = vi.hoisted(() => ({
  listeners: new Map<string, () => void>(),
  update: undefined as ((call: Call) => void) | undefined,
  monitors: [] as Array<{
    listener: (quality: CallQualitySnapshot) => void;
    stop: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("@ringee/dialer-core/engine", () => ({
  createTelnyxClient: () => ({
    on: (event: string, listener: () => void) =>
      mock.listeners.set(event, listener),
    connect: () => mock.listeners.get("ready")?.(),
    disconnect: vi.fn(),
  }),
  onCallUpdate: (_client: unknown, listener: (call: Call) => void) => {
    mock.update = listener;
    return vi.fn();
  },
  monitorCallQuality: (
    _call: Call,
    listener: (quality: CallQualitySnapshot) => void,
  ) => {
    const stop = vi.fn();
    mock.monitors.push({ listener, stop });
    return stop;
  },
  mapTelnyxState: (state: string) => (state === "hangup" ? "ended" : state),
  TELNYX_EVENTS: { ready: "ready", error: "error" },
  placeCall: vi.fn(),
  muteCall: vi.fn(),
  holdCall: vi.fn(),
  hangupCall: vi.fn(),
  sendDtmf: vi.fn(),
}));

const quality: CallQualitySnapshot = {
  timestamp: 1000,
  rttMs: 100,
  jitterMs: 5,
  packetLossPercent: 0,
  outboundRttMs: 100,
  outboundJitterMs: 5,
  outboundPacketLossPercent: 0,
  rating: "good",
};

function call(id: string, state: string): Call {
  return { id, state } as Call;
}

async function connect(onCallQuality?: (value: CallQualitySnapshot) => void) {
  const adapter = new TelnyxAdapter({
    onStateChange: vi.fn(),
    onRemoteStream: vi.fn(),
    onConnectionError: vi.fn(),
    onCallQuality,
  });
  await adapter.connect({
    sipUsername: "test-user",
    sipPassword: "test-password",
    connectionId: "connection",
    expiresAt: "2026-10-12T00:00:00Z",
  });
  return adapter;
}

describe("TelnyxAdapter call quality lifecycle", () => {
  beforeEach(() => {
    mock.listeners.clear();
    mock.monitors.length = 0;
    mock.update = undefined;
  });

  it("samples a connected call once and stops on hold, end and disconnect", async () => {
    const onQuality = vi.fn();
    const adapter = await connect(onQuality);
    mock.update?.(call("a", "ringing"));
    expect(mock.monitors).toHaveLength(0);

    mock.update?.(call("a", "active"));
    mock.update?.(call("a", "active"));
    expect(mock.monitors).toHaveLength(1);
    mock.monitors[0].listener(quality);
    expect(onQuality).toHaveBeenCalledWith(quality);

    mock.update?.(call("a", "held"));
    expect(mock.monitors[0].stop).toHaveBeenCalledOnce();
    onQuality.mockClear();
    mock.monitors[0].listener(quality);
    expect(onQuality).not.toHaveBeenCalled();

    mock.update?.(call("a", "active"));
    expect(mock.monitors).toHaveLength(2);
    mock.update?.(call("a", "hangup"));
    expect(mock.monitors[1].stop).toHaveBeenCalledOnce();

    mock.update?.(call("b", "active"));
    adapter.disconnect();
    expect(mock.monitors[2].stop).toHaveBeenCalledOnce();
    mock.monitors[2].listener(quality);
    expect(onQuality).not.toHaveBeenCalled();
  });

  it("disposes the previous call's observer and ignores its late measurements", async () => {
    const onQuality = vi.fn();
    const adapter = await connect(onQuality);
    mock.update?.(call("a", "active"));
    mock.update?.(call("b", "active"));
    expect(mock.monitors[0].stop).toHaveBeenCalledOnce();
    mock.monitors[0].listener(quality);
    expect(onQuality).not.toHaveBeenCalled();
    mock.monitors[1].listener(quality);
    expect(onQuality).toHaveBeenCalledOnce();
    adapter.disconnect();
  });

  it("preserves existing consumers that do not subscribe to quality", async () => {
    const adapter = await connect();
    mock.update?.(call("a", "active"));
    expect(mock.monitors).toHaveLength(0);
    adapter.disconnect();
  });
});
