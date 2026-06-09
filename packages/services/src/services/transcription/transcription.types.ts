import { TranscriptionSource, TranscriptionStatus } from "@ringee/database";

export interface TranscriptSegmentView {
  id: string;
  text: string;
  speaker: number | null;
  track: string | null;
  confidence: number | null;
  startMs: number | null;
  endMs: number | null;
  createdAt: Date;
}

export interface TranscriptionView {
  id: string;
  source: TranscriptionSource;
  status: TranscriptionStatus;
  text: string | null;
  language: string | null;
  confidence: number | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  segments: TranscriptSegmentView[];
}

export interface LivePartialView {
  track: string | null;
  text: string;
}

/**
 * Everything the UI needs to render the Transcribe button, the Live Transcript
 * panel and the Final Transcript view for a single call.
 */
export interface CallTranscriptionView {
  callId: string;
  /** A recording (PublicRecording) exists and can be (re)transcribed. */
  recordingAvailable: boolean;
  /** Backend has DEEPGRAM_API_KEY configured. */
  transcriptionEnabled: boolean;
  realtime: TranscriptionView | null;
  recording: TranscriptionView | null;
  /** Current in-flight partial from the live socket, if any. */
  livePartial: LivePartialView | null;
}
