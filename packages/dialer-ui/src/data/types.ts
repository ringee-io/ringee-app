import type { ReactNode } from "react";
import type { CallOutcome } from "@ringee/dialer-core";

/**
 * The data operations the shared Active Call Modal / Post-Call view perform
 * *directly*. Everything richer (booking calendar, contact timeline, live
 * transcription) is provided as a {@link DialerSlots slot} instead, because
 * those panels are inherently host-data-coupled.
 *
 * Each host implements this against its own transport:
 *   - `apps/frontend`           → Clerk-authenticated `ApiClient` (useApi).
 *   - `apps/browser-extension`  → fetch + Clerk-chrome token.
 *
 * This is the seam that lets a single modal serve both surfaces.
 */
export interface DialerDataClient {
  /**
   * Persist the disposition + note for a finished call. `outcome` is optional:
   * Skip/close send the SAME request without one, which still pushes the CRM
   * call-log note immediately (POST /meetings/call-outcome on both hosts).
   * With a `dispositionId`, the server records the outcome that disposition
   * maps to; `outcome` is only what the screen showed.
   */
  saveCallOutcome(input: {
    callId?: string | null;
    callSessionId?: string | null;
    outcome?: CallOutcome;
    outcomeNote?: string;
    dispositionId?: string | null;
  }): Promise<void>;
  /**
   * The workspace's default dispositions, in order. A host without them (or a
   * workspace whose list comes back empty) gets the built-in outcome buttons.
   * Called during the call to warm up, so the post-call view opens filled —
   * hosts should answer from a cache when they can.
   */
  listDispositions?(): Promise<DialerDisposition[]>;
}

/**
 * One of the workspace's own dispositions ("Demo booked"), as the post-call
 * view offers it. Picking it records `canonicalOutcome` — the meaning the rest
 * of Ringee reads — with the disposition beside it.
 */
export interface DialerDisposition {
  id: string;
  label: string;
  color: string | null;
  canonicalOutcome: CallOutcome;
}

/** Workspace recording policy that gates the manual record/transcribe buttons. */
export interface DialerRecordingSettings {
  /** When true, the backend records every call and the manual toggle is locked. */
  recordAllCalls: boolean;
  /** When true, realtime transcription is auto-started by the backend. */
  transcribeRealtime: boolean;
}

/**
 * Host-supplied renderers for the rich, data-coupled panels. A host only
 * provides what it supports; the modal hides any panel whose slot is absent.
 * This is how the same component shows the full experience in the web app and
 * a lighter one in the extension — differences via configuration, not a fork.
 */
export interface DialerSlots {
  renderContactActivities?: (args: { contactId: string }) => ReactNode;
  renderContactInfo?: (args: { contactId: string }) => ReactNode;
  renderScript?: () => ReactNode;
  renderBookMeeting?: (args: {
    contactId: string;
    callId?: string | null;
    onBooked: () => void;
    onCancel: () => void;
  }) => ReactNode;
  renderScheduleCallback?: (args: {
    contactId: string;
    callId?: string | null;
    onScheduled: () => void;
    onCancel: () => void;
  }) => ReactNode;
  renderSubtitles?: (args: {
    callId?: string | null;
    show: boolean;
  }) => ReactNode;
  renderLiveTranscriptPanel?: (args: { callId?: string | null }) => ReactNode;
  renderTranscriptDialog?: (args: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    callId?: string | null;
  }) => ReactNode;
  renderTranscribeButton?: (args: {
    callId?: string | null;
    mode: "active" | "history";
    onView?: () => void;
  }) => ReactNode;
  /**
   * Post-call voicemail drop: pick a greeting from the workspace bucket (or
   * record one on the spot) and send it as its own call. Absent on hosts that
   * cannot record audio, in which case the post-call view hides the action.
   */
  renderVoicemailDrop?: (args: {
    phoneNumber: string;
    contactId?: string | null;
    callId?: string | null;
    onSent: () => void;
    onCancel: () => void;
  }) => ReactNode;
}

/** A few strings the web app localizes; English defaults keep the modal usable. */
export interface DialerLabels {
  callbackBadge: string;
  callbackDisposition: string;
}

export const DEFAULT_DIALER_LABELS: DialerLabels = {
  callbackBadge: "Callback requested",
  callbackDisposition: "Callback",
};

export type DialerNotify = (kind: "success" | "error", message: string) => void;

export interface DialerContextValue {
  data: DialerDataClient;
  recordingSettings: DialerRecordingSettings;
  slots: DialerSlots;
  labels: DialerLabels;
  notify: DialerNotify;
}
