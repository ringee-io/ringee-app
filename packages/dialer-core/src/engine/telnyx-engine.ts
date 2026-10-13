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
import {
  EXTERNAL_CARRIER_CALL_HEADER,
  type CarrierRoute,
} from "./carrier-route";

export type { Call, INotification };
export { buildCallHeaders, type CallAttribution };

const WEBRTC_REGIONS = [
  "eu",
  "us-central",
  "us-east",
  "us-west",
  "ca-central",
  "apac",
  "south-asia",
] as const;

/** Supported Telnyx signaling regions. Omission preserves automatic routing. */
export type WebRtcRegion = (typeof WEBRTC_REGIONS)[number];

export interface TelnyxClientConfig {
  /** SIP username — env-provided (web) or backend-minted credential (extension). */
  login: string;
  /** SIP password. */
  password: string;
  /** Local ringback audio played while the far end rings. */
  ringbackFile?: string;
  /** Local ringtone for inbound calls (web app only today). */
  ringtoneFile?: string;
  /** Override only for a measured regional requirement; auto is the default. */
  region?: WebRtcRegion;
  debug?: boolean;
}

/**
 * A Telnyx client that only ever logs in with its own session.
 *
 * Since 2.27.1 the SDK keeps the session id of the last login made anywhere in
 * the tab (sessionStorage, 90 s), and a client with no session of its own logs
 * in with it as a reconnection. The provider then moves that session to the
 * new socket and punts the client that held it, which does not come back. A
 * tab can run several clients — the dashboard's shared line beside the
 * per-user inbound endpoint and the AI agent test call — so whichever logged
 * in second knocked the other offline: the line stayed "connecting" for good.
 *
 * The SDK reads the stored token inside `login()`, on every attempt. A client
 * that has not logged in yet clears it first; one that has keeps reconnecting
 * with its own session, so an interrupted call can still be reattached.
 */
export class SessionScopedTelnyxRTC extends TelnyxRTC {
  override login(params?: Parameters<TelnyxRTC["login"]>[0]): Promise<void> {
    if (!this.sessionid) this.clearReconnectToken();
    return super.login(params);
  }
}

/**
 * Construct (but do not connect) a Telnyx client.
 *
 * `keepConnectionAliveOnSocketClose` is always on so an in-progress call
 * survives transient socket drops (network change, sleep/wake, brief packet
 * loss) instead of being purged mid-call.
 */
export function createTelnyxClient(config: TelnyxClientConfig): TelnyxRTC {
  return new SessionScopedTelnyxRTC({
    login: config.login,
    password: config.password,
    ringbackFile: config.ringbackFile,
    ringtoneFile: config.ringtoneFile,
    debug: config.debug ?? false,
    keepConnectionAliveOnSocketClose: true,
    enableCallReports: true,
    ...(config.region && WEBRTC_REGIONS.includes(config.region)
      ? { region: config.region }
      : {}),
  });
}

export interface PlaceCallOptions extends CallAttribution {
  client: TelnyxRTC;
  /** E.164 destination. */
  destination: string;
  /**
   * The leg's id, chosen by the caller so the leg can be tracked from its
   * first state — the SDK reports that before `newCall` returns.
   */
  id?: string;
  /**
   * Dial through the workspace's own carrier instead of Ringee's PSTN route.
   * The leg goes to the server-issued SIP destination and presents no caller
   * ID of its own: the carrier connection supplies the PBX identity.
   */
  carrierRoute?: CarrierRoute;
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
  const route = opts.carrierRoute;
  const call = client.newCall({
    ...(opts.id ? { id: opts.id } : {}),
    ...(route
      ? { userVariables: { ringeeDestination: destination } }
      : { callerNumber: callerId }),
    destinationNumber: route?.destinationUri ?? destination,
    audio: true,
    customHeaders: [
      // A carrier leg is attributed by its signed token alone; identity
      // headers would try to override the caller ID the PBX presents.
      ...(route
        ? [{ name: EXTERNAL_CARRIER_CALL_HEADER, value: route.callToken }]
        : buildCallHeaders({ callerId, userId, organizationId })),
      ...(opts.extraHeaders ?? []),
    ],
    keepConnectionAliveOnSocketClose: true,
    debug: opts.debug ?? false,
    debugOutput: "socket",
  });
  setOutboundRingbackVolume();
  return call;
}

/**
 * The number a call is with, for display and contact matching. A carrier leg
 * is addressed to a SIP destination, so the dialed number rides alongside it.
 */
export function getCallDestination(
  call: Call | null | undefined,
): string | undefined {
  return (
    call?.options?.userVariables?.ringeeDestination ??
    call?.options?.destinationNumber
  );
}

/** The pre-dial token of a leg placed through an external carrier, if any. */
export function getCarrierCallToken(
  call: Call | null | undefined,
): string | undefined {
  return call?.options?.customHeaders?.find(
    (header) => header.name === EXTERNAL_CARRIER_CALL_HEADER,
  )?.value;
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
