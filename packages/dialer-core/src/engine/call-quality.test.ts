import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Call } from "@telnyx/webrtc";
import { monitorCallQuality } from "./call-quality";

interface Measurements {
  received?: number;
  receivedLost?: number;
  sent?: number;
  sentLost?: number;
  remoteTimestamp?: number;
  reports?: number;
  rttMeasurements?: number;
  rtt?: number;
  jitter?: number;
  outboundJitter?: number;
  fractionLost?: number;
  remoteId?: string;
  selectedPairId?: string;
}

function report(measurements: Measurements = {}): RTCStatsReport {
  const {
    received = 100,
    receivedLost = 0,
    sent = 100,
    sentLost = 0,
    reports = 1,
    remoteTimestamp = reports * 2000 - 1000,
    rttMeasurements = reports,
    rtt = 0.1,
    jitter = 0.005,
    outboundJitter = 0.004,
    fractionLost,
    remoteId = "received-by-provider",
    selectedPairId = "selected-pair",
  } = measurements;
  const stats = [
    {
      id: "incoming-audio",
      type: "inbound-rtp",
      kind: "audio",
      transportId: "audio-transport",
      packetsReceived: received,
      packetsLost: receivedLost,
      jitter,
    },
    {
      id: "outgoing-audio",
      type: "outbound-rtp",
      kind: "audio",
      transportId: "audio-transport",
      packetsSent: sent,
    },
    {
      id: remoteId,
      type: "remote-inbound-rtp",
      kind: "audio",
      localId: "outgoing-audio",
      packetsLost: sentLost,
      fractionLost,
      timestamp: remoteTimestamp,
      roundTripTime: 0.08,
      jitter: outboundJitter,
      reportsReceived: reports,
      roundTripTimeMeasurements: rttMeasurements,
    },
    {
      id: "audio-transport",
      type: "transport",
      selectedCandidatePairId: selectedPairId,
    },
    {
      id: selectedPairId,
      type: "candidate-pair",
      currentRoundTripTime: rtt,
      localCandidateId: "local",
      remoteCandidateId: "remote",
    },
    {
      id: "local",
      type: "local-candidate",
      candidateType: "relay",
      protocol: "tcp",
      relayProtocol: "tls",
      address: "192.0.2.1",
      usernameFragment: "private-ice-secret",
    },
    {
      id: "remote",
      type: "remote-candidate",
      candidateType: "host",
      protocol: "udp",
      address: "203.0.113.1",
    },
    {
      id: "old-pair",
      type: "candidate-pair",
      nominated: true,
      currentRoundTripTime: 0.9,
    },
    {
      id: "incoming-video",
      type: "inbound-rtp",
      kind: "video",
      packetsReceived: 100,
      packetsLost: 100,
      jitter: 1,
    },
  ];
  return new Map(
    stats.map((stat) => [stat.id, stat]),
  ) as unknown as RTCStatsReport;
}

function setup() {
  const getStats = vi.fn().mockResolvedValue(report());
  const peer = { getStats, connectionState: "connected" };
  const call = {
    state: "active",
    peer: { instance: peer },
    hangup: vi.fn(),
    muteAudio: vi.fn(),
    hold: vi.fn(),
  } as unknown as Call;
  const callback = vi.fn();
  return { call, peer, getStats, callback };
}

async function initialSample() {
  await vi.advanceTimersByTimeAsync(0);
}

