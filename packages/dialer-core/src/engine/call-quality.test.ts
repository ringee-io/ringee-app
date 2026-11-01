import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCallQualityProbe,
  readQuality,
  summarizeQuality,
  type QualityReading,
} from "./call-quality";

/** A `getStats()` report as Chrome returns it, holding only what is read. */
function report(o: {
  captured?: number;
  sent?: number;
  received?: number;
  lost?: number;
  jitter?: number;
  rtt?: number;
  local?: Record<string, unknown>;
  pathChanges?: number;
}): RTCStatsReport {
  const stats: Record<string, Record<string, unknown>> = {
    ms: {
      type: "media-source",
      kind: "audio",
      totalSamplesDuration: o.captured,
    },
    out: { type: "outbound-rtp", kind: "audio", packetsSent: o.sent },
    in: {
      type: "inbound-rtp",
      kind: "audio",
      packetsReceived: o.received,
      packetsLost: o.lost,
      jitter: o.jitter,
    },
    t: {
      type: "transport",
      selectedCandidatePairId: "pair",
      selectedCandidatePairChanges: o.pathChanges ?? 1,
    },
    pair: {
      type: "candidate-pair",
      localCandidateId: "local",
      currentRoundTripTime: o.rtt,
    },
    local: {
      type: "local-candidate",
      address: "203.0.113.7",
      port: 51000,
      candidateType: "host",
      protocol: "udp",
      ...o.local,
    },
  };
  return new Map(Object.entries(stats)) as unknown as RTCStatsReport;
}

/** Readings 2 s apart, each window capturing and sending what is given. */
function call(windows: Array<{ captured: number; sent: number }>) {
  const readings: QualityReading[] = [
    { at: 0, capturedSec: 0, packetsSent: 0, packetsReceived: 0 },
  ];
  for (const w of windows) {
    const prev = readings[readings.length - 1]!;
    readings.push({
      at: prev.at + 2000,
      capturedSec: prev.capturedSec! + w.captured,
      packetsSent: prev.packetsSent! + w.sent,
      packetsReceived: prev.packetsReceived! + 100,
    });
  }
  return readings;
}

const about = { warnings: {} };
const steady = { captured: 2, sent: 100 };

describe("readQuality", () => {
  it("reads capture, sending, receiving and the network path", () => {
    const reading = readQuality(
      report({
        captured: 12.5,
        sent: 610,
        received: 600,
        lost: 3,
        jitter: 0.004,
        rtt: 0.12,
      }),
      1000,
    );
    expect(reading).toEqual({
      at: 1000,
      capturedSec: 12.5,
      packetsSent: 610,
      packetsReceived: 600,
      packetsLost: 3,
      jitterSec: 0.004,
      rttSec: 0.12,
      path: "host/udp",
      pathChanges: 1,
    });
  });

  it("names a relay by its link to the TURN server", () => {
    const reading = readQuality(
      report({ local: { candidateType: "relay", relayProtocol: "tcp" } }),
      0,
    );
    expect(reading.path).toBe("relay/tcp");
  });

  it("never carries a network address", () => {
    const reading = readQuality(report({ captured: 1, sent: 50 }), 0);
    expect(JSON.stringify(reading)).not.toContain("203.0.113.7");
    expect(JSON.stringify(reading)).not.toContain("51000");
  });
});

describe("summarizeQuality", () => {
  it("finds no gap on a steady call", () => {
    const summary = summarizeQuality(call([steady, steady, steady]), about);
    expect(summary).toMatchObject({
      measuredSec: 6,
      capturedSec: 6,
      captureGaps: 0,
      packetsSent: 300,
      sentPerSec: 50,
      sendGaps: 0,
      packetsReceived: 300,
    });
  });

  it("counts the windows in which the microphone stopped delivering", () => {
    const summary = summarizeQuality(
      call([
        steady,
        { captured: 0.6, sent: 30 },
        steady,
        { captured: 1, sent: 50 },
      ]),
      about,
    );
    expect(summary.measuredSec).toBe(8);
    expect(summary.capturedSec).toBe(5.6);
    expect(summary.captureGaps).toBe(2);
  });

  it("counts the windows in which the browser stopped sending what it captured", () => {
    const summary = summarizeQuality(
      call([steady, steady, { captured: 2, sent: 20 }, steady]),
      about,
    );
    expect(summary.captureGaps).toBe(0);
    expect(summary.sendGaps).toBe(1);
    expect(summary.sentPerSec).toBe(40);
  });

  it("leaves the time on hold out", () => {
    const readings = call([steady, { captured: 2, sent: 0 }, steady]);
    readings[2]!.held = true;
    const summary = summarizeQuality(readings, about);
    expect(summary.measuredSec).toBe(2);
    expect(summary.sendGaps).toBe(0);
  });

  it("skips the window in which a recovered call moved to a new connection", () => {
    const readings = call([steady, steady]);
    readings.push({
      at: 6000,
      capturedSec: 1,
      packetsSent: 40,
      packetsReceived: 10,
    });
    readings.push({
      at: 8000,
      capturedSec: 3,
      packetsSent: 140,
      packetsReceived: 110,
    });
    const summary = summarizeQuality(readings, about);
    expect(summary.measuredSec).toBe(6);
    expect(summary.packetsSent).toBe(300);
    expect(summary.captureGaps).toBe(0);
  });

  it("leaves out the windows a reading could not measure", () => {
    const readings = call([steady, steady, steady]);
    delete readings[2]!.packetsSent;
    const summary = summarizeQuality(readings, about);
    expect(summary.measuredSec).toBe(2);
    expect(summary.capturedSec).toBe(2);
    expect(summary.sentPerSec).toBe(50);
  });

  it("keeps the worst jitter and round trip in ms", () => {
    const readings = call([steady, steady]);
    readings[1]!.jitterSec = 0.03;
    readings[2]!.rttSec = 0.25;
    expect(summarizeQuality(readings, about)).toMatchObject({
      jitterMsMax: 30,
      rttMsMax: 250,
    });
  });
});

