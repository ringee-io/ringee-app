/**
 * Pure call-flow helpers shared by the service worker and the side panel —
 * extracted so the prepare-call → start-call pipeline and its error states can
 * be unit-tested without the chrome.* APIs.
 */
import {
  MessageType,
  type CallEventMsg,
  type CallSnapshotMsg,
  type CallState,
  type StartCallMsg,
} from "@ringee/dialer-core/contracts";
import type { PrepareCallErrorCode, PrepareCallResponse } from "./ringee-api";

/** User-facing copy for every backend prepare-call failure code. */
export const ERROR_COPY: Record<PrepareCallErrorCode, string> = {
  UNAUTHENTICATED: "Sign in to Ringee to place calls.",
  NO_WORKSPACE: "No active workspace — open Ringee and pick one.",
  NO_CALLER_ID: "No caller ID available for this workspace.",
  INSUFFICIENT_CREDITS: "Not enough credits to place this call.",
  DNC_BLOCKED: "This number is on the Do-Not-Call list.",
  CONCURRENT_CALL:
    "You already have a call in progress on another device. End it before starting another.",
  FORBIDDEN: "You don't have permission to call from this workspace.",
  CONTACT_FAILED: "Could not attach the call to a contact.",
  UNKNOWN: "Could not start the call. Please try again.",
};

/**
 * The snapshot patch the side panel renders when prepare-call fails.
 *
 * `serverMessage` wins when present: the backend often knows more than the code
 * does (which device is already on a call, which country has no caller ID).
 */
export function failureSnapshot(
  code: PrepareCallErrorCode,
  serverMessage?: string | null,
): Pick<CallSnapshotMsg, "state" | "error" | "dncBlocked" | "concurrentCall"> {
  return {
    state: "failed",
    error: serverMessage?.trim() || ERROR_COPY[code] || ERROR_COPY.UNKNOWN,
    dncBlocked: code === "DNC_BLOCKED",
    concurrentCall: code === "CONCURRENT_CALL",
  };
}

/**
 * Merge a WebRTC lifecycle event into the background snapshot without losing
 * the Telnyx session id. Some final SDK updates omit `telnyxIDs`, so blindly
 * assigning `undefined` on `ended` makes the post-call note impossible to
 * associate with its backend Call row.
 */
export function callEventSnapshotPatch(
  current: CallSnapshotMsg,
  event: CallEventMsg,
): Partial<Omit<CallSnapshotMsg, "type">> {
  const cause = event.detail?.cause;
  return {
    state: event.state,
    error: event.detail?.error ?? cause,
    telnyxSessionId: event.detail?.telnyxSessionId ?? current.telnyxSessionId,
  };
}

/**
 * Optional static Telnyx WebRTC SIP credentials supplied via the extension's
 * own env (Vite) — the same shared credentials the web app dials with
 * (NEXT_PUBLIC_TELNYX_LOGIN / NEXT_PUBLIC_TELNYX_PASSWORD). Both must be present
 * to count as configured.
 */
export function staticCredentials(): {
  login: string;
  password: string;
} | null {
  const login = import.meta.env.VITE_TELNYX_LOGIN?.trim();
  const password = import.meta.env.VITE_TELNYX_PASSWORD?.trim();
  return login && password ? { login, password } : null;
}

/** Optional static public caller ID from env (NEXT_PUBLIC_RINGEE_PUBLIC_CALLER_ID style). */
export function staticCallerId(): string | undefined {
  return import.meta.env.VITE_RINGEE_PUBLIC_CALLER_ID?.trim() || undefined;
}

/**
 * Translate a successful backend prepare-call into the START_CALL message the
 * offscreen engine consumes. Static env SIP credentials (web-app style) take
 * precedence over the minted per-call ones so the extension dials on the same
 * shared connection the web app does — but the caller ID is ALWAYS the
 * backend-resolved one: it already honors the user's "Call from" pick and the
 * rotation rules, and letting the static public caller ID win here would
 * silently override that pick on every call. The static caller ID is only used
 * on the no-backend path (see `buildStaticStartCall`).
 */
export function buildStartCall(
  prepared: PrepareCallResponse,
  identity: { userId: string; orgId?: string },
): StartCallMsg {
  const creds = staticCredentials();
  return {
    type: MessageType.StartCall,
    sip: creds
      ? { username: creds.login, password: creds.password }
      : {
          username: prepared.credential.sipUsername,
          password: prepared.credential.sipPassword,
        },
    callerId: prepared.callerId,
    destination: prepared.destination,
    userId: identity.userId,
    organizationId: identity.orgId,
    callId: prepared.callId ?? undefined,
  };
}

/**
 * Build START_CALL purely from static env credentials, bypassing the backend.
 * Used as a fallback when prepare-call is unavailable (backend down, no
 * server-resolved caller ID, credential minting failed) so the extension can
 * still dial with the shared web-app credentials. The user's "Call from" pick
 * (already limited to their own workspace numbers by the picker) still wins
 * over the static public caller ID. Returns null unless static SIP credentials
 * AND some caller ID (picked or static) are available.
 */
export function buildStaticStartCall(
  target: { destination: string },
  identity: { userId: string; orgId?: string },
  preferredCallerId?: string,
): StartCallMsg | null {
  const creds = staticCredentials();
  const callerId = preferredCallerId || staticCallerId();
  if (!creds || !callerId) return null;
  return {
    type: MessageType.StartCall,
    sip: { username: creds.login, password: creds.password },
    callerId,
    destination: target.destination,
    userId: identity.userId,
    organizationId: identity.orgId,
    callId: undefined,
  };
}

/** Status label rendered in the Active Call Modal / side panel per call state. */
export const STATUS_TEXT: Record<CallState, string> = {
  idle: "Ready",
  requesting: "Preparing…",
  connecting: "Connecting…",
  ringing: "Ringing…",
  active: "Connected",
  held: "On hold",
  ended: "Call ended",
  failed: "Call failed",
};

export function statusTextFor(state: CallState): string {
  return STATUS_TEXT[state] ?? STATUS_TEXT.idle;
}
