import { Injectable, Logger, NotFoundException } from "@nestjs/common";
// @ts-ignore
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
// @ts-ignore
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
// @ts-ignore
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { OwnershipContext } from "@ringee/platform";
import {
  McpClientInfo,
  McpConnectionMeta,
  McpUsageService,
  PersonalApiKeyService,
  ResolvedPersonalApiKey,
} from "@ringee/services";
import { McpFunc } from "./mcp.func";
import { McpSettings } from "./mcp.settings";
import { McpToolsRepository } from "./mcp.tools.repository";

interface Session {
  transport: SSEServerTransport;
  server: McpServer;
  ctx: OwnershipContext;
  meta: McpConnectionMeta;
}

const LEGACY_URL_META: McpConnectionMeta = { authMethod: "url" };

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly mainMcp: McpFunc,
    private readonly tools: McpToolsRepository,
    private readonly usage: McpUsageService,
    private readonly apiKeys: PersonalApiKeyService,
  ) {}

  /**
   * Open an SSE stream and register a new MCP session for the given
   * ownership context. The endpoint URL the client should POST to includes
   * the messagesPath plus a server-generated sessionId query param — this
   * mirrors the MCP SSE transport spec. `meta` says how the caller
   * authenticated, so its usage is attributed correctly.
   */
  async openSseSession(
    ctx: OwnershipContext,
    messagesPath: string,
    res: ServerResponse,
    meta: McpConnectionMeta = LEGACY_URL_META,
  ): Promise<void> {
    const transport = new SSEServerTransport(messagesPath, res);
    // The client introduces itself in `initialize`, after the stream opens, so
    // its identity is read lazily from the connected server.
    let server: McpServer | null = null;
    const clientOf = () => toClientInfo(server?.server.getClientVersion());

    // Tools read `session.ctx` when they run, not the ctx the stream opened
    // with: an identity-authenticated session follows the user's active
    // workspace (see handlePostMessage).
    const session = { transport, ctx, meta } as Session;
    server = McpSettings.build(() => session.ctx, this.mainMcp, this.tools, {
      onToolCall: (toolName, success, durationMs) =>
        this.usage.recordToolCall(session.ctx, meta, clientOf(), {
          toolName,
          success,
          durationMs,
        }),
    });
    server.server.oninitialized = () =>
      this.onInitialized(session.ctx, meta, clientOf());
    session.server = server;
    this.sessions.set(transport.sessionId, session);

    transport.onclose = () => {
      this.sessions.delete(transport.sessionId);
      this.logger.log(`MCP session closed: ${transport.sessionId}`);
    };

    // @ts-ignore
    transport.onerror = (err) => {
      this.logger.error(
        `MCP transport error (${transport.sessionId}): ${err.message}`,
      );
    };

    res.on("close", () => {
      this.sessions.delete(transport.sessionId);
      void server?.close().catch(() => undefined);
    });

    await server.connect(transport);

    this.logger.log(
      `MCP session opened: ${transport.sessionId} (user=${ctx.userId}, org=${ctx.organizationId ?? "-"}, auth=${meta.authMethod})`,
    );
  }

  /**
   * Route an incoming POST message to the SSE session identified by
   * `sessionId`. The session must belong to the caller — otherwise we 404 to
   * avoid leaking session existence across tenants.
   *
   * A legacy-URL session is bound to the workspace in its URL, so the whole
   * ownership context must match. A session opened with an API key or an
   * OAuth token belongs to a USER, and each POST re-resolves that user's
   * active workspace: the session adopts it, so `switch_workspace` applies to
   * the next message instead of orphaning the stream (MCP-006).
   */
  async handlePostMessage(
    ctx: OwnershipContext,
    sessionId: string,
    req: IncomingMessage,
    res: ServerResponse,
    parsedBody: unknown,
    caller: McpConnectionMeta = LEGACY_URL_META,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (!session || !this.belongsToCaller(session, ctx, caller)) {
      // Treat cross-tenant access as not-found.
      throw new NotFoundException("MCP session not found");
    }

    if (session.meta.authMethod !== "url") {
      session.ctx = ctx;
    }

    await session.transport.handlePostMessage(req, res, parsedBody);
  }

  /**
   * Streamable HTTP (MCP 2025-03-26+), stateless: every POST carries the API
   * key, builds its own server for the caller's current workspace, and is
   * answered with plain JSON. Nothing is kept in memory between requests, so
   * this works behind any number of API instances and `switch_workspace`
   * applies from the very next request.
   */
  async handleStreamableRequest(
    auth: ResolvedPersonalApiKey,
    req: IncomingMessage,
    res: ServerResponse,
    parsedBody: unknown,
  ): Promise<void> {
    const { ctx, apiKey } = auth;
    const meta: McpConnectionMeta = {
      authMethod: "api_key",
      apiKeyId: apiKey.id,
      apiKeySource: apiKey.source,
    };

    // Stateless: only the `initialize` request names the client. Later
    // requests are attributed to the client that last initialized this key.
    const initializing = initializeClientOf(parsedBody);
    if (initializing) {
      this.onInitialized(ctx, meta, initializing);
    }
    const client =
      initializing ??
      (apiKey.lastClientName
        ? { name: apiKey.lastClientName, version: apiKey.lastClientVersion }
        : null);

    const server = McpSettings.build(ctx, this.mainMcp, this.tools, {
      onToolCall: (toolName, success, durationMs) =>
        this.usage.recordToolCall(ctx, meta, client, {
          toolName,
          success,
          durationMs,
        }),
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => {
      void transport.close().catch(() => undefined);
      void server.close().catch(() => undefined);
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, parsedBody);
  }

  private onInitialized(
    ctx: OwnershipContext,
    meta: McpConnectionMeta,
    client: McpClientInfo | null,
  ): void {
    this.usage.recordConnect(ctx, meta, client);
    if (meta.apiKeyId && client) {
      this.apiKeys.recordClient(meta.apiKeyId, client);
    }
  }

  private belongsToCaller(
    session: Session,
    ctx: OwnershipContext,
    caller: McpConnectionMeta,
  ): boolean {
    if (session.meta.authMethod !== caller.authMethod) return false;
    switch (caller.authMethod) {
      case "url":
        return this.sameContext(session.ctx, ctx);
      case "api_key":
        return (
          session.ctx.userId === ctx.userId &&
          (session.meta.apiKeyId ?? null) === (caller.apiKeyId ?? null)
        );
      case "oauth":
        return session.ctx.userId === ctx.userId;
    }
  }

  private sameContext(a: OwnershipContext, b: OwnershipContext): boolean {
    return (
      a.userId === b.userId &&
      (a.organizationId ?? null) === (b.organizationId ?? null)
    );
  }
}

function toClientInfo(
  impl: { name?: unknown; version?: unknown } | undefined,
): McpClientInfo | null {
  if (!impl || typeof impl.name !== "string" || !impl.name) return null;
  return {
    name: impl.name,
    version: typeof impl.version === "string" ? impl.version : null,
  };
}

/** `clientInfo` of an `initialize` request (single or batched JSON-RPC). */
function initializeClientOf(body: unknown): McpClientInfo | null {
  const messages = Array.isArray(body) ? body : [body];
  for (const message of messages) {
    if (
      message &&
      typeof message === "object" &&
      (message as { method?: unknown }).method === "initialize"
    ) {
      const params = (message as { params?: { clientInfo?: unknown } }).params;
      return toClientInfo(
        params?.clientInfo as { name?: unknown; version?: unknown } | undefined,
      );
    }
  }
  return null;
}
