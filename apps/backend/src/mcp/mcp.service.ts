import { Injectable, Logger, NotFoundException } from "@nestjs/common";
// @ts-ignore
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
// @ts-ignore
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { OwnershipContext } from "@ringee/platform";
import { McpFunc } from "./mcp.func";
import { McpSettings } from "./mcp.settings";
import { McpToolsRepository } from "./mcp.tools.repository";

interface Session {
  transport: SSEServerTransport;
  server: McpServer;
  ctx: OwnershipContext;
}

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly mainMcp: McpFunc,
    private readonly tools: McpToolsRepository,
  ) {}

  /**
   * Open an SSE stream and register a new MCP session for the given
   * ownership context. The endpoint URL the client should POST to includes
   * the messagesPath plus a server-generated sessionId query param — this
   * mirrors the MCP SSE transport spec.
   */
  async openSseSession(
    ctx: OwnershipContext,
    messagesPath: string,
    res: ServerResponse,
  ): Promise<void> {
    const transport = new SSEServerTransport(messagesPath, res);
    const server = McpSettings.build(ctx, this.mainMcp, this.tools);

    const session: Session = { transport, server, ctx };
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
      void server.close().catch(() => undefined);
    });

    await server.connect(transport);

    this.logger.log(
      `MCP session opened: ${transport.sessionId} (user=${ctx.userId}, org=${ctx.organizationId ?? "-"})`,
    );
  }

  /**
   * Route an incoming POST message to the SSE session identified by
   * `sessionId`. The session must belong to the same ownership context
   * the caller authenticated with — otherwise we 404 to avoid leaking
   * session existence across tenants.
   */
  async handlePostMessage(
    ctx: OwnershipContext,
    sessionId: string,
    req: IncomingMessage,
    res: ServerResponse,
    parsedBody: unknown,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new NotFoundException("MCP session not found");
    }

    if (!this.sameContext(session.ctx, ctx)) {
      // Treat cross-tenant access as not-found.
      throw new NotFoundException("MCP session not found");
    }

    await session.transport.handlePostMessage(req, res, parsedBody);
  }

  private sameContext(a: OwnershipContext, b: OwnershipContext): boolean {
    return (
      a.userId === b.userId &&
      (a.organizationId ?? null) === (b.organizationId ?? null)
    );
  }
}