describe("createCallQualityProbe", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A connection whose counters advance by `perRead` on every `getStats()`. */
  function peer(perRead = { captured: 2, sent: 100 }) {
    let reads = 0;
    return {
      getStats: vi.fn(async () => {
        reads += 1;
        return report({
          captured: reads * perRead.captured,
          sent: reads * perRead.sent,
          received: reads * 100,
        });
      }),
    } as unknown as RTCPeerConnection & { getStats: ReturnType<typeof vi.fn> };
  }

  function mic(label = "Headset") {
    const track = Object.assign(new EventTarget(), { label });
    return {
      track,
      stream: { getAudioTracks: () => [track] } as unknown as MediaStream,
    };
  }

  it("reads while answered and folds it at the end", async () => {
    const pc = peer();
    const { track, stream } = mic();
    const probe = createCallQualityProbe({
      peer: () => pc,
      mic: stream,
      // Fake timers move Date.now() along with the readings.
      now: () => Date.now(),
    });

    probe.start();
    await vi.advanceTimersByTimeAsync(6000);
    track.dispatchEvent(new Event("mute"));
    probe.warn("HIGH_JITTER");
    probe.warn("HIGH_JITTER");

    const summary = probe.finish("session-1");
    expect(summary).toMatchObject({
      telnyxSessionId: "session-1",
      measuredSec: 6,
      capturedSec: 6,
      sentPerSec: 50,
      path: "host/udp",
      mic: { label: "Headset", muteEvents: 1, ended: false },
      warnings: { HIGH_JITTER: 2 },
    });

    await vi.advanceTimersByTimeAsync(10_000);
    expect(pc.getStats).toHaveBeenCalledTimes(4);
    expect(probe.finish()).toBeNull();
  });

  it("has nothing to report for a call that was never answered", () => {
    const pc = peer();
    const probe = createCallQualityProbe({ peer: () => pc });
    probe.warn("ONLY_HOST_ICE_CANDIDATES");
    expect(probe.finish()).toBeNull();
    expect(pc.getStats).not.toHaveBeenCalled();
  });

  it("notices the microphone going away mid-call", async () => {
    let clock = 0;
    const { track, stream } = mic();
    const probe = createCallQualityProbe({
      peer: () => peer(),
      mic: stream,
      now: () => (clock += 2000),
    });
    probe.start();
    await vi.advanceTimersByTimeAsync(2000);
    track.dispatchEvent(new Event("ended"));
    expect(probe.finish()?.mic?.ended).toBe(true);
  });

  it("starts once however often the call becomes active", async () => {
    const pc = peer();
    const probe = createCallQualityProbe({ peer: () => pc });
    probe.start();
    probe.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(pc.getStats).toHaveBeenCalledTimes(2);
    probe.finish();
  });

  it("takes one reading at a time, however slowly the connection answers", async () => {
    let fail: ((err: Error) => void) | undefined;
    const pc = {
      getStats: vi.fn(
        () =>
          new Promise<RTCStatsReport>((_, reject) => {
            fail = reject;
          }),
      ),
    } as unknown as RTCPeerConnection & { getStats: ReturnType<typeof vi.fn> };
    const probe = createCallQualityProbe({ peer: () => pc });
    probe.start();
    await vi.advanceTimersByTimeAsync(6000);
    expect(pc.getStats).toHaveBeenCalledTimes(1);

    // A reading that fails lets the next one through.
    fail?.(new Error("closed"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(pc.getStats).toHaveBeenCalledTimes(2);
    probe.finish();
  });
});
