/**
 * Measures how the agent's outgoing audio actually flowed on one call, in the
 * browser that sends it.
 *
 * Telnyx's per-leg statistics showed the extension's legs arriving with holes
 * the web app's legs do not have: in the worst calls the browser sent about a
 * third of the packets real time asks for, while the audio it received was
 * intact (2026-10-31, "Browser audio" in docs/engineering/TELEPHONY.md). The
 * provider sees that packets are missing, not why. These readings tell the
 * causes apart — microphone audio captured against elapsed time (the device
 * stopped delivering) and packets sent per window (the sender stopped
 * sending) — next to the network path and the SDK's own warnings.
 *
 * It only reads `getStats()`; it never changes the call.
 */
import type { CallQualitySummary } from "../contracts/call";

/** One `getStats()` reading, reduced to what the summary needs. */
export interface QualityReading {
  /** When it was taken, in ms on a monotonic clock. */
  at: number;
  /** The call was on hold, which sends nothing by design. */
  held?: boolean;
  capturedSec?: number;
  packetsSent?: number;
  packetsReceived?: number;
  packetsLost?: number;
  jitterSec?: number;
  rttSec?: number;
  path?: string;
  pathChanges?: number;
}

/** How often a probe reads the connection. */
const READ_EVERY_MS = 2_000;
/** A window below these shares of real time / the usual send rate is a gap. */
const CAPTURE_GAP_SHARE = 0.8;
const SEND_GAP_SHARE = 0.6;
/** Counters that only grow on one connection; going back means a new one. */
const COUNTERS = ["capturedSec", "packetsSent", "packetsReceived"] as const;

/** Reduce one `getStats()` report to a reading. Addresses are never read. */
export function readQuality(
  report: RTCStatsReport,
  at: number,
): QualityReading {
  const reading: QualityReading = { at };
  let pairId: string | undefined;
  report.forEach((stat) => {
    if (stat.type === "media-source" && stat.kind === "audio") {
      reading.capturedSec = stat.totalSamplesDuration;
    } else if (stat.type === "outbound-rtp" && stat.kind === "audio") {
      reading.packetsSent = stat.packetsSent;
    } else if (stat.type === "inbound-rtp" && stat.kind === "audio") {
      reading.packetsReceived = stat.packetsReceived;
      reading.packetsLost = stat.packetsLost;
      reading.jitterSec = stat.jitter;
    } else if (stat.type === "transport") {
      pairId = stat.selectedCandidatePairId;
      reading.pathChanges = stat.selectedCandidatePairChanges;
    }
  });
  const pair = pairId ? report.get(pairId) : undefined;
  if (pair) {
    reading.rttSec = pair.currentRoundTripTime;
    const local = report.get(pair.localCandidateId);
    // A relay's own link to the TURN server is what can turn into TCP.
    const transport = local?.relayProtocol ?? local?.protocol;
    if (local?.candidateType) {
      reading.path = transport
        ? `${local.candidateType}/${transport}`
        : local.candidateType;
    }
  }
  return reading;
}

/** Fold a call's readings into its summary. */
export function summarizeQuality(
  readings: readonly QualityReading[],
  about: Pick<CallQualitySummary, "telnyxSessionId" | "mic" | "warnings">,
): CallQualitySummary {
  let measuredSec = 0;
  let capturedSec = 0;
  let captureGaps = 0;
  let packetsSent = 0;
  let packetsReceived = 0;
  let packetsLost = 0;
  const sendRates: number[] = [];
  for (let i = 1; i < readings.length; i += 1) {
    const from = readings[i - 1];
    const to = readings[i];
    if (!from || !to) continue;
    const sec = (to.at - from.at) / 1000;
    // Hold sends nothing by design; a counter that went back means the call
    // was recovered on a new connection between the two readings.
    if (sec <= 0 || from.held || to.held || wentBack(from, to)) continue;
    // Without capture and sending at both ends, the window's time would be
    // counted without its audio and read as a gap.
    if (!measured(from) || !measured(to)) continue;
    measuredSec += sec;
    const captured = to.capturedSec - from.capturedSec;
    capturedSec += captured;
    if (captured < sec * CAPTURE_GAP_SHARE) captureGaps += 1;
    const sent = to.packetsSent - from.packetsSent;
    packetsSent += sent;
    sendRates.push(sent / sec);
    packetsReceived += growth(from.packetsReceived, to.packetsReceived);
    packetsLost += growth(from.packetsLost, to.packetsLost);
  }
  const usualRate = median(sendRates);
  const last = readings[readings.length - 1];
  return {
    telnyxSessionId: about.telnyxSessionId,
    measuredSec: round1(measuredSec),
    capturedSec: round1(capturedSec),
    captureGaps,
    packetsSent,
    sentPerSec: measuredSec > 0 ? round1(packetsSent / measuredSec) : 0,
    sendGaps:
      usualRate > 0
        ? sendRates.filter((rate) => rate < usualRate * SEND_GAP_SHARE).length
        : 0,
    packetsReceived,
    packetsLost,
    jitterMsMax: highestMs(readings.map((r) => r.jitterSec)),
    rttMsMax: highestMs(readings.map((r) => r.rttSec)),
    path: last?.path,
    pathChanges: last?.pathChanges,
    mic: about.mic,
    warnings: about.warnings,
  };
}

