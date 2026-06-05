import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Query,
  Req,
  Res,
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
  //  Returns the SSE URL the user can paste into an MCP client (Claude
  //  desktop, ChatGPT, etc). The URL embeds the Ringee internal IDs so the
  //  public /mcp/:id endpoints can route requests without re-auth.
  // ──────────────────────────────────────────────────────────────────────

  @Get("connection-info")
  async connectionInfo(@CurrentUser() user: CurrentUserData) {
    if (!user) {
      throw new HttpException("Unauthorized", 401);
    }

    const baseUrl = (apiConfiguration.BACKEND_URL || "").replace(
      /\/+$/,
      "",
    );

    if (user.activeOrgId) {
      return {
        mode: "organization" as const,
        userId: user.id,
        organizationId: user.activeOrgId,
        url: `${baseUrl}${GLOBAL_PREFIX}/mcp/${user.id}/${user.activeOrgId}/sse`,
      };
    }

    return {
      mode: "freelancer" as const,
      userId: user.id,
      organizationId: null,
      url: `${baseUrl}${GLOBAL_PREFIX}/mcp/${user.id}/sse`,
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Single-id endpoint (freelancer or org id fallback)
  //  /api/mcp/:id/sse
  //  /api/mcp/:id/messages
  // ──────────────────────────────────────────────────────────────────────

  @Public()
  @Get(":id/sse")
  async sse(
    @Param("id") id: string,
    @Res() res: Response,
  ) {
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

    const members = (org as unknown as { members?: { userId: string | null }[] })
      .members;
    const isMember = members?.some((m) => m.userId === user.id) ?? false;

    if (!isMember) {
      throw new HttpException(
        "User is not a member of the organization",
        403,
      );
    }

    return { userId: user.id, organizationId: org.id };
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
