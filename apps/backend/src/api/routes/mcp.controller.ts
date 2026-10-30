import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserData,
  Public,
  OwnershipContext,
} from "@ringee/platform";
import { apiConfiguration } from "@ringee/configuration";
import {
  PersonalApiKeyService,
  type ResolvedPersonalApiKey,
} from "@ringee/services";
import type { Request, Response } from "express";
import { McpService } from "../../mcp/mcp.service";
import {
  PersonalApiKeyGuard,
  type PersonalApiKeyRequest,
} from "../guards/personal-api-key.guard";

const GLOBAL_PREFIX = "/api";

@Controller("/mcp")
export class McpController {
  constructor(
    private readonly mcpService: McpService,
    private readonly apiKeys: PersonalApiKeyService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────
  //  Connection info for the authenticated user
  //  GET /api/mcp/connection-info
  //
  //  `endpoint` / `sseEndpoint` are the API-key URLs (the recommended way to
  //  connect): the same for everyone, the key carries the identity. `url` is
  //  the legacy capability URL that embeds the Ringee internal IDs, kept for
  //  clients that cannot send headers.
  // ──────────────────────────────────────────────────────────────────────

  @Get("connection-info")
  async connectionInfo(@CurrentUser() user: CurrentUserData) {
    if (!user) {
      throw new HttpException("Unauthorized", 401);
    }

    const baseUrl = (apiConfiguration.BACKEND_URL || "").replace(/\/+$/, "");
    const endpoint = `${baseUrl}${GLOBAL_PREFIX}/mcp`;
    const apiKeyEndpoints = {
      endpoint,
      sseEndpoint: `${endpoint}/sse`,
    };

    // The old id-based URL is offered only while it still works.
    const legacy = apiConfiguration.MCP_LEGACY_UUID_URLS;

    if (user.activeOrgId) {
      return {
        mode: "organization" as const,
        userId: user.id,
        organizationId: user.activeOrgId,
        url: legacy
          ? `${baseUrl}${GLOBAL_PREFIX}/mcp/${user.id}/${user.activeOrgId}/sse`
          : null,
        ...apiKeyEndpoints,
      };
    }

    return {
      mode: "freelancer" as const,
      userId: user.id,
      organizationId: null,
      url: legacy ? `${baseUrl}${GLOBAL_PREFIX}/mcp/${user.id}/sse` : null,
      ...apiKeyEndpoints,
    };
  }

  /**
   * A connection URL for clients that can only be given a URL (claude.ai
   * custom connectors, the Claude Code plugin). It carries a new personal API
   * key — a secret, revocable like any other key — instead of the user and
   * organization ids the old URLs exposed. Shown once.
   */
  @Post("connector-url")
  async createConnectorUrl(@CurrentUser() user: CurrentUserData) {
    if (!user) {
      throw new HttpException("Unauthorized", 401);
    }
    const created = await this.apiKeys.create(user.id, "Connector URL");
    const base = `${(apiConfiguration.BACKEND_URL || "").replace(/\/+$/, "")}${GLOBAL_PREFIX}/mcp/k/${created.key}`;
    return {
      keyId: created.id,
      prefix: created.prefix,
      /** SSE, what claude.ai connectors and the plugin's URL field take. */
      url: `${base}/sse`,
      /** Streamable HTTP, for clients that speak it. */
      streamableUrl: base,
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Key-in-URL endpoint (connector URLs)
  //  POST /api/mcp/k/:key              Streamable HTTP, stateless
  //  GET  /api/mcp/k/:key/sse          SSE
  //  POST /api/mcp/k/:key/messages
  //
  //  `@Public()` only to skip the Clerk guard: the personal API key in the
  //  path is the proof, exactly as in the Authorization header. Declared
  //  before the id-based routes, whose `:userId/:organizationId` pattern
  //  would otherwise claim `k/<key>`.
  // ──────────────────────────────────────────────────────────────────────

  @Public()
  @Post("k/:key")
  async keyStreamable(
    @Param("key") key: string,
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
  ) {
    const auth = await this.apiKeys.authenticate(key);
    await this.mcpService.handleStreamableRequest(auth, req, res, body);
  }

  @Public()
  @Get("k/:key/sse")
  async keySse(@Param("key") key: string, @Res() res: Response) {
    const auth = await this.apiKeys.authenticate(key);
    await this.mcpService.openSseSession(
      auth.ctx,
      `${GLOBAL_PREFIX}/mcp/k/${key}/messages`,
      res,
      keyMeta(auth),
    );
  }

  @Public()
  @Post("k/:key/messages")
  async keyMessages(
    @Param("key") key: string,
    @Query("sessionId") sessionId: string,
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
  ) {
    if (!sessionId) {
      throw new HttpException("Missing sessionId", 400);
    }
    const auth = await this.apiKeys.authenticate(key);
    await this.mcpService.handlePostMessage(
      auth.ctx,
      sessionId,
      req,
      res,
      body,
      keyMeta(auth),
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  //  API-key endpoint (recommended)
  //  POST /api/mcp            Streamable HTTP, stateless
  //  GET  /api/mcp/sse        SSE, for clients without Streamable HTTP
  //  POST /api/mcp/messages
  //
  //  `@Public()` only to skip the Clerk guard: `PersonalApiKeyGuard` is the
  //  proof — `Authorization: Bearer ringee_sk_…`. The workspace is the
  //  user's active MCP workspace, re-resolved on every request.
  // ──────────────────────────────────────────────────────────────────────

  @Public()
  @UseGuards(PersonalApiKeyGuard)
  @Post()
  async streamable(
    @Req() req: PersonalApiKeyRequest,
    @Res() res: Response,
    @Body() body: unknown,
  ) {
    await this.mcpService.handleStreamableRequest(
      req.personalApiKeyAuth,
      req,
      res,
      body,
    );
  }

  /**
   * Stateless server: no standalone SSE stream (GET) and no session to
   * terminate (DELETE). 405 is the spec's answer for both.
   */
  @Public()
  @Get()
  streamableGet(@Res() res: Response) {
    this.methodNotAllowed(res);
  }

  @Public()
  @Delete()
  streamableDelete(@Res() res: Response) {
    this.methodNotAllowed(res);
  }

  @Public()
  @UseGuards(PersonalApiKeyGuard)
  @Get("sse")
  async apiKeySse(@Req() req: PersonalApiKeyRequest, @Res() res: Response) {
    const { ctx, apiKey } = req.personalApiKeyAuth;
    await this.mcpService.openSseSession(
      ctx,
      `${GLOBAL_PREFIX}/mcp/messages`,
      res,
      {
        authMethod: "api_key",
        apiKeyId: apiKey.id,
        apiKeySource: apiKey.source,
      },
    );
  }

  @Public()
  @UseGuards(PersonalApiKeyGuard)
  @Post("messages")
  async apiKeyMessages(
    @Query("sessionId") sessionId: string,
    @Req() req: PersonalApiKeyRequest,
    @Res() res: Response,
    @Body() body: unknown,
  ) {
    if (!sessionId) {
      throw new HttpException("Missing sessionId", 400);
    }
    const { ctx, apiKey } = req.personalApiKeyAuth;
    await this.mcpService.handlePostMessage(ctx, sessionId, req, res, body, {
      authMethod: "api_key",
      apiKeyId: apiKey.id,
      apiKeySource: apiKey.source,
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Single-id endpoint (freelancer or org id fallback)
  //  /api/mcp/:id/sse
  //  /api/mcp/:id/messages
  // ──────────────────────────────────────────────────────────────────────

  @Public()
  @Get(":id/sse")
  async sse(@Param("id") id: string, @Res() res: Response) {
    const ctx = await this.resolveContextById(id);
    await this.mcpService.openSseSession(
      ctx,
      `${GLOBAL_PREFIX}/mcp/${id}/messages`,
      res,
    );
  }

  @Public()
  @Post(":id/messages")
  async messages(
    @Param("id") id: string,
    @Query("sessionId") sessionId: string,
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
  ) {
    if (!sessionId) {
      throw new HttpException("Missing sessionId", 400);
    }
    const ctx = await this.resolveContextById(id);
    await this.mcpService.handlePostMessage(ctx, sessionId, req, res, body);
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Org-scoped endpoint (explicit user + organization)
  //  /api/mcp/:userId/:organizationId/sse
  //  /api/mcp/:userId/:organizationId/messages
  // ──────────────────────────────────────────────────────────────────────

  @Public()
  @Get(":userId/:organizationId/sse")
  async sseOrg(
    @Param("userId") userId: string,
    @Param("organizationId") organizationId: string,
    @Res() res: Response,
  ) {
    const ctx = await this.resolveOrgContext(userId, organizationId);
    await this.mcpService.openSseSession(
      ctx,
      `${GLOBAL_PREFIX}/mcp/${userId}/${organizationId}/messages`,
      res,
    );
  }

  @Public()
  @Post(":userId/:organizationId/messages")
  async messagesOrg(
    @Param("userId") userId: string,
    @Param("organizationId") organizationId: string,
    @Query("sessionId") sessionId: string,
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
  ) {
    if (!sessionId) {
      throw new HttpException("Missing sessionId", 400);
    }
    const ctx = await this.resolveOrgContext(userId, organizationId);

    await this.mcpService.handlePostMessage(ctx, sessionId, req, res, body);
  }

  private methodNotAllowed(res: Response): void {
    res
      .status(405)
      .setHeader("Allow", "POST")
      .json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null,
      });
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Context resolution
  // ──────────────────────────────────────────────────────────────────────

  /** Old routes remain only to explain migration; UUIDs never authenticate. */
  private async resolveContextById(_id: string): Promise<OwnershipContext> {
    return retiredConnector();
  }

  private async resolveOrgContext(
    _userId: string,
    _organizationId: string,
  ): Promise<OwnershipContext> {
    return retiredConnector();
  }
}

function retiredConnector(): never {
  throw new HttpException(
    "This Ringee connection URL was retired. Create a new one in Ringee → Integrations → Connectors, or use an API key.",
    410,
  );
}

function keyMeta(auth: ResolvedPersonalApiKey) {
  return {
    authMethod: "api_key" as const,
    apiKeyId: auth.apiKey.id,
    apiKeySource: auth.apiKey.source,
  };
}
