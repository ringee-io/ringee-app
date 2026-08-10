import {
  RealtimeClientKind,
  RealtimeServerEvent,
  TERMINAL_CLOSE_CODES,
  USER_EVENTS_WS_PATH,
} from "./contracts";
import { describeRingeeDevice, getRingeeDeviceId } from "./device-id";

const BASE_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

export type RealtimeConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed";

export interface UserEventsClientOptions {
  /** Returns a fresh Clerk session token. Called on every (re)connect. */
  getToken: () => Promise<string | null>;
  /** API base URL, with or without the `/api` suffix. */
  apiUrl?: string;
  client?: RealtimeClientKind;
  deviceId?: string;
  deviceLabel?: string;
  onEvent?: (event: RealtimeServerEvent) => void;
  onStatusChange?: (status: RealtimeConnectionStatus) => void;
}

/**
 * Browser client for the per-user realtime channel.
 *
 * Contract with the server:
 * - The socket carries no data and accepts no commands; it only receives
 *   account-level events (block, restore, forced disconnect).
 * - The Clerk token travels in the first frame, never in the URL.
 * - `4403 account.blocked` is terminal: the client must not come back. Every
 *   other close is retried with exponential backoff and jitter.
 *
 * It is framework-agnostic on purpose — the Next.js app, the browser extension
 * and any future surface share one implementation.
 */
export class UserEventsClient {
  private socket: WebSocket | null = null;
  private status: RealtimeConnectionStatus = "idle";
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private readonly boundWake = () => this.onWake();

  constructor(private readonly options: UserEventsClientOptions) {}

  getStatus(): RealtimeConnectionStatus {
    return this.status;
  }

  connect(): void {
    if (typeof window === "undefined") return;
    this.stopped = false;
    if (this.socket || this.reconnectTimer) return;

    // A laptop coming out of sleep or a network switch drops the socket without
    // always firing `close` promptly — retry as soon as the tab is usable again.
    window.addEventListener("online", this.boundWake);
    document.addEventListener("visibilitychange", this.boundWake);

    this.open();
  }

  /** Close for good; safe to call more than once. */
  disconnect(): void {
    this.stopped = true;
    this.clearTimer();
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.boundWake);
      document.removeEventListener("visibilitychange", this.boundWake);
    }
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      socket.onopen = null;
      try {
        socket.close(1000, "client_disconnect");
      } catch {
        /* already gone */
      }
    }
    this.setStatus("closed");
  }

  private open(): void {
    this.clearTimer();
    if (this.stopped) return;

    let socket: WebSocket;
    try {
      socket = new WebSocket(buildSocketUrl(this.options.apiUrl));
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.socket = socket;
    this.setStatus(this.attempts === 0 ? "connecting" : "reconnecting");

    socket.onopen = () => {
      void this.authenticate(socket);
    };

    socket.onmessage = (message) => {
      const event = parseEvent(message.data);
      if (!event) return;
      if (event.type === "ready") {
        // Only a completed handshake counts as success, so a server that
        // accepts then rejects us cannot reset the backoff into a hot loop.
        this.attempts = 0;
        this.setStatus("connected");
      }
      this.options.onEvent?.(event);
    };

    socket.onerror = () => {
      // `close` always follows; reconnect logic lives there.
    };

    socket.onclose = (event) => {
      if (this.socket === socket) this.socket = null;
      if (this.stopped) return;

      if (TERMINAL_CLOSE_CODES.includes(event.code)) {
        // The account is blocked. Reconnecting would only be refused again.
        this.stopped = true;
        this.setStatus("closed");
        return;
      }
      this.scheduleReconnect();
    };
  }

  private async authenticate(socket: WebSocket): Promise<void> {
    let token: string | null = null;
    try {
      token = await this.options.getToken();
    } catch {
      token = null;
    }

    if (socket.readyState !== WebSocket.OPEN) return;
    if (!token) {
      // Signed out (or Clerk is briefly unavailable): drop and retry later
      // rather than sitting on a socket that will time out server-side.
      socket.close(1000, "no_token");
      return;
    }

    socket.send(
      JSON.stringify({
        type: "auth",
        token,
        deviceId: this.options.deviceId ?? getRingeeDeviceId(),
        deviceLabel: this.options.deviceLabel ?? describeRingeeDevice(),
        client: this.options.client ?? "web",
      }),
    );
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.setStatus("reconnecting");

    // Exponential backoff with full jitter, so a server restart does not bring
    // every tab back in the same millisecond.
    const ceiling = Math.min(
      MAX_RECONNECT_DELAY_MS,
      BASE_RECONNECT_DELAY_MS * 2 ** this.attempts,
    );
    this.attempts = Math.min(this.attempts + 1, 10);
    const delay = Math.round(ceiling * (0.5 + Math.random() * 0.5));

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private onWake(): void {
    if (this.stopped || this.socket) return;
    if (document.visibilityState === "hidden") return;
    this.attempts = 0;
    this.clearTimer();
    this.open();
  }

  private clearTimer(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private setStatus(status: RealtimeConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.options.onStatusChange?.(status);
  }
}

/**
 * The WebSocket lives on the API host but OUTSIDE the `/api` prefix, so the
 * suffix is stripped from the configured base URL before appending the path.
 */
export function buildSocketUrl(apiUrl?: string): string {
  const base =
    apiUrl ??
    (typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_API_URL
      : undefined) ??
    "http://localhost:3000/api";

  const url = new URL(base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.search = "";
  url.hash = "";
  url.pathname = `${url.pathname.replace(/\/api\/?$/, "").replace(/\/$/, "")}${USER_EVENTS_WS_PATH}`;
  return url.toString();
}

function parseEvent(data: unknown): RealtimeServerEvent | null {
  if (typeof data !== "string") return null;
  try {
    const parsed = JSON.parse(data);
    return parsed && typeof parsed.type === "string" ? parsed : null;
  } catch {
    return null;
  }
}
