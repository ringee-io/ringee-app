import {
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { Public, OwnershipContext } from "@ringee/platform";
import { apiConfiguration } from "@ringee/configuration";
import { OrganizationService, UserService } from "@ringee/services";
import { getAuth } from "@clerk/express";
import type { Request, Response } from "express";
import { McpService } from "../../mcp/mcp.service";

const GLOBAL_PREFIX = "/api";
const SCOPES = (process.env.MCP_OAUTH_SCOPES || "ringee:use")
  .split(/[ ,]+/)
  .filter(Boolean);

/**
 * Authenticated MCP endpoint for the ChatGPT App (OAuth, RFC 9728).
 *
 * Unlike the public `McpController` — which trusts the user/organization UUIDs
 * embedded in the URL — this controller has NO ids in the path. It resolves the
 * caller from a verified Clerk bearer token, so each end user only ever reaches
 * their own Ringee data. The connector points at a single stable URL:
 *
 *   GET  /api/mcp/chatgpt/sse        (open the stream)
 *   POST /api/mcp/chatgpt/messages   (JSON-RPC messages)
 *
 * Routes are `@Public()` so the global ClerkAuthGuard is bypassed and we can
 * emit a proper `401 + WWW-Authenticate` OAuth challenge (which the global
 * guard does not), letting ChatGPT discover the auth server and sign the user
 * in. The token itself is still verified here via Clerk's `getAuth`.
 */
@Controller("/mcp/chatgpt")
export class McpChatgptController {
  constructor(
    private readonly mcpService: McpService,
    private readonly userService: UserService,
    private readonly organizationService: OrganizationService,
  ) {}

  // ── OAuth discovery (RFC 9728 protected-resource metadata) ────────────

  @Public()
  @Get(".well-known/oauth-protected-resource")
  oauthProtectedResource() {
    return {
      resource: this.resourceUrl(),
      authorization_servers: this.authorizationServers(),
      scopes_supported: SCOPES,
      bearer_methods_supported: ["header"],
    };
  }

  // ── MCP transport ─────────────────────────────────────────────────────

  @Public()
  @Get("sse")
  async sse(@Req() req: Request, @Res() res: Response) {
    const ctx = await this.resolveContext(req);
    if (!ctx) {
      return this.sendUnauthorized(res);
    }
    await this.mcpService.openSseSession(
      ctx,
      `${GLOBAL_PREFIX}/mcp/chatgpt/messages`,
      res,
    );
  }

  @Public()
  @Post("messages")
  async messages(
    @Query("sessionId") sessionId: string,
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
  ) {
    const ctx = await this.resolveContext(req);
    if (!ctx) {
      return this.sendUnauthorized(res);
    }
    if (!sessionId) {
      throw new HttpException("Missing sessionId", 400);
    }
    await this.mcpService.handlePostMessage(ctx, sessionId, req, res, body);
  }

  // ── Auth resolution ───────────────────────────────────────────────────

  /**
   * Resolve the Ringee ownership context from the request's Clerk bearer
   * token. Returns null when the caller is unauthenticated or has no matching
   * Ringee account (the handler then emits the OAuth challenge).
   */
  private async resolveContext(
    req: Request,
  ): Promise<OwnershipContext | null> {
    const { isAuthenticated, userId, orgId } = getAuth(req);

    if (!isAuthenticated || !userId) {
      return null;
    }

    const user = await this.userService.getByClerkId(userId);
    if (!user) {
      return null;
    }

    let organizationId: string | null = null;
    if (orgId) {
      const org = await this.organizationService.getByClerkId(orgId);
      if (!org) {
        // Token carries an org we don't know — refuse rather than silently
        // falling back to the personal scope.
        return null;
      }
      organizationId = org.id;
    }

    return { userId: user.id, organizationId };
  }

  private sendUnauthorized(res: Response): void {
    res.setHeader("WWW-Authenticate", this.wwwAuthenticate());
    res.status(401).json({ error: "Unauthorized" });
  }

  // ── OAuth metadata helpers ────────────────────────────────────────────

  private resourceUrl(): string {
    const base = (apiConfiguration.BACKEND_URL || "").replace(/\/+$/, "");
    return `${base}${GLOBAL_PREFIX}/mcp/chatgpt`;
  }

  private resourceMetadataUrl(): string {
    return `${this.resourceUrl()}/.well-known/oauth-protected-resource`;
  }

  private authorizationServers(): string[] {
    return (process.env.MCP_OAUTH_AUTHORIZATION_SERVERS || "")
      .split(/[ ,]+/)
      .map((s) => s.replace(/\/+$/, ""))
      .filter(Boolean);
  }

  private wwwAuthenticate(): string {
    return `Bearer resource_metadata="${this.resourceMetadataUrl()}", scope="${SCOPES.join(" ")}"`;
  }
}
