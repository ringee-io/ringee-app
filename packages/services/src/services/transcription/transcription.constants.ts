/**
 * Redis key for the current in-flight partial of a live transcription. We keep
 * only the latest partial (not persisted to the DB) so the frontend poll can
 * paint "text while the person is speaking". Final segments live in Postgres.
 */
export const livePartialKey = (callId: string): string =>
  `transcription:live:${callId}`;

/** TTL for the live partial; long enough to survive a poll gap, short enough
 * that a stale partial disappears once the call ends. (ms) */
export const LIVE_PARTIAL_TTL_MS = 15_000;

export interface LivePartial {
  track: string | null;
  text: string;
  at: number;
}

/** Stable speaker index per Telnyx track, used when not relying on Deepgram
 * diarization. Outbound (the agent) = 0, inbound (the contact) = 1. */
export const trackToSpeaker = (
  track: string | null | undefined,
): number | null => {
  if (track === "outbound") return 0;
  if (track === "inbound") return 1;
  return null;
};

/**
 * Render transcript segments as a speaker-labeled markdown transcript for the
 * CRM note. Attribution:
 *  - Telnyx per-track live streams are reliable → "Agent" (outbound track) and
 *    "Contact" (inbound track).
 *  - Deepgram diarization on a single-channel recording only yields an
 *    unordered speaker index that does NOT map to a role, so those are labeled
 *    "Speaker 1/2…" instead of guessing Agent vs Contact (never mislabel).
 * Consecutive segments from the same speaker are merged into one block.
 */
export function formatTranscriptWithSpeakers(
  segments: Array<{
    text: string;
    speaker?: number | null;
    track?: string | null;
  }>,
): string {
  const labelFor = (seg: {
    speaker?: number | null;
    track?: string | null;
  }): string | null => {
    if (seg.track === "outbound") return "Agent";
    if (seg.track === "inbound") return "Contact";
    if (seg.speaker != null) return `Speaker ${seg.speaker + 1}`;
    return null;
  };

  const blocks: string[] = [];
  let label: string | null | undefined = undefined;
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    const text = buffer.join(" ").replace(/\s+/g, " ").trim();
    if (text) blocks.push(label ? `**${label}:** ${text}` : text);
    buffer = [];
  };

  for (const seg of segments) {
    const t = seg.text?.trim();
    if (!t) continue;
    const segLabel = labelFor(seg);
    if (segLabel !== label) {
      flush();
      label = segLabel;
    }
    buffer.push(t);
  }
  flush();

  return blocks.join("\n\n");
}
