import { randomUUID } from "crypto";
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { IncomingMessage, Server } from "http";
import type { Duplex } from "stream";
import { RawData, WebSocket, WebSocketServer } from "ws";
import { verifyToken } from "@clerk/backend";
import { apiConfiguration } from "@ringee/configuration";
import {
  AUTH_TIMEOUT_MS,
  HEARTBEAT_INTERVAL_MS,
  REALTIME_CLIENT_KINDS,
  RealtimeAccountBlockedEvent,
  RealtimeBusService,
  RealtimeClientKind,
  RealtimeCloseCode,
  RealtimeDevice,
  RealtimePresenceService,
  RealtimeServerEvent,
  RealtimeUserEnvelope,
  USER_EVENTS_CHANNEL,
  USER_EVENTS_WS_PATH,
} from "@ringee/platform";
import { UserService } from "@ringee/services";
import { isAllowedRealtimeOrigin } from "./realtime-origins";

/** Reject a socket that has not authenticated after this many auth frames. */
const MAX_AUTH_ATTEMPTS = 3;

/**
 * Re-check the account's block state every N heartbeats (~100s). The ban path
 * closes sockets explicitly; this is the backstop for a dropped Redis message.
 */
const REVALIDATE_EVERY_N_HEARTBEATS = 4;

interface Connection {
  id: string;
  socket: WebSocket;
  userId: string;
  clerkUserId: string;
  device: RealtimeDevice;
  isAlive: boolean;
}

/**
 * Per-user WebSocket fan-out: one socket per signed-in device (browser tab,
 * extension, mobile), addressed by Ringee user id.
 *
 * Design notes
 * - It piggybacks on the API's HTTP server via the `upgrade` event at
 *   {@link USER_EVENTS_WS_PATH}, exactly like the Telnyx media stream, so no
 *   extra port or ingress rule is needed.
 * - Authentication happens in an `auth` FRAME, not the URL: query-string tokens
 *   end up in access logs, proxies and browser history.
 * - The socket carries no data and accepts no commands. It only pushes
 *   enforcement events, so a compromised client can gain nothing from it.
 * - The registry is per-process. Cross-instance delivery goes through Redis
 *   pub/sub ({@link USER_EVENTS_CHANNEL}), so a ban issued on any API instance
 *   reaches every device on every instance.
 */
