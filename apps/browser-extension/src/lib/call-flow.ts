/**
 * Pure call-flow helpers shared by the service worker and the side panel —
 * extracted so the prepare-call → start-call pipeline and its error states can
 * be unit-tested without the chrome.* APIs.
 */
import {
  MessageType,
  type CallSnapshotMsg,
  type CallState,
  type StartCallMsg,
} from "@ringee/dialer-core/contracts";
import type {
  PrepareCallErrorCode,
  PrepareCallResponse,
} from "./ringee-api";

/** User-facing copy for every backend prepare-call failure code. */
export const ERROR_COPY: Record<PrepareCallErrorCode, string> = {
  UNAUTHENTICATED: "Sign in to Ringee to place calls.",
  NO_WORKSPACE: "No active workspace — open Ringee and pick one.",
  NO_CALLER_ID: "No caller ID available for this workspace.",
  INSUFFICIENT_CREDITS: "Not enough credits to place this call.",
  DNC_BLOCKED: "This number is on the Do-Not-Call list.",
  FORBIDDEN: "You don't have permission to call from this workspace.",
  CONTACT_FAILED: "Could not attach the call to a contact.",
  UNKNOWN: "Could not start the call. Please try again.",
};

/** The snapshot patch the side panel renders when prepare-call fails. */
export function failureSnapshot(
  code: PrepareCallErrorCode,
): Pick<CallSnapshotMsg, "state" | "error" | "dncBlocked"> {
  return {
    state: "failed",
    error: ERROR_COPY[code] ?? ERROR_COPY.UNKNOWN,
    dncBlocked: code === "DNC_BLOCKED",
  };
}

/**
 * Optional static Telnyx WebRTC SIP credentials supplied via the extension's
 * own env (Vite) — the same shared credentials the web app dials with
 * (NEXT_PUBLIC_TELNYX_LOGIN / NEXT_PUBLIC_TELNYX_PASSWORD). Both must be present
 * to count as configured.
 */
export function staticCredentials(): { login: string; password: string } | null {
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
 * offscreen engine consumes. The caller ID and SIP credentials normally come
 * straight from the backend response, but when static env credentials / caller
 * ID are configured (web-app style) they take precedence — so the extension
 * dials with the same shared line the web app does.
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
    callerId: staticCallerId() ?? prepared.callerId,
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
 * still dial with the shared web-app credentials. Returns null unless BOTH
 * static SIP credentials and a static caller ID are configured.
 */
export function buildStaticStartCall(
  target: { destination: string },
  identity: { userId: string; orgId?: string },
): StartCallMsg | null {
  const creds = staticCredentials();
  const callerId = staticCallerId();
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
