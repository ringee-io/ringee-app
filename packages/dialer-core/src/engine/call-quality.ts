import type { Call } from "@telnyx/webrtc";

export type CallQualityRating = "good" | "fair" | "poor" | "unknown";
export type CallCandidateType = "host" | "srflx" | "prflx" | "relay";
export type CallTransport = "udp" | "tcp" | "tls";

/** Browser-to-provider audio measurements, not the remote PSTN carrier leg. */
export interface CallQualitySnapshot {
  timestamp: number;
  rttMs: number | null;
  jitterMs: number | null;
  packetLossPercent: number | null;
  /** Latest microphone uplink RTCP measurements, retained for at most 10s. */
  outboundRttMs: number | null;
  outboundJitterMs: number | null;
  /** RTCP fraction when provided; otherwise loss/send delta estimate. */
  outboundPacketLossPercent: number | null;
  localCandidateType?: CallCandidateType;
  remoteCandidateType?: CallCandidateType;
  transport?: CallTransport;
  rating: CallQualityRating;
}

interface AudioStat {
  id: string;
  type: string;
  timestamp?: number;
  kind?: string;
  mediaType?: string;
  packetsReceived?: number;
  packetsSent?: number;
  packetsLost?: number;
  fractionLost?: number;
  jitter?: number;
  roundTripTime?: number;
  roundTripTimeMeasurements?: number;
  reportsReceived?: number;
  localId?: string;
  transportId?: string;
  selectedCandidatePairId?: string;
  currentRoundTripTime?: number;
  responsesReceived?: number;
  localCandidateId?: string;
  remoteCandidateId?: string;
  candidateType?: string;
  protocol?: string;
  relayProtocol?: string;
}

interface PacketSample {
  packets: number;
  lost: number;
  timestamp: number | null;
  reports: number | null;
  localId?: string;
}

interface OutboundMeasurement {
  measuredAt: number;
  localId: string;
  lost: number;
  total: number;
  rttMs: number | null;
  jitterMs: number | null;
}

const SAMPLE_INTERVAL_MS = 2000;
const OUTBOUND_MEASUREMENT_TTL_MS = 10000;
const TERMINAL_STATES = new Set(["hangup", "destroy", "purge"]);

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonnegative(value: unknown): number | null {
  const number = finite(value);
  return number !== null && number >= 0 ? number : null;
}

function maximum(values: Array<number | null>): number | null {
  const measured = values.filter((value): value is number => value !== null);
  return measured.length ? Math.max(...measured) : null;
}

function emptySnapshot(): CallQualitySnapshot {
  return {
    timestamp: Date.now(),
    rttMs: null,
    jitterMs: null,
    packetLossPercent: null,
    outboundRttMs: null,
    outboundJitterMs: null,
    outboundPacketLossPercent: null,
    rating: "unknown",
  };
}

function rating(snapshot: CallQualitySnapshot): CallQualityRating {
  const rtt = maximum([snapshot.rttMs, snapshot.outboundRttMs]);
  const loss = maximum([
    snapshot.packetLossPercent,
    snapshot.outboundPacketLossPercent,
  ]);
  const jitter = maximum([snapshot.jitterMs, snapshot.outboundJitterMs]);
  if (
    (rtt !== null && rtt >= 300) ||
    (jitter !== null && jitter >= 50) ||
    (loss !== null && loss >= 3)
  ) {
    return "poor";
  }
  if (
    (rtt !== null && rtt >= 150) ||
    (jitter !== null && jitter >= 20) ||
    (loss !== null && loss >= 1)
  ) {
    return "fair";
  }
  // Missing/expired uplink evidence must not turn a known problem green.
  return snapshot.rttMs !== null &&
    snapshot.jitterMs !== null &&
    snapshot.packetLossPercent !== null &&
    snapshot.outboundPacketLossPercent !== null
    ? "good"
    : "unknown";
}

function candidateType(value: unknown): CallCandidateType | undefined {
  return value === "host" ||
    value === "srflx" ||
    value === "prflx" ||
    value === "relay"
    ? value
    : undefined;
}

function transport(value: unknown): CallTransport | undefined {
  return value === "udp" || value === "tcp" || value === "tls"
    ? value
    : undefined;
}

function isAudio(stat: AudioStat): boolean {
  return stat.kind === "audio" || stat.mediaType === "audio";
}

/**
 * Observe an existing call without registering Telnyx's non-removable legacy
 * getStats callback. The SDK exposes peer.instance publicly; only the browser's
 * read-only getStats API is used. Disposal also suppresses pending reads.
 *
 * No addresses, identifiers, credentials, SDP or audio leave this boundary.
 */
