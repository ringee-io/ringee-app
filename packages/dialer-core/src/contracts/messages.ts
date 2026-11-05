/**
 * The single source of truth for every message that crosses a context boundary
 * inside the browser extension.
 *
 * There are four runtime contexts and they never talk directly — everything
 * funnels through the background service worker, the only context that holds
 * auth, can open the side panel, and owns the offscreen document lifecycle:
 *
 *   content   ──DIAL_REQUEST──▶  background  ──START_CALL──▶  offscreen (WebRTC)
 *   sidepanel ◀──CALL_SNAPSHOT── background  ◀──CALL_EVENT──  offscreen
 *   sidepanel ──CALL_COMMAND───▶ background  ──CALL_COMMAND─▶ offscreen
 *                                background  ◀─CALL_QUALITY─  offscreen
 *   sidepanel ──REQUEST_AUTH_TOKEN──▶ background (answers with a token)
 *
 * These types live in `@ringee/dialer-core` (not the extension) so the offscreen
 * engine, the side panel, and any test can import the identical contract.
 */
import type {
  CallQualitySummary,
  CallState,
  ContactRef,
  DialTarget,
  PageOrigin,
} from "./call";

export const MESSAGE_PREFIX = "RINGEE_" as const;

export const MessageType = {
  DialRequest: "RINGEE_DIAL_REQUEST",
  StartCall: "RINGEE_START_CALL",
  CallCommand: "RINGEE_CALL_COMMAND",
  CallEvent: "RINGEE_CALL_EVENT",
  CallSnapshot: "RINGEE_CALL_SNAPSHOT",
  RequestSnapshot: "RINGEE_REQUEST_SNAPSHOT",
  EndCall: "RINGEE_END_CALL",
  CallQuality: "RINGEE_CALL_QUALITY",
  RequestAuthToken: "RINGEE_REQUEST_AUTH_TOKEN",
} as const;

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];

/** content / context-menu / side panel → background : user asked to dial. */
export interface DialRequestMsg {
  type: typeof MessageType.DialRequest;
  target: DialTarget;
}

/**
 * background → the sender of a DIAL_REQUEST : whether the leg was placed — the
 * backend authorized it (credit, DNC, caller ID, one call at a time) and the
 * offscreen engine reported it live. A dial refused, or hung up before its leg
 * existed, was not. The side panel's queue completes a callback only once it
 * has actually been called.
 */
export interface DialResult {
  placed: boolean;
}

/**
 * background → offscreen : place the WebRTC call.
 *
 * The caller ID and SIP credentials are resolved by the backend and passed
 * through here — they are NEVER hardcoded in the extension.
 */
export interface StartCallMsg {
  type: typeof MessageType.StartCall;
  sip: { username: string; password: string };
  callerId: string;
  destination: string;
  userId: string;
  organizationId?: string;
  /** Backend-created call id, when prepare-call returned one. */
  callId?: string;
  /** The signed dial authorization prepare-call issued for this leg. */
  dialToken?: string;
}

/** side panel → background → offscreen : in-call controls. */
export interface CallCommandMsg {
  type: typeof MessageType.CallCommand;
  /**
   * One per press. A runtime message reaches every extension page, so the
   * offscreen engine hears a command from the side panel and again forwarded
   * by the worker; the id is how it acts on it once.
   */
  id?: string;
  command:
    | { action: "hangup" }
    | { action: "mute"; value: boolean }
    | { action: "hold"; value: boolean }
    | { action: "dtmf"; digit: string };
}

/** offscreen → background → side panel : a WebRTC lifecycle event. */
export interface CallEventMsg {
  type: typeof MessageType.CallEvent;
  state: CallState;
  detail?: {
    telnyxSessionId?: string;
    error?: string;
    /**
     * Telnyx hangup diagnostics (cause / sipReason / sipCode collapsed into one
     * human string) so an unexpected auto-hangup is debuggable instead of a
     * silent "Call ended". Surfaced on `ended`/`failed`.
     */
    cause?: string;
  };
}

/**
 * background → side panel : a full snapshot so the panel can rehydrate when it
 * (re)opens. The side panel is just a remote control — this is what it renders.
 */
export interface CallSnapshotMsg {
  type: typeof MessageType.CallSnapshot;
  state: CallState;
  destination?: string;
  contact?: ContactRef;
  origin?: PageOrigin;
  callId?: string;
  telnyxSessionId?: string;
  dncBlocked?: boolean;
  /**
   * The dial was refused because the user is already on a call on another
   * device. Surfaces the "one call at a time / add a seat" notice instead of a
   * plain error line.
   */
  concurrentCall?: boolean;
  startedAt?: number;
  /**
   * When the call ended or failed (epoch ms). The snapshot outlives the call,
   * so a wrap-up opened later counts the call up to here, not up to now.
   */
  endedAt?: number;
  /**
   * The Clerk user whose dial this is. The snapshot outlives the worker, and a
   * finished call's wrap-up goes only to that user — never to whoever signs in
   * to the same browser after them.
   */
  userId?: string;
  muted?: boolean;
  onHold?: boolean;
  error?: string;
}

/** side panel → background : "send me the current snapshot". */
export interface RequestSnapshotMsg {
  type: typeof MessageType.RequestSnapshot;
}

/** side panel → background → offscreen : tear everything down. */
export interface EndCallMsg {
  type: typeof MessageType.EndCall;
}

