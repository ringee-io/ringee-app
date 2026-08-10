/**
 * Wire contract for the per-user realtime channel.
 *
 * ZERO IMPORTS on purpose: this file is the single source of truth for the
 * WebSocket protocol shared by the API gateway, the publishers, and the browser
 * clients. The browser copy lives in
 * `packages/frontend-shared/src/realtime/contracts.ts` and must be kept in
 * sync — nothing here may depend on Node, Nest or Prisma so the two stay
 * mechanically comparable.
 */

/**
 * Path the browser connects to. It is attached to the API's HTTP server via the
 * `upgrade` event, so it deliberately sits OUTSIDE the `/api` global prefix
 * (same approach as the Telnyx media stream at `/media-stream`).
 */
export const USER_EVENTS_WS_PATH = "/ws/user-events";

/** Redis pub/sub channel that fans events out to every API instance. */
export const USER_EVENTS_CHANNEL = "ringee:realtime:user-events:v1";

/** Redis hash (one per user) holding the currently connected devices. */
export const USER_PRESENCE_KEY_PREFIX = "ringee:realtime:presence:v1";

/** How often the server pings a socket; a client that misses two is dropped. */
export const HEARTBEAT_INTERVAL_MS = 25_000;

/** A socket that never authenticates is closed after this window. */
export const AUTH_TIMEOUT_MS = 10_000;

/** Presence entries older than this are treated as dead when listing devices. */
export const PRESENCE_TTL_MS = 90_000;

/** Where a connection comes from. Free-form on the wire, normalized on read. */
export type RealtimeClientKind =
  | "web"
  | "extension"
  | "mobile"
  | "sdk"
  | "unknown";

export const REALTIME_CLIENT_KINDS: readonly RealtimeClientKind[] = [
  "web",
  "extension",
  "mobile",
  "sdk",
  "unknown",
];

/**
 * Application-level close codes (4000-4999 is the private range).
 * `ACCOUNT_BLOCKED` is terminal: clients must NOT reconnect after receiving it.
 */
export const RealtimeCloseCode = {
  UNAUTHORIZED: 4401,
  ACCOUNT_BLOCKED: 4403,
  AUTH_TIMEOUT: 4408,
  PROTOCOL_ERROR: 4400,
  SERVER_SHUTDOWN: 4503,
} as const;

export type RealtimeCloseCode =
  (typeof RealtimeCloseCode)[keyof typeof RealtimeCloseCode];

/** Close codes after which a client must stay down instead of reconnecting. */
export const TERMINAL_CLOSE_CODES: readonly number[] = [
  RealtimeCloseCode.ACCOUNT_BLOCKED,
];

// ── Client → server ─────────────────────────────────────────────────────────

/**
 * First frame every client must send. The token is a Clerk session JWT, sent in
 * the payload rather than the URL so it never lands in access logs, proxy
 * traces or browser history.
 */
export interface RealtimeAuthMessage {
  type: "auth";
  token: string;
  /** Stable per-install id so the backoffice can tell devices apart. */
  deviceId?: string;
  /** Human-readable device label, e.g. "Chrome · macOS". */
  deviceLabel?: string;
  client?: RealtimeClientKind;
}

/** Keepalive from clients that cannot observe protocol-level pongs. */
export interface RealtimePingMessage {
  type: "ping";
}

export type RealtimeClientMessage = RealtimeAuthMessage | RealtimePingMessage;

// ── Server → client ─────────────────────────────────────────────────────────

/** Sent once the auth frame is accepted. */
export interface RealtimeReadyEvent {
  type: "ready";
  connectionId: string;
  userId: string;
  /** Number of devices this user currently has online, including this one. */
  devices: number;
  at: string;
}

/**
 * The account was banned/blocked. Every device must hang up immediately, drop
 * local state and sign out. Calls are ALSO killed server-side — this event is
 * for instant UX, never the only line of defense.
 */
export interface RealtimeAccountBlockedEvent {
  type: "account.blocked";
  reason: string;
  /** Copy safe to show the end user. */
  message: string;
  blockedAt: string;
  /** Ringee call ids the server terminated as part of the same action. */
  terminatedCallIds: string[];
}

/** A super admin dropped the user's live calls without banning the account. */
export interface RealtimeCallsTerminatedEvent {
  type: "calls.terminated";
  reason: string;
  message: string;
  terminatedCallIds: string[];
  at: string;
}

/** The block was lifted; clients may resume (usually after a reload). */
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

/** Events that are broadcast to a user (i.e. everything except handshake noise). */
export type RealtimeBroadcastEvent =
  | RealtimeAccountBlockedEvent
  | RealtimeCallsTerminatedEvent
  | RealtimeAccountRestoredEvent;

/** Envelope carried over Redis so any API instance can deliver the event. */
export interface RealtimeUserEnvelope {
  userId: string;
  event: RealtimeBroadcastEvent;
  /** Instance that published it — useful when debugging fan-out. */
  origin?: string;
  publishedAt: string;
}

/** A device currently holding an authenticated socket. */
export interface RealtimeDevice {
  connectionId: string;
  deviceId: string | null;
  deviceLabel: string | null;
  client: RealtimeClientKind;
  ip: string | null;
  connectedAt: string;
  lastSeenAt: string;
}

export function presenceKey(userId: string): string {
  return `${USER_PRESENCE_KEY_PREFIX}:${userId}`;
}
