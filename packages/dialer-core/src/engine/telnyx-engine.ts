/**
 * The one and only place a Telnyx WebRTC call is created in the whole monorepo.
 *
 * Both consumers use these helpers so there is exactly one implementation of
 * "place a call", "mute", "hold", "hang up", "DTMF" and the SIP attribution
 * headers:
 *   - `apps/frontend`            → calls these directly inside React hooks.
 *   - `apps/browser-extension`   → calls these from the offscreen document
 *                                  (WebRTC must never live in the service worker).
 *
 * Nothing here is hardcoded: credentials and caller ID are always passed in by
 * the host after the backend has resolved them.
 */
import { TelnyxRTC } from "@telnyx/webrtc";
import type { Call, INotification } from "@telnyx/webrtc";
import { buildCallHeaders, type CallAttribution } from "./attribution";

export type { Call, INotification };
export { buildCallHeaders, type CallAttribution };

export interface TelnyxClientConfig {
  /** SIP username — env-provided (web) or backend-minted credential (extension). */
  login: string;
  /** SIP password. */
  password: string;
  /** Local ringback audio played while the far end rings. */
  ringbackFile?: string;
  /** Local ringtone for inbound calls (web app only today). */
  ringtoneFile?: string;
  debug?: boolean;
}

/**
 * Construct (but do not connect) a Telnyx client.
 *
 * `keepConnectionAliveOnSocketClose` is always on so an in-progress call
 * survives transient socket drops (network change, sleep/wake, brief packet
 * loss) instead of being purged mid-call.
 */
export function createTelnyxClient(config: TelnyxClientConfig): TelnyxRTC {
  return new TelnyxRTC({
    login: config.login,
    password: config.password,
    ringbackFile: config.ringbackFile,
    ringtoneFile: config.ringtoneFile,
    debug: config.debug ?? false,
    keepConnectionAliveOnSocketClose: true,
  });
}

export interface PlaceCallOptions extends CallAttribution {
  client: TelnyxRTC;
  /** E.164 destination. */
  destination: string;
  /** Extra custom SIP headers to append (e.g. campaign / session ids). */
  extraHeaders?: { name: string; value: string }[];
  debug?: boolean;
}

/** Comfortable ringback level for headset users before the far end answers. */
export const OUTBOUND_RINGBACK_VOLUME = 0.25;

/**
 * Telnyx creates one internal looping <audio id="_ringback"> element when a
 * call is placed. Keep that local ringback quiet without lowering the remote
 * person's audio after the call connects.
 */
export function setOutboundRingbackVolume(
  volume = OUTBOUND_RINGBACK_VOLUME,
): void {
  if (typeof document === "undefined") return;
  const ringback = document.getElementById("_ringback");
  if (ringback instanceof HTMLAudioElement) {
    ringback.volume = Math.min(1, Math.max(0, volume));
  }
}

/** Place an outbound call. Returns the Telnyx `Call` handle. */
export function placeCall(opts: PlaceCallOptions): Call {
  const { client, destination, callerId, userId, organizationId } = opts;
  const call = client.newCall({
    callerNumber: callerId,
    destinationNumber: destination,
    audio: true,
    customHeaders: [
      ...buildCallHeaders({ callerId, userId, organizationId }),
      ...(opts.extraHeaders ?? []),
    ],
    keepConnectionAliveOnSocketClose: true,
    debug: opts.debug ?? false,
    debugOutput: "socket",
  });
  setOutboundRingbackVolume();
  return call;
}

// ── Per-call controls ─────────────────────────────────────────────────────────
// Each guards against a missing/half-initialized Call so callers don't have to.

export async function muteCall(
  call: Call | null,
  mute: boolean,
): Promise<void> {
  if (!call) return;
  if (mute) {
    if (typeof call.muteAudio === "function") await call.muteAudio();
  } else if (typeof call.unmuteAudio === "function") {
    await call.unmuteAudio();
  }
}

export async function holdCall(
  call: Call | null,
  hold: boolean,
): Promise<void> {
  if (!call) return;
  if (hold) {
    if (typeof call.hold === "function") await call.hold();
  } else if (typeof call.unhold === "function") {
    await call.unhold();
  }
}

export async function hangupCall(call: Call | null): Promise<void> {
  if (!call) return;
  if (typeof call.hangup === "function") await call.hangup();
}

export function sendDtmf(call: Call | null, digit: string): void {
  if (!call) return;
  if (call.state !== "active") return;
  call.dtmf?.(digit);
}

/** Telnyx event names, centralized so handlers can't drift between hosts. */
export const TELNYX_EVENTS = {
  ready: "telnyx.ready",
  error: "telnyx.error",
  socketOpen: "telnyx.socket.open",
  socketClose: "telnyx.socket.close",
  socketError: "telnyx.socket.error",
  socketMessage: "telnyx.socket.message",
  notification: "telnyx.notification",
} as const;

/**
 * Subscribe to call-update notifications, returning an unsubscribe fn. The
 * offscreen engine uses this to forward state to the side panel.
 */
export function onCallUpdate(
  client: TelnyxRTC,
  handler: (call: Call) => void,
): () => void {
  const listener = (n: INotification) => {
    if (n.type !== "callUpdate" || !n.call) return;
    handler(n.call as Call);
  };
  client.on(TELNYX_EVENTS.notification, listener);
  return () => client.off(TELNYX_EVENTS.notification, listener);
}