/**
 * offscreen → background : how an answered call's outgoing audio flowed. Sent
 * before the call's `ended` event, on which the worker closes the offscreen
 * document that measured it.
 */
export interface CallQualityMsg {
  type: typeof MessageType.CallQuality;
  summary: CallQualitySummary;
}

/**
 * side panel → background : "a session token for the API". The panel's own
 * Clerk copy fails to renew its ~60 s token while the panel stays open, so once
 * that token has lapsed the panel asks the worker, which loads a fresh Clerk
 * client for each request and so always has a current token. The worker answers
 * extension pages only: a content script runs inside a web page and must never
 * receive a token.
 */
export interface RequestAuthTokenMsg {
  type: typeof MessageType.RequestAuthToken;
}

/**
 * background → the sender of a REQUEST_AUTH_TOKEN : a token minted for the
 * request, or null, and whose session it belongs to. The worker's session is
 * the browser's current one, which can be another user or workspace than the
 * panel loaded with, so the panel uses the token only when they match.
 */
export interface AuthTokenResult {
  token: string | null;
  userId?: string | null;
  orgId?: string | null;
}

export type RingeeMessage =
  | DialRequestMsg
  | StartCallMsg
  | CallCommandMsg
  | CallEventMsg
  | CallSnapshotMsg
  | RequestSnapshotMsg
  | EndCallMsg
  | CallQualityMsg
  | RequestAuthTokenMsg;

// ── Runtime guards ────────────────────────────────────────────────────────────
// Messages arrive from other extension contexts and must be validated before
// use; never trust the shape blindly.

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

export function isRingeeMessage(m: unknown): m is RingeeMessage {
  return (
    isObject(m) &&
    typeof m.type === "string" &&
    m.type.startsWith(MESSAGE_PREFIX)
  );
}

export function isDialRequest(m: unknown): m is DialRequestMsg {
  return (
    isObject(m) &&
    m.type === MessageType.DialRequest &&
    isObject(m.target) &&
    typeof m.target.destination === "string" &&
    m.target.destination.length > 0
  );
}

export function isDialResult(m: unknown): m is DialResult {
  return isObject(m) && typeof m.placed === "boolean";
}

export function isStartCall(m: unknown): m is StartCallMsg {
  return (
    isObject(m) &&
    m.type === MessageType.StartCall &&
    isObject(m.sip) &&
    typeof m.sip.username === "string" &&
    typeof m.sip.password === "string" &&
    typeof m.callerId === "string" &&
    typeof m.destination === "string" &&
    typeof m.userId === "string"
  );
}

const COMMAND_ACTIONS = new Set(["hangup", "mute", "hold", "dtmf"]);

export function isCallCommand(m: unknown): m is CallCommandMsg {
  if (!isObject(m) || m.type !== MessageType.CallCommand) return false;
  if (m.id !== undefined && typeof m.id !== "string") return false;
  const cmd = m.command;
  if (!isObject(cmd) || typeof cmd.action !== "string") return false;
  if (!COMMAND_ACTIONS.has(cmd.action)) return false;
  if (cmd.action === "mute" || cmd.action === "hold") {
    return typeof cmd.value === "boolean";
  }
  if (cmd.action === "dtmf") {
    return (
      typeof cmd.digit === "string" && /^[0-9A-D*#]$/.test(cmd.digit as string)
    );
  }
  return true;
}

export function isCallEvent(m: unknown): m is CallEventMsg {
  return (
    isObject(m) &&
    m.type === MessageType.CallEvent &&
    typeof m.state === "string"
  );
}

export function isCallSnapshot(m: unknown): m is CallSnapshotMsg {
  return (
    isObject(m) &&
    m.type === MessageType.CallSnapshot &&
    typeof m.state === "string"
  );
}

export function isRequestSnapshot(m: unknown): m is RequestSnapshotMsg {
  return isObject(m) && m.type === MessageType.RequestSnapshot;
}

export function isEndCall(m: unknown): m is EndCallMsg {
  return isObject(m) && m.type === MessageType.EndCall;
}

export function isRequestAuthToken(m: unknown): m is RequestAuthTokenMsg {
  return isObject(m) && m.type === MessageType.RequestAuthToken;
}

const isOptionalId = (v: unknown) =>
  v === undefined || v === null || typeof v === "string";

/** A worker's answer; a closed channel's `undefined` is not one. */
export function isAuthTokenResult(m: unknown): m is AuthTokenResult {
  return (
    isObject(m) &&
    (m.token === null || (typeof m.token === "string" && m.token.length > 0)) &&
    isOptionalId(m.userId) &&
    isOptionalId(m.orgId)
  );
}

/** The counts every `CallQualitySummary` carries. */
const QUALITY_COUNTS = [
  "measuredSec",
  "capturedSec",
  "captureGaps",
  "packetsSent",
  "sentPerSec",
  "sendGaps",
  "packetsReceived",
  "packetsLost",
] as const satisfies readonly (keyof CallQualitySummary)[];

export function isCallQuality(m: unknown): m is CallQualityMsg {
  if (!isObject(m) || m.type !== MessageType.CallQuality) return false;
  const summary = m.summary;
  return (
    isObject(summary) &&
    QUALITY_COUNTS.every((key) => typeof summary[key] === "number") &&
    isObject(summary.warnings)
  );
}