export interface CallQualityProbe {
  /** Begin reading once the far end answers; later calls are ignored. */
  start(): void;
  /** Leave the time on hold out of the windows. */
  setHeld(held: boolean): void;
  /** Count a provider SDK warning raised during the call. */
  warn(name: string): void;
  /** Stop and fold what was measured; null when the call never was. */
  finish(telnyxSessionId?: string): CallQualitySummary | null;
}

export interface CallQualityProbeOptions {
  /** The call's current connection (`getCallPeerConnection`). */
  peer: () => RTCPeerConnection | undefined;
  /** The microphone stream the call sends. */
  mic?: MediaStream | null;
  intervalMs?: number;
  now?: () => number;
}

/** Read a call's connection every couple of seconds while it is answered. */
export function createCallQualityProbe(
  options: CallQualityProbeOptions,
): CallQualityProbe {
  const intervalMs = options.intervalMs ?? READ_EVERY_MS;
  const now = options.now ?? (() => performance.now());
  const track = options.mic?.getAudioTracks()[0];
  const readings: QualityReading[] = [];
  const warnings: Record<string, number> = {};
  let held = false;
  let muteEvents = 0;
  let micEnded = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let finished = false;
  let inFlight = false;

  const onMute = () => {
    muteEvents += 1;
  };
  // Fires when the device goes away, not when the call stops the track.
  const onEnded = () => {
    micEnded = true;
  };
  track?.addEventListener("mute", onMute);
  track?.addEventListener("ended", onEnded);

  const read = async () => {
    const peer = options.peer();
    // One `getStats()` at a time, so readings land in the order taken.
    if (!peer || finished || inFlight) return;
    inFlight = true;
    const heldBefore = held;
    try {
      const report = await peer.getStats();
      if (finished) return;
      readings.push({
        ...readQuality(report, now()),
        held: heldBefore || held,
      });
    } catch {
      // The connection closed between two readings.
    } finally {
      inFlight = false;
    }
  };

  return {
    start() {
      if (timer !== undefined || finished) return;
      void read();
      timer = setInterval(() => void read(), intervalMs);
    },
    setHeld(next) {
      held = next;
    },
    warn(name) {
      warnings[name] = (warnings[name] ?? 0) + 1;
    },
    finish(telnyxSessionId) {
      if (finished) return null;
      finished = true;
      clearInterval(timer);
      track?.removeEventListener("mute", onMute);
      track?.removeEventListener("ended", onEnded);
      if (readings.length < 2) return null;
      return summarizeQuality(readings, {
        telnyxSessionId,
        warnings,
        mic: track
          ? { label: track.label, muteEvents, ended: micEnded }
          : undefined,
      });
    },
  };
}

function wentBack(from: QualityReading, to: QualityReading): boolean {
  return COUNTERS.some((key) => {
    const before = from[key];
    const after = to[key];
    return before !== undefined && after !== undefined && after < before;
  });
}

/** The reading saw both the microphone and the sender. */
function measured(
  r: QualityReading,
): r is QualityReading & { capturedSec: number; packetsSent: number } {
  return r.capturedSec !== undefined && r.packetsSent !== undefined;
}

function growth(from?: number, to?: number): number {
  return from !== undefined && to !== undefined ? to - from : 0;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function highestMs(
  values: readonly (number | undefined)[],
): number | undefined {
  const seen = values.filter((v): v is number => typeof v === "number");
  return seen.length ? Math.round(Math.max(...seen) * 1000) : undefined;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
