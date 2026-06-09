/**
 * Normalized transcription primitives shared by the realtime and pre-recorded
 * Deepgram paths. Keeping a single shape means the persistence/UI layers never
 * branch on which Deepgram endpoint produced a segment.
 */

export interface TranscriptSegment {
  text: string;
  /** Speaker index when available (diarization or per-track mapping). */
  speaker?: number | null;
  /** Logical audio track, e.g. "inbound" | "outbound". */
  track?: string | null;
  confidence?: number | null;
  /** Offset of the segment from the start of the stream, in milliseconds. */
  startMs?: number | null;
  endMs?: number | null;
}

export interface PrerecordedResult {
  text: string;
  confidence?: number | null;
  language?: string | null;
  durationMs?: number | null;
  /** Provider-reported request cost in USD, when available. */
  costUsd?: number | null;
  segments: TranscriptSegment[];
  /** Raw provider payload, persisted in metadata for debugging/audit. */
  raw?: unknown;
}

export interface DeepgramTranscribeOptions {
  model?: string;
  language?: string;
  diarize?: boolean;
  punctuate?: boolean;
  smartFormat?: boolean;
}

/** Audio encoding of the frames pushed into a live session. */
export interface DeepgramLiveOptions {
  model?: string;
  language?: string;
  /** Deepgram `encoding` value, e.g. "mulaw" (Telnyx default) or "linear16". */
  encoding?: string;
  sampleRate?: number;
  /** Logical track this socket carries, surfaced back on every segment. */
  track?: string;
  /** Stable speaker index for this track when not using diarization. */
  speaker?: number;
}

export interface DeepgramLiveCallbacks {
  /** Fired for interim (non-final) results — used to paint the live partial. */
  onPartial?: (text: string) => void;
  /** Fired once per finalized utterance — these are the segments we persist. */
  onFinal?: (segment: TranscriptSegment) => void;
  onOpen?: () => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

/** Handle returned by {@link DeepgramService.openLive}. */
export interface DeepgramLiveSession {
  /** Push raw audio bytes (matching the configured encoding) to Deepgram. */
  sendAudio(chunk: Buffer): void;
  /** Flush and gracefully close the Deepgram socket. */
  finish(): void;
  /** Force-close without waiting for a final result. */
  close(): void;
  readonly track: string;
}