@Injectable()
export class UserEventsGateway
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(UserEventsGateway.name);
  private readonly wss = new WebSocketServer({
    noServer: true,
    // The only frames we accept are tiny JSON control messages.
    maxPayload: 16 * 1024,
  });

  /** userId → connectionId → connection. */
  private readonly connectionsByUser = new Map<
    string,
    Map<string, Connection>
  >();
  /** Sockets that have not sent a valid auth frame yet. */
  private readonly pending = new Map<WebSocket, NodeJS.Timeout>();

  private heartbeat: NodeJS.Timeout | null = null;
  private heartbeatTicks = 0;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly bus: RealtimeBusService,
    private readonly presence: RealtimePresenceService,
    private readonly userService: UserService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.wss.on("error", (error) =>
      this.logger.error(`User events server error: ${error.message}`),
    );

    this.unsubscribe = await this.bus
      .subscribe(USER_EVENTS_CHANNEL, (payload) => this.deliverFromBus(payload))
      .catch((error) => {
        // Without Redis the gateway still serves sockets opened on THIS
        // instance; it just cannot receive events published elsewhere.
        this.logger.error(
          `Could not subscribe to ${USER_EVENTS_CHANNEL}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return null;
      });

    this.heartbeat = setInterval(
      () => this.sweep(),
      HEARTBEAT_INTERVAL_MS,
    ).unref();
  }

  onApplicationBootstrap(): void {
    const server: Server | undefined =
      this.httpAdapterHost?.httpAdapter?.getHttpServer();
    if (!server) {
      this.logger.error(
        "Could not resolve HTTP server — user events gateway not attached",
      );
      return;
    }
    server.on("upgrade", (req, socket, head) =>
      this.handleUpgrade(req, socket, head),
    );
    this.logger.log(
      `🔌 User events gateway attached on the API server at ${USER_EVENTS_WS_PATH}`,
    );
  }

  onModuleDestroy(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.unsubscribe?.();
    for (const timeout of this.pending.values()) clearTimeout(timeout);
    this.pending.clear();
    for (const connections of this.connectionsByUser.values()) {
      for (const connection of connections.values()) {
        connection.socket.close(
          RealtimeCloseCode.SERVER_SHUTDOWN,
          "server_shutdown",
        );
      }
    }
    this.connectionsByUser.clear();
    this.wss.close();
  }

  // ── Upgrade & handshake ───────────────────────────────────────────────────

  private handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): void {
    let pathname = "/";
    try {
      pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    } catch {
      /* keep default */
    }
    // Only claim our path; every other upgrade belongs to another handler
    // (e.g. the Telnyx media stream).
    if (pathname !== USER_EVENTS_WS_PATH) return;

    if (!isAllowedRealtimeOrigin(req.headers.origin)) {
      this.logger.warn(
        `Rejected realtime upgrade from disallowed origin ${req.headers.origin}`,
      );
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    this.wss.handleUpgrade(req, socket, head, (ws) =>
      this.handleConnection(ws, req),
    );
  }

  private handleConnection(socket: WebSocket, req: IncomingMessage): void {
    let attempts = 0;

    const timeout = setTimeout(() => {
      this.pending.delete(socket);
      this.close(socket, RealtimeCloseCode.AUTH_TIMEOUT, "auth_timeout");
    }, AUTH_TIMEOUT_MS);
    this.pending.set(socket, timeout);

    socket.on("message", (data: RawData) => {
      const message = this.parse(data);
      if (!message) return;

      if (message.type === "ping") {
        this.send(socket, { type: "pong", at: new Date().toISOString() });
        return;
      }

      if (message.type !== "auth") return;

      // Already authenticated: ignore repeat auth frames instead of creating a
      // second registry entry for the same socket.
      if (!this.pending.has(socket)) return;

      attempts += 1;
      if (attempts > MAX_AUTH_ATTEMPTS) {
        this.close(socket, RealtimeCloseCode.UNAUTHORIZED, "too_many_attempts");
        return;
      }

      void this.authenticate(socket, req, message);
    });

    socket.on("error", (error) =>
      this.logger.debug(`Realtime socket error: ${error.message}`),
    );
    socket.on("close", () => this.forget(socket));
  }

  private async authenticate(
    socket: WebSocket,
    req: IncomingMessage,
    message: { token?: unknown } & Record<string, unknown>,
  ): Promise<void> {
    const token = typeof message.token === "string" ? message.token : "";
    if (!token) {
      this.close(socket, RealtimeCloseCode.UNAUTHORIZED, "missing_token");
      return;
    }

    let clerkUserId: string;
    try {
      const payload = await verifyToken(token, {
        secretKey: apiConfiguration.CLERK_SECRET_KEY,
      });
      clerkUserId = payload.sub;
    } catch {
      this.send(socket, {
        type: "error",
        code: RealtimeCloseCode.UNAUTHORIZED,
        message: "Invalid or expired token",
      });
      this.close(socket, RealtimeCloseCode.UNAUTHORIZED, "invalid_token");
      return;
    }

    const user = await this.userService
      .getCachedByClerkId(clerkUserId)
      .catch(() => null);
    if (!user) {
      this.close(socket, RealtimeCloseCode.UNAUTHORIZED, "unknown_user");
      return;
    }

    // A device that reconnects while the account is blocked is told why and
    // dropped — it must never sit in the registry believing it is healthy.
    if (user.blockedAt) {
      this.send(socket, this.blockedEvent(user));
      this.close(socket, RealtimeCloseCode.ACCOUNT_BLOCKED, "account_blocked");
      return;
    }

    const timeout = this.pending.get(socket);
    if (timeout) clearTimeout(timeout);
    this.pending.delete(socket);

    const now = new Date().toISOString();
    const connection: Connection = {
      id: randomUUID(),
      socket,
      userId: user.id,
      clerkUserId,
      isAlive: true,
      device: {
        connectionId: "",
        deviceId: this.readString(message.deviceId, 128),
        deviceLabel:
          this.readString(message.deviceLabel, 128) ??
          this.readString(req.headers["user-agent"], 128),
        client: this.readClientKind(message.client),
        ip: this.readIp(req),
        connectedAt: now,
        lastSeenAt: now,
      },
    };
    connection.device.connectionId = connection.id;

    const connections =
      this.connectionsByUser.get(user.id) ?? new Map<string, Connection>();
    connections.set(connection.id, connection);
    this.connectionsByUser.set(user.id, connections);

    socket.on("pong", () => {
      connection.isAlive = true;
    });

    await this.presence.register(user.id, connection.device);

    this.send(socket, {
      type: "ready",
      connectionId: connection.id,
      userId: user.id,
      devices: connections.size,
      at: now,
    });

    this.logger.log(
      `Realtime device connected for user ${user.id} (${connection.device.client}, ${connections.size} on this instance)`,
    );
  }

  // ── Delivery ──────────────────────────────────────────────────────────────

  private deliverFromBus(payload: unknown): void {
    const envelope = payload as RealtimeUserEnvelope | null;
    if (!envelope?.userId || !envelope.event?.type) return;

    const connections = this.connectionsByUser.get(envelope.userId);
    if (!connections?.size) return;

    const terminal = envelope.event.type === "account.blocked";
    for (const connection of connections.values()) {
      this.send(connection.socket, envelope.event);
      if (terminal) {
        // Give the frame a moment to flush, then drop the socket so a client
        // that ignores the event still loses its channel.
        this.close(
          connection.socket,
          RealtimeCloseCode.ACCOUNT_BLOCKED,
          "account_blocked",
        );
      }
    }

    this.logger.log(
      `Delivered ${envelope.event.type} to ${connections.size} device(s) of user ${envelope.userId}`,
    );
  }

  // ── Liveness ──────────────────────────────────────────────────────────────

  private sweep(): void {
    this.heartbeatTicks += 1;
    const revalidate =
      this.heartbeatTicks % REVALIDATE_EVERY_N_HEARTBEATS === 0;

    for (const [userId, connections] of this.connectionsByUser) {
      for (const connection of connections.values()) {
        if (!connection.isAlive) {
          // Missed the previous ping: the peer is gone (laptop asleep, network
          // dropped). `terminate` skips the close handshake.
          connection.socket.terminate();
          continue;
        }
        connection.isAlive = false;
        try {
          connection.socket.ping();
        } catch {
          connection.socket.terminate();
          continue;
        }
        void this.presence.touch(userId, connection.device);
      }

      if (revalidate && connections.size > 0) {
        void this.revalidate(userId);
      }
    }
  }

  /**
   * Backstop for a lost broadcast: if the account is blocked but sockets are
   * still open, close them. One lookup per connected user, not per socket.
   */
  private async revalidate(userId: string): Promise<void> {
    const user = await this.userService
      .getCachedUserById(userId)
      .catch(() => null);
    if (!user?.blockedAt) return;

    const connections = this.connectionsByUser.get(userId);
    if (!connections?.size) return;

    this.logger.warn(
      `Closing ${connections.size} stale socket(s) for blocked user ${userId}`,
    );
    const event = this.blockedEvent(user);
    for (const connection of connections.values()) {
      this.send(connection.socket, event);
      this.close(
        connection.socket,
        RealtimeCloseCode.ACCOUNT_BLOCKED,
        "account_blocked",
      );
    }
  }

  /**
   * `blockedAt` arrives as a `Date` from Prisma but as an ISO string when the
   * user came back from the Redis cache (JSON has no date type), so it is
   * normalized instead of calling `toISOString()` on whatever we were handed.
   */
  private blockedEvent(user: {
    blockedAt: Date | string | null;
    blockedReason: string | null;
  }): RealtimeAccountBlockedEvent {
    const blockedAt =
      user.blockedAt instanceof Date
        ? user.blockedAt.toISOString()
        : (user.blockedAt ?? new Date().toISOString());

    return {
      type: "account.blocked",
      reason: user.blockedReason ?? "account_blocked",
      message: "This account has been disabled.",
      blockedAt,
      terminatedCallIds: [],
    };
  }

  private forget(socket: WebSocket): void {
    const timeout = this.pending.get(socket);
    if (timeout) clearTimeout(timeout);
    this.pending.delete(socket);

    for (const [userId, connections] of this.connectionsByUser) {
      for (const [connectionId, connection] of connections) {
        if (connection.socket !== socket) continue;
        connections.delete(connectionId);
        if (connections.size === 0) this.connectionsByUser.delete(userId);
        void this.presence.unregister(userId, connectionId);
        return;
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private send(socket: WebSocket, event: RealtimeServerEvent): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(JSON.stringify(event));
    } catch (error) {
      this.logger.warn(
        `Could not send ${event.type}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private close(socket: WebSocket, code: number, reason: string): void {
    try {
      socket.close(code, reason);
    } catch {
      socket.terminate();
      return;
    }
    // A peer that never answers the closing handshake would otherwise keep the
    // socket half-open forever.
    setTimeout(() => {
      if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
    }, 2_000).unref();
  }

  private parse(
    data: RawData,
  ): ({ type: string } & Record<string, unknown>) | null {
    try {
      const parsed = JSON.parse(data.toString("utf-8"));
      if (!parsed || typeof parsed !== "object") return null;
      if (typeof parsed.type !== "string") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private readString(value: unknown, maxLength: number): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, maxLength) : null;
  }

  private readClientKind(value: unknown): RealtimeClientKind {
    return REALTIME_CLIENT_KINDS.includes(value as RealtimeClientKind)
      ? (value as RealtimeClientKind)
      : "unknown";
  }

  /**
   * Only trust `x-forwarded-for` when the deployment has declared how many
   * proxies sit in front of the API — the same rule Express uses for `req.ip`.
   */
  private readIp(req: IncomingMessage): string | null {
    if (apiConfiguration.TRUST_PROXY_HOPS > 0) {
      const forwarded = req.headers["x-forwarded-for"];
      const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      const first = raw?.split(",")[0]?.trim();
      if (first) return first;
    }
    return req.socket.remoteAddress ?? null;
  }
}
