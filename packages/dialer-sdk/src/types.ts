/**
 * Public type surface for `@ringee-io/dialer-sdk`.
 *
 * Framework-agnostic — no React, no DOM-framework types. Everything a CRM
 * integrator needs to build a fully custom dialer UI is here. Telnyx is never
 * referenced: the SDK owns the provider entirely.
 */

/** Authentication lifecycle of the agent (email OTP). */
export type AuthState =
  | "checking"
  | "anonymous"
  | "sending_code"
  | "awaiting_code"
  | "verifying"
  | "authenticated"
  | "expired"
  | "signed_out"
  | "error";

/** Public, provider-independent call lifecycle. */
export type DialerState =
  | "uninitialized"
  | "initializing"
  | "ready"
  | "connecting"
  | "dialing"
  | "ringing"
  | "active"
  | "held"
  | "reconnecting"
  | "ending"
  | "ended"
  | "error";

export interface RingeeDialerOptions {
  /** Publishable key (`pk_live_...`). Safe to ship in frontend code. */
  key: string;
  /** Override the Ringee API base URL (defaults to the production API). */
  apiUrl?: string;
  /** Pre-fill the email field only. NEVER treated as a verified identity. */
  agentEmail?: string;
  /** Emit verbose logs to the console. */
  debug?: boolean;
}

export interface EmailChallenge {
  id: string;
  maskedEmail: string;
  expiresAt: Date;
  resendAvailableAt: Date;
}

export interface VerifyEmailCodeInput {
  challengeId: string;
  code: string;
}

export interface RingeeAgent {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  imageUrl: string | null;
  organizationId: string | null;
  role: string | null;
}

export interface RingeeCallerId {
  id: string;
  phoneNumber: string;
  isPrimary: boolean;
  canRecord: boolean;
}

export interface StartCallInput {
  /** E.164 destination, e.g. "+13055550198". */
  to: string;
  /** Optional caller-ID id (one of {@link RingeeAgent} caller IDs). */
  callerIdId?: string;
  /** Optional Ringee contact id to attach the call to. */
  contactId?: string;
  /** Optional CRM contact id, resolved via the integration's contact links. */
  externalContactId?: string;
}

export interface RingeeCall {
  id: string;
  to: string;
  from: string;
  direction: "outbound" | "inbound";
  state: DialerState;
  startedAt: Date | null;
  answeredAt: Date | null;
  endedAt: Date | null;
  durationSeconds: number;
  muted: boolean;
  held: boolean;
}

export interface AudioDevice {
  id: string;
  label: string;
  kind: "input" | "output";
}

/** Event name → payload map. Subscribe with {@link RingeeDialer.on}. */
export interface RingeeEventPayloads {
  ready: Record<string, never>;
  // auth
  authStateChanged: { state: AuthState };
  authRequired: Record<string, never>;
  codeSent: { challenge: EmailChallenge };
  signedIn: { agent: RingeeAgent };
  signedOut: Record<string, never>;
  sessionExpired: Record<string, never>;
  // call
  stateChanged: { state: DialerState };
  dialing: { call: RingeeCall };
  ringing: { call: RingeeCall };
  answered: { call: RingeeCall };
  held: { call: RingeeCall };
  resumed: { call: RingeeCall };
  muted: { call: RingeeCall };
  unmuted: { call: RingeeCall };
  ended: { call: RingeeCall };
  failed: { call: RingeeCall | null; error: RingeeErrorLike };
  tokenExpiring: Record<string, never>;
  microphoneDenied: Record<string, never>;
  deviceChanged: Record<string, never>;
  error: { error: RingeeErrorLike };
}

export type RingeeEventName = keyof RingeeEventPayloads;

export type RingeeEventHandler<TEvent extends RingeeEventName> = (
  payload: RingeeEventPayloads[TEvent],
) => void;

/** Minimal shape of a {@link RingeeError} for event payloads (avoids a cycle). */
export interface RingeeErrorLike {
  code: RingeeErrorCode;
  message: string;
  retryable: boolean;
}

export type RingeeErrorCode =
  | "INVALID_PUBLISHABLE_KEY"
  | "DOMAIN_NOT_ALLOWED"
  | "INTEGRATION_DISABLED"
  | "RATE_LIMITED"
  | "INVALID_EMAIL"
  | "EMAIL_CHALLENGE_EXPIRED"
  | "INVALID_EMAIL_CODE"
  | "EMAIL_CODE_ATTEMPTS_EXCEEDED"
  | "AGENT_NOT_ALLOWED"
  | "AGENT_NOT_IN_WORKSPACE"
  | "USER_BLOCKED"
  | "CALLING_DISABLED"
  | "SESSION_EXPIRED"
  | "SDK_NOT_INITIALIZED"
  | "AUTH_REQUIRED"
  | "MICROPHONE_DENIED"
  | "NO_AUDIO_DEVICE"
  | "AUDIO_PLAYBACK_BLOCKED"
  | "NO_CALLER_ID"
  | "CALLER_ID_NOT_ALLOWED"
  | "INSUFFICIENT_CREDIT"
  | "DNC_BLOCKED"
  | "INVALID_PHONE_NUMBER"
  | "CALL_ALREADY_ACTIVE"
  | "NO_ACTIVE_CALL"
  | "INVALID_CALL_STATE"
  | "TELNYX_CONNECTION_FAILED"
  | "CALL_FAILED"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "UNKNOWN_ERROR";
