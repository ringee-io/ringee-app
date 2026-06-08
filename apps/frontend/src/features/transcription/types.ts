// Mirrors the backend CallTranscriptionView (packages/services transcription).

export type TranscriptionStatus =
  | 'idle'
  | 'starting'
  | 'transcribing'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'unavailable'
  | 'stopped';

export type TranscriptionSource = 'realtime' | 'recording';

export interface TranscriptSegmentView {
  id: string;
  text: string;
  speaker: number | null;
  track: string | null;
  confidence: number | null;
  startMs: number | null;
  endMs: number | null;
  createdAt: string;
}

export interface TranscriptionView {
  id: string;
  source: TranscriptionSource;
  status: TranscriptionStatus;
  text: string | null;
  language: string | null;
  confidence: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  segments: TranscriptSegmentView[];
}

export interface LivePartialView {
  track: string | null;
  text: string;
}

export interface CallTranscriptionView {
  callId: string;
  recordingAvailable: boolean;
  transcriptionEnabled: boolean;
  realtime: TranscriptionView | null;
  recording: TranscriptionView | null;
  livePartial: LivePartialView | null;
}

export interface RecordingSettings {
  recordAllCalls: boolean;
  transcribeRealtime: boolean;
  transcribeRecordings: boolean;
}

/** Statuses that mean "something is in flight" → keep polling. */
export const IN_FLIGHT_STATUSES: TranscriptionStatus[] = [
  'starting',
  'transcribing',
  'processing'
];