describe("monitorCallQuality", () => {
  beforeEach(() =>
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "Date",
        "performance",
      ],
    }),
  );
  afterEach(() => vi.useRealTimers());

  it("waits for a packet window instead of treating startup counters as good", async () => {
    const { call, callback } = setup();
    const stop = monitorCallQuality(call, callback);
    await initialSample();
    expect(callback).toHaveBeenLastCalledWith(
      expect.objectContaining({
        rttMs: 100,
        packetLossPercent: null,
        jitterMs: null,
        outboundPacketLossPercent: null,
        rating: "unknown",
      }),
    );
    stop();
  });

  it("measures interval loss and lets poor microphone uplink outweigh good receive audio", async () => {
    const { call, getStats, callback } = setup();
    getStats.mockResolvedValueOnce(report()).mockResolvedValue(
      report({
        received: 200,
        sent: 200,
        sentLost: 5,
        reports: 2,
        remoteTimestamp: 3000,
      }),
    );
    const stop = monitorCallQuality(call, callback);
    await initialSample();
    await vi.advanceTimersByTimeAsync(2000);
    expect(callback).toHaveBeenLastCalledWith(
      expect.objectContaining({
        rttMs: 100,
        jitterMs: 5,
        packetLossPercent: 0,
        outboundRttMs: 80,
        outboundPacketLossPercent: 5,
        rating: "poor",
      }),
    );
    expect(call.hangup).not.toHaveBeenCalled();
    expect(call.muteAudio).not.toHaveBeenCalled();
    expect(call.hold).not.toHaveBeenCalled();
    stop();
  });

  it("calculates inbound loss over recent packets instead of the call's lifetime", async () => {
    const { call, getStats, callback } = setup();
    getStats
      .mockResolvedValueOnce(report({ received: 10000 }))
      .mockResolvedValue(
        report({ received: 10096, receivedLost: 4, sent: 200, reports: 2 }),
      );
    const stop = monitorCallQuality(call, callback);
    await initialSample();
    await vi.advanceTimersByTimeAsync(2000);
    expect(callback.mock.lastCall?.[0].packetLossPercent).toBe(4);
    expect(callback.mock.lastCall?.[0].rating).toBe("poor");
    stop();
  });

  it("does not manufacture zero uplink loss from repeated remote RTCP reports", async () => {
    const { call, getStats, callback } = setup();
    getStats
      .mockResolvedValueOnce(report())
      .mockResolvedValueOnce(report({ received: 200, sent: 200 }))
      .mockResolvedValueOnce(
        report({
          received: 300,
          sent: 300,
          sentLost: 4,
          reports: 2,
          remoteTimestamp: 5000,
        }),
      );
    const stop = monitorCallQuality(call, callback);
    await initialSample();
    await vi.advanceTimersByTimeAsync(2000);
    expect(callback.mock.lastCall?.[0].outboundPacketLossPercent).toBeNull();
    expect(callback.mock.lastCall?.[0].outboundRttMs).toBeNull();
    await vi.advanceTimersByTimeAsync(2000);
    expect(callback.mock.lastCall?.[0].outboundPacketLossPercent).toBe(2);
    stop();
  });

  it("retains poor uplink evidence until a newer RTCP report demonstrates recovery", async () => {
    const { call, getStats, callback } = setup();
    getStats
      .mockResolvedValueOnce(report())
      .mockResolvedValueOnce(
        report({ received: 200, sent: 200, sentLost: 5, reports: 2 }),
      )
      .mockResolvedValueOnce(
        report({ received: 300, sent: 300, sentLost: 5, reports: 2 }),
      )
      .mockResolvedValueOnce(
        report({ received: 400, sent: 400, sentLost: 5, reports: 3 }),
      );
    const stop = monitorCallQuality(call, callback);
    await initialSample();
    await vi.advanceTimersByTimeAsync(2000);
    expect(callback.mock.lastCall?.[0].rating).toBe("poor");
    await vi.advanceTimersByTimeAsync(2000);
    expect(callback.mock.lastCall?.[0].outboundPacketLossPercent).toBe(5);
    expect(callback.mock.lastCall?.[0].rating).toBe("poor");
    await vi.advanceTimersByTimeAsync(2000);
    expect(callback.mock.lastCall?.[0].outboundPacketLossPercent).toBe(0);
    expect(callback.mock.lastCall?.[0].rating).toBe("good");
    stop();
  });

  it("expires uplink evidence after 10 seconds and reports unknown instead of green", async () => {
    const { call, getStats, callback } = setup();
    let reads = 0;
    getStats.mockImplementation(() => {
      reads += 1;
      return Promise.resolve(
        report({
          received: reads * 100,
          sent: reads * 100,
          sentLost: reads === 1 ? 0 : 5,
          reports: reads === 1 ? 1 : 2,
        }),
      );
    });
    const stop = monitorCallQuality(call, callback);
    await initialSample();
    await vi.advanceTimersByTimeAsync(10000);
    expect(callback.mock.lastCall?.[0].rating).toBe("poor");
    // Wall-clock correction must not extend the monotonic freshness bound.
    vi.setSystemTime(Date.now() - 60000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(callback.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        jitterMs: 5,
        packetLossPercent: 0,
        outboundRttMs: null,
        outboundJitterMs: null,
        outboundPacketLossPercent: null,
        rating: "unknown",
      }),
    );
    stop();
  });

  it("uses newer RTCP timestamps even when no report contains a valid RTT measurement", async () => {
    const { call, getStats, callback } = setup();
    getStats
      .mockResolvedValueOnce(report({ rttMeasurements: 0 }))
      .mockResolvedValueOnce(
        report({
          received: 200,
          sent: 200,
          sentLost: 5,
          reports: 1,
          remoteTimestamp: 3000,
          rttMeasurements: 0,
          outboundJitter: 0.07,
        }),
      );
    const stop = monitorCallQuality(call, callback);
    await initialSample();
    await vi.advanceTimersByTimeAsync(2000);
    expect(callback.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        outboundRttMs: null,
        outboundJitterMs: 70,
        outboundPacketLossPercent: 5,
        rating: "poor",
      }),
    );
    stop();
  });

  it("prefers the provider's RTCP loss fraction to a mismatched local send window", async () => {
    const { call, getStats, callback } = setup();
    getStats
      .mockResolvedValueOnce(report())
      .mockResolvedValueOnce(
        report({ received: 200, sent: 1100, reports: 2, fractionLost: 0.04 }),
      );
    const stop = monitorCallQuality(call, callback);
    await initialSample();
    await vi.advanceTimersByTimeAsync(2000);
    expect(callback.mock.lastCall?.[0].outboundPacketLossPercent).toBe(4);
    expect(callback.mock.lastCall?.[0].rating).toBe("poor");
    stop();
  });

  it.each(["path", "identity", "missing", "error", "hold"])(
    "discards cached uplink metrics on a %s change",
    async (change) => {
      const { call, getStats, callback } = setup();
      getStats
        .mockResolvedValueOnce(report())
        .mockResolvedValueOnce(
          report({ received: 200, sent: 200, reports: 2, sentLost: 5 }),
        );
      const stop = monitorCallQuality(call, callback);
      await initialSample();
      await vi.advanceTimersByTimeAsync(2000);
      expect(callback.mock.lastCall?.[0].rating).toBe("poor");
      const next = report({
        received: 300,
        sent: 300,
        reports: 2,
        sentLost: 5,
        ...(change === "path" ? { selectedPairId: "new-pair" } : {}),
        ...(change === "identity" ? { remoteId: "new-ssrc" } : {}),
      });
      if (change === "missing") {
        (next as unknown as Map<string, unknown>).delete(
          "received-by-provider",
        );
      }
      if (change === "error")
        getStats.mockRejectedValueOnce(new Error("failed"));
      else getStats.mockResolvedValueOnce(next);
      if (change === "hold") call.state = "held";
      await vi.advanceTimersByTimeAsync(2000);
      expect(callback.mock.lastCall?.[0].outboundPacketLossPercent).toBeNull();
      expect(callback.mock.lastCall?.[0].rating).toBe("unknown");
      stop();
    },
  );

  it("exposes only normalized metrics and the selected audio candidate transport", async () => {
    const { call, getStats, callback } = setup();
    getStats
      .mockResolvedValueOnce(report())
      .mockResolvedValueOnce(report({ received: 200, sent: 200, reports: 2 }));
    const stop = monitorCallQuality(call, callback);
    await initialSample();
    await vi.advanceTimersByTimeAsync(2000);
    expect(callback.mock.lastCall?.[0]).toEqual({
      timestamp: expect.any(Number),
      rttMs: 100,
      jitterMs: 5,
      packetLossPercent: 0,
      outboundRttMs: 80,
      outboundJitterMs: 4,
      outboundPacketLossPercent: 0,
      localCandidateType: "relay",
      remoteCandidateType: "host",
      transport: "tls",
      rating: "good",
    });
    expect(JSON.stringify(callback.mock.calls)).not.toContain("192.0.2.1");
    expect(JSON.stringify(callback.mock.calls)).not.toContain(
      "private-ice-secret",
    );
    stop();
  });

  it("keeps absent peers, stopped packets and uninitialized RTT unknown", async () => {
    const { call, peer, getStats, callback } = setup();
    call.peer.instance = undefined as never;
    const stop = monitorCallQuality(call, callback);
    await initialSample();
    expect(callback.mock.lastCall?.[0].rating).toBe("unknown");
    expect(getStats).not.toHaveBeenCalled();
    call.peer.instance = peer as unknown as RTCPeerConnection;
    getStats.mockResolvedValue(report({ received: 0, sent: 0, rtt: 0 }));
    await vi.advanceTimersByTimeAsync(4000);
    expect(callback.mock.lastCall?.[0].packetLossPercent).toBeNull();
    expect(callback.mock.lastCall?.[0].rttMs).toBeNull();
    expect(callback.mock.lastCall?.[0].rating).toBe("unknown");
    stop();
  });

  it("drops pending stats on disposal and never overlaps slow reads", async () => {
    const { call, getStats, callback } = setup();
    let resolve!: (value: RTCStatsReport) => void;
    getStats.mockReturnValue(
      new Promise<RTCStatsReport>((done) => {
        resolve = done;
      }),
    );
    const stop = monitorCallQuality(call, callback);
    await vi.advanceTimersByTimeAsync(6000);
    expect(getStats).toHaveBeenCalledTimes(1);
    stop();
    stop();
    resolve(report());
    await initialSample();
    expect(callback).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops itself when the call terminates during a pending read", async () => {
    const { call, getStats, callback } = setup();
    let resolve!: (value: RTCStatsReport) => void;
    getStats.mockReturnValue(
      new Promise<RTCStatsReport>((done) => {
        resolve = done;
      }),
    );
    monitorCallQuality(call, callback);
    call.state = "hangup";
    resolve(report());
    await initialSample();
    expect(callback).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resets measurement windows on hold and peer replacement", async () => {
    const { call, getStats, callback } = setup();
    getStats.mockResolvedValue(report());
    const stop = monitorCallQuality(call, callback);
    await initialSample();
    call.state = "held";
    await vi.advanceTimersByTimeAsync(2000);
    expect(callback.mock.lastCall?.[0].rating).toBe("unknown");
    expect(getStats).toHaveBeenCalledTimes(1);
    call.state = "active";
    getStats.mockResolvedValue(
      report({ received: 200, sent: 200, reports: 2 }),
    );
    await vi.advanceTimersByTimeAsync(2000);
    expect(callback.mock.lastCall?.[0].packetLossPercent).toBeNull();
    call.peer.instance = {
      getStats: vi.fn().mockResolvedValue(report({ received: 300, sent: 300 })),
      connectionState: "connected",
    } as unknown as RTCPeerConnection;
    await vi.advanceTimersByTimeAsync(2000);
    expect(callback.mock.lastCall?.[0].packetLossPercent).toBeNull();
    stop();
  });

  it("clears old metrics on stats errors without propagating provider details", async () => {
    const { call, getStats, callback } = setup();
    getStats.mockRejectedValue(new Error("SDP or sensitive provider details"));
    const stop = monitorCallQuality(call, callback);
    await initialSample();
    expect(callback).toHaveBeenLastCalledWith({
      timestamp: expect.any(Number),
      rttMs: null,
      jitterMs: null,
      packetLossPercent: null,
      outboundRttMs: null,
      outboundJitterMs: null,
      outboundPacketLossPercent: null,
      rating: "unknown",
    });
    expect(call.hangup).not.toHaveBeenCalled();
    stop();
  });

  it("warns when the provider measures high microphone uplink jitter", async () => {
    const { call, getStats, callback } = setup();
    getStats
      .mockResolvedValueOnce(report())
      .mockResolvedValueOnce(
        report({ received: 200, sent: 200, reports: 2, outboundJitter: 0.07 }),
      );
    const stop = monitorCallQuality(call, callback);
    await initialSample();
    await vi.advanceTimersByTimeAsync(2000);
    expect(callback.mock.lastCall?.[0].outboundJitterMs).toBe(70);
    expect(callback.mock.lastCall?.[0].rating).toBe("poor");
    stop();
  });
});
