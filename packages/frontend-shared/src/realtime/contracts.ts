/**
 * Browser-side copy of the realtime wire contract.
 *
 * The server source of truth is
 * `packages/platform/src/realtime/realtime.contracts.ts`. It cannot be imported
 * here — `@ringee/platform` is a Nest/Node package and must never reach a
 * browser bundle — so the shapes are mirrored. Change one, change the other.
 */

export const USER_EVENTS_WS_PATH = "/ws/user-events";

export type RealtimeClientKind =
  | "web"
  | "extension"
  | "mobile"
  | "sdk"
  | "unknown";

export const RealtimeCloseCode = {
  UNAUTHORIZED: 4401,
  ACCOUNT_BLOCKED: 4403,
  AUTH_TIMEOUT: 4408,
  PROTOCOL_ERROR: 4400,
  SERVER_SHUTDOWN: 4503,
} as const;

/** Close codes after which the client must stay down instead of reconnecting. */
export const TERMINAL_CLOSE_CODES: readonly number[] = [
  RealtimeCloseCode.ACCOUNT_BLOCKED,
];

export interface RealtimeReadyEvent {
  type: "ready";
  connectionId: string;
  userId: string;
  devices: number;
  at: string;
}

export interface RealtimeAccountBlockedEvent {
  type: "account.blocked";
  reason: string;
  message: string;
  blockedAt: string;
  terminatedCallIds: string[];
}

export interface RealtimeCallsTerminatedEvent {
  type: "calls.terminated";
  reason: string;
  message: string;
  terminatedCallIds: string[];
  at: string;
}

export interface RealtimeAccountRestoredEvent {
  type: "account.restored";
  at: string;
}

export interface RealtimePongEvent {
  type: "pong";
  at: string;
}

export interface RealtimeErrorEvent {
  type: "error";
  code: number;
  message: string;
}

export type RealtimeServerEvent =
  | RealtimeReadyEvent
  | RealtimeAccountBlockedEvent
  | RealtimeCallsTerminatedEvent
  | RealtimeAccountRestoredEvent
  | RealtimePongEvent
  | RealtimeErrorEvent;

/** A device currently holding an authenticated socket (backoffice view). */
export interface RealtimeDevice {
  connectionId: string;
  deviceId: string | null;
  deviceLabel: string | null;
  client: RealtimeClientKind;
  ip: string | null;
  connectedAt: string;
  lastSeenAt: string;
}
