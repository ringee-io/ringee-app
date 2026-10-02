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
import { OrganizationService, UserService } from "@ringee/services";
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
    private readonly userService: UserService,
    private readonly organizationService: OrganizationService,
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

    if (user.activeOrgId) {
      return {
        mode: "organization" as const,
        userId: user.id,
        organizationId: user.activeOrgId,
        url: `${baseUrl}${GLOBAL_PREFIX}/mcp/${user.id}/${user.activeOrgId}/sse`,
        ...apiKeyEndpoints,
      };
    }

    return {
      mode: "freelancer" as const,
      userId: user.id,
      organizationId: null,
      url: `${baseUrl}${GLOBAL_PREFIX}/mcp/${user.id}/sse`,
      ...apiKeyEndpoints,
    };
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

  /**
   * Single-segment endpoint: try the id as a userId first; if not a user,
   * try it as an organizationId. Org-only mode resolves the userId from
   * the first membership with a known user (or the org's createdBy).
   *
   * Throws 404 only when neither lookup succeeds.
   */
  private async resolveContextById(id: string): Promise<OwnershipContext> {
    if (!isUuid(id)) {
      throw new HttpException("Invalid MCP url", 400);
    }

    const user = await this.userService.getCachedUserById(id);

    if (user) {
      return { userId: user.id, organizationId: null };
    }

    const org = (await this.organizationService.getOrganizationById(id)) as
      | (Awaited<ReturnType<OrganizationService["getOrganizationById"]>> & {
          members?: { userId: string | null }[];
          createdBy?: string | null;
        })
      | null;

    if (!org) {
      throw new HttpException("Invalid MCP url", 404);
    }

    const memberUserId =
      org.members?.find((m) => m.userId)?.userId ?? org.createdBy ?? null;

    if (!memberUserId) {
      throw new HttpException(
        "Organization has no user to act on behalf of",
        400,
      );
    }

    return { userId: memberUserId, organizationId: org.id };
  }

  /**
   * Two-segment endpoint: require both the user and organization to exist
   * and require the user to be a member of the organization.
   */
  private async resolveOrgContext(
    userId: string,
    organizationId: string,
  ): Promise<OwnershipContext> {
    if (!isUuid(userId) || !isUuid(organizationId)) {
      throw new HttpException("Invalid MCP url", 400);
    }

    const [user, org] = await Promise.all([
      this.userService.getCachedUserById(userId),
      this.organizationService.getOrganizationById(organizationId),
    ]);

    if (!user) {
      throw new HttpException("User not found", 404);
    }
    if (!org) {
      throw new HttpException("Organization not found", 404);
    }

    const members = (
      org as unknown as { members?: { userId: string | null }[] }
    ).members;
    const isMember = members?.some((m) => m.userId === user.id) ?? false;

    if (!isMember) {
      throw new HttpException("User is not a member of the organization", 403);
    }

    return { userId: user.id, organizationId: org.id };
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