export function monitorCallQuality(
  call: Call,
  callback: (snapshot: CallQualitySnapshot) => void,
): () => void {
  let stopped = false;
  let inFlight = false;
  let peer: RTCPeerConnection | undefined;
  let audioPath: string | undefined;
  const previous = new Map<string, PacketSample>();
  const outboundMeasurements = new Map<string, OutboundMeasurement>();

  function resetMeasurements(): void {
    previous.clear();
    outboundMeasurements.clear();
    audioPath = undefined;
  }

  const stop = () => {
    stopped = true;
    clearInterval(interval);
    resetMeasurements();
  };

  function packetWindow(
    stat: AudioStat,
    outbound?: AudioStat,
  ): { lost: number; total: number } | null {
    const received = nonnegative(stat.packetsReceived);
    const sent = nonnegative(outbound?.packetsSent);
    const packets = received ?? sent;
    const lost = finite(stat.packetsLost);
    if (packets === null || lost === null) {
      previous.delete(stat.id);
      outboundMeasurements.delete(stat.id);
      return null;
    }
    const sample: PacketSample = {
      packets,
      lost,
      timestamp: nonnegative(stat.timestamp),
      reports: nonnegative(stat.reportsReceived),
      localId: outbound?.id,
    };
    const old = previous.get(stat.id);
    // Remote inbound stats only refresh on RTCP reports. A repeated report
    // cannot establish a new zero-loss window, even if local packets advance.
    if (old && outbound) {
      if (
        sample.localId !== old.localId ||
        (sample.timestamp !== null &&
          old.timestamp !== null &&
          sample.timestamp < old.timestamp) ||
        (sample.reports !== null &&
          old.reports !== null &&
          sample.reports < old.reports)
      ) {
        previous.set(stat.id, sample);
        outboundMeasurements.delete(stat.id);
        return null;
      }
      const stale =
        sample.timestamp !== null && old.timestamp !== null
          ? sample.timestamp <= old.timestamp
          : sample.reports === null ||
            old.reports === null ||
            sample.reports <= old.reports;
      if (stale) return null;
    }
    previous.set(stat.id, sample);
    if (!old) return null;
    const packetDelta = packets - old.packets;
    if (packetDelta < 0) outboundMeasurements.delete(stat.id);
    if (packetDelta <= 0) return null;
    // Late/reordered packets can legitimately decrease cumulative loss.
    const lostDelta = Math.max(0, lost - old.lost);
    return {
      lost: lostDelta,
      total: received !== null ? packetDelta + lostDelta : packetDelta,
    };
  }

  function normalize(report: RTCStatsReport): CallQualitySnapshot {
    const snapshot = emptySnapshot();
    const measuredAt = performance.now();
    const stats = [...report.values()] as AudioStat[];
    const inbound = stats.filter(
      (stat) => stat.type === "inbound-rtp" && isAudio(stat),
    );
    const outbound = stats.filter(
      (stat) => stat.type === "outbound-rtp" && isAudio(stat),
    );
    const remoteInbound = stats.filter(
      (stat) => stat.type === "remote-inbound-rtp" && isAudio(stat),
    );
    // A changed selected ICE path starts new measurement windows. Cached
    // uplink evidence from the old route says nothing about the new one.
    const audioTransportId =
      outbound[0]?.transportId ?? inbound[0]?.transportId;
    const selectedTransport = stats.find(
      (stat) => stat.type === "transport" && stat.id === audioTransportId,
    );
    const pair = stats.find(
      (stat) =>
        stat.type === "candidate-pair" &&
        stat.id === selectedTransport?.selectedCandidatePairId,
    );
    const currentPath = JSON.stringify([
      audioTransportId,
      pair?.id,
      pair?.localCandidateId,
      pair?.remoteCandidateId,
    ]);
    if (currentPath !== audioPath) {
      resetMeasurements();
      audioPath = currentPath;
    }
    const currentIds = new Set(
      [...inbound, ...remoteInbound].map((stat) => stat.id),
    );
    for (const id of previous.keys()) {
      if (!currentIds.has(id)) previous.delete(id);
    }
    for (const id of outboundMeasurements.keys()) {
      if (!currentIds.has(id)) outboundMeasurements.delete(id);
    }

    let receivedTotal = 0;
    let receivedLost = 0;
    const jitter: Array<number | null> = [];
    for (const stat of inbound) {
      const window = packetWindow(stat);
      if (!window) continue;
      receivedTotal += window.total;
      receivedLost += window.lost;
      const seconds = nonnegative(stat.jitter);
      jitter.push(seconds === null ? null : seconds * 1000);
    }
    snapshot.jitterMs = maximum(jitter);
    if (receivedTotal > 0) {
      snapshot.packetLossPercent = Math.min(
        100,
        (receivedLost / receivedTotal) * 100,
      );
    }

    let sentTotal = 0;
    let sentLost = 0;
    const outboundRtt: Array<number | null> = [];
    const outboundJitter: Array<number | null> = [];
    for (const stat of remoteInbound) {
      const local = outbound.find((item) => item.id === stat.localId);
      const cached = outboundMeasurements.get(stat.id);
      if (!local || (cached && cached.localId !== local.id)) {
        previous.delete(stat.id);
        outboundMeasurements.delete(stat.id);
      }
      if (!local) continue;
      const window = packetWindow(stat, local);
      if (window) {
        const fraction = nonnegative(stat.fractionLost);
        const jitterSeconds = nonnegative(stat.jitter);
        const seconds = nonnegative(stat.roundTripTime);
        const rttMeasurements = nonnegative(stat.roundTripTimeMeasurements);
        outboundMeasurements.set(stat.id, {
          measuredAt,
          localId: local.id,
          ...window,
          ...(fraction !== null && fraction <= 1
            ? { lost: window.total * fraction }
            : {}),
          jitterMs: jitterSeconds === null ? null : jitterSeconds * 1000,
          rttMs:
            seconds !== null &&
            (rttMeasurements !== null ? rttMeasurements > 0 : seconds > 0)
              ? seconds * 1000
              : null,
        });
      }
      const measurement = outboundMeasurements.get(stat.id);
      if (!measurement) continue;
      if (measuredAt - measurement.measuredAt >= OUTBOUND_MEASUREMENT_TTL_MS) {
        outboundMeasurements.delete(stat.id);
        continue;
      }
      sentTotal += measurement.total;
      sentLost += measurement.lost;
      outboundRtt.push(measurement.rttMs);
      outboundJitter.push(measurement.jitterMs);
    }
    snapshot.outboundRttMs = maximum(outboundRtt);
    snapshot.outboundJitterMs = maximum(outboundJitter);
    if (sentTotal > 0) {
      snapshot.outboundPacketLossPercent = Math.min(
        100,
        (sentLost / sentTotal) * 100,
      );
    }

    // Use the audio transport's selected pair, never an unrelated nominated
    // pair (which may be stale after an ICE restart or belong to video).
    if (pair) {
      const seconds = nonnegative(pair.currentRoundTripTime);
      if (
        seconds !== null &&
        (seconds > 0 || (nonnegative(pair.responsesReceived) ?? 0) > 0)
      ) {
        snapshot.rttMs = seconds * 1000;
      }
      const local = stats.find((stat) => stat.id === pair.localCandidateId);
      const remote = stats.find((stat) => stat.id === pair.remoteCandidateId);
      snapshot.localCandidateType = candidateType(local?.candidateType);
      snapshot.remoteCandidateType = candidateType(remote?.candidateType);
      snapshot.transport = transport(local?.relayProtocol ?? local?.protocol);
    }
    snapshot.rttMs ??= snapshot.outboundRttMs;
    snapshot.rating = rating(snapshot);
    return snapshot;
  }

  async function sample(): Promise<void> {
    if (stopped) return;
    if (TERMINAL_STATES.has(call.state)) {
      stop();
      return;
    }
    if (inFlight) return;
    const currentPeer = call.peer?.instance;
    if (currentPeer !== peer) {
      peer = currentPeer;
      resetMeasurements();
    }
    if (
      call.state !== "active" ||
      !peer ||
      peer.connectionState === "closed" ||
      typeof peer.getStats !== "function"
    ) {
      resetMeasurements();
      callback(emptySnapshot());
      return;
    }
    inFlight = true;
    const sampledPeer = peer;
    let snapshot: CallQualitySnapshot | undefined;
    try {
      const report = await sampledPeer.getStats();
      if (stopped) return;
      if (TERMINAL_STATES.has(call.state)) {
        stop();
        return;
      }
      if (call.state !== "active" || call.peer?.instance !== sampledPeer) {
        resetMeasurements();
        snapshot = emptySnapshot();
      } else {
        snapshot = normalize(report);
      }
    } catch {
      // Unsupported/temporarily unavailable browser stats must not affect the
      // call or retain a previous healthy reading.
      resetMeasurements();
      if (!stopped) {
        if (TERMINAL_STATES.has(call.state)) stop();
        else snapshot = emptySnapshot();
      }
    } finally {
      inFlight = false;
    }
    if (snapshot && !stopped) callback(snapshot);
  }

  const interval = setInterval(() => void sample(), SAMPLE_INTERVAL_MS);
  void sample();
  return stop;
}
