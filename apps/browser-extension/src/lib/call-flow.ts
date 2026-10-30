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
/**
 * Translate a successful backend prepare-call into the START_CALL message the
 * offscreen engine consumes. The extension dials only with the credential the
 * backend minted for this call — it never ships a SIP password of its own —
 * and with the backend-resolved caller ID, which already honors the user's
 * "Call from" pick and the rotation rules.
 */
export function buildStartCall(
  prepared: PrepareCallResponse,
  identity: { userId: string; orgId?: string },
): StartCallMsg {
  return {
    type: MessageType.StartCall,
    sip: {
      username: prepared.credential.sipUsername,
      password: prepared.credential.sipPassword,
    },
    callerId: prepared.callerId,
    destination: prepared.destination,
    userId: identity.userId,
    organizationId: identity.orgId,
    callId: prepared.callId ?? undefined,
    dialToken: prepared.dialToken,
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
