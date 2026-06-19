/**
 * Core dialer types shared by the web app (`apps/frontend`) and the
 * browser extension (`apps/browser-extension`). Framework-agnostic — no React,
 * no Next, no Chrome APIs — so every surface speaks the exact same vocabulary.
 */

/**
 * Lifecycle of a single call. This is what the Active Call Modal renders and
 * what the extension's offscreen WebRTC engine reports back to the side panel.
 */
export type CallState =
  | "idle"
  | "requesting" // resolving credentials / DNC / contact — call not placed yet
  | "connecting" // WebRTC dialing
  | "ringing"
  | "active"
  | "held"
  | "ended"
  | "failed";

export const LIVE_CALL_STATES: readonly CallState[] = [
  "requesting",
  "connecting",
  "ringing",
  "active",
  "held",
];

export function isLiveCallState(state: CallState): boolean {
  return LIVE_CALL_STATES.includes(state);
}

/**
 * Telnyx client socket / SIP registration status. Distinct from {@link CallState}:
 * this describes the long-lived connection, not an individual call.
 */
export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "registering"
  | "registered"
  | "reconnecting";

/**
 * Disposition saved after a call. Identical set in both hosts so the shared
 * post-call view and the backend `/meetings/call-outcome` endpoint agree.
 *
 * Note: the extension's "minimum outcomes" (Connected / No answer / Voicemail /
 * Wrong number / Interested / Not interested / Callback requested) are a subset
 * of this — "Connected" is a call *state*, not a stored disposition, so a
 * connected call is saved as `interested` / `follow_up` / etc.
 */
export type CallOutcome =
  | "meeting_booked"
  | "sale"
  | "interested"
  | "follow_up"
  | "callback_scheduled"
  | "not_interested"
  | "no_answer"
  | "voicemail"
  | "wrong_number"
  | "gatekeeper";

/**
 * Where a call originated when it was started from an external web page.
 * Only ever populated from a clear user action (click-to-call / context menu)
 * and limited to non-sensitive, visible page context.
 */
export interface PageOrigin {
  /** Page URL at the moment of the click. */
  url?: string;
  /** Page <title>. */
  title?: string;
  /** Contact name inferred from nearby DOM, only when reasonable. */
  detectedName?: string;
  /** Company inferred from nearby DOM, only when reasonable. */
  detectedCompany?: string;
  /** Hostname the dial came from, for analytics. */
  source?: string;
}

/** A request to dial a number, with optional scraped context. */
export interface DialTarget {
  /** E.164, e.g. +18095551234 */
  destination: string;
  name?: string;
  company?: string;
  origin?: PageOrigin;
}

/** A contact the call is attributed to. */
export interface ContactRef {
  id: string;
  name?: string;
  company?: string;
}

/** Ephemeral Telnyx WebRTC SIP login minted by the backend (~1h TTL). */
export interface TelephonyCredential {
  sipUsername: string;
  sipPassword: string;
  expiresAt: string;
  connectionId: string;
}

/** A number the user may present as caller ID. Always resolved server-side. */
export interface CallerId {
  id: string;
  phoneNumber: string;
  isDefault?: boolean;
  label?: string;
}
