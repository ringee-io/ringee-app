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
 *
 * These types live in `@ringee/dialer-core` (not the extension) so the offscreen
 * engine, the side panel, and any test can import the identical contract.
 */
import type { CallState, ContactRef, DialTarget, PageOrigin } from "./call";

export const MESSAGE_PREFIX = "RINGEE_" as const;

export const MessageType = {
  DialRequest: "RINGEE_DIAL_REQUEST",
  StartCall: "RINGEE_START_CALL",
  CallCommand: "RINGEE_CALL_COMMAND",
  CallEvent: "RINGEE_CALL_EVENT",
  CallSnapshot: "RINGEE_CALL_SNAPSHOT",
  RequestSnapshot: "RINGEE_REQUEST_SNAPSHOT",
  EndCall: "RINGEE_END_CALL",
} as const;

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];

/** content / context-menu / side panel → background : user asked to dial. */
export interface DialRequestMsg {
  type: typeof MessageType.DialRequest;
  target: DialTarget;
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
}

/** side panel → background → offscreen : in-call controls. */
export interface CallCommandMsg {
  type: typeof MessageType.CallCommand;
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

export type RingeeMessage =
  | DialRequestMsg
  | StartCallMsg
  | CallCommandMsg
  | CallEventMsg
  | CallSnapshotMsg
  | RequestSnapshotMsg
  | EndCallMsg;

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
