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
export const trackToSpeaker = (track: string | null | undefined): number | null => {
  if (track === "outbound") return 0;
  if (track === "inbound") return 1;
  return null;
};
