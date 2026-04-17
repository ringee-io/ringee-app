import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import { CrmProviderType, CrmSyncStatus } from "@ringee/database";
import {
  CrmCallLogService,
  CrmOAuthService,
  CrmStatusService,
  CrmConnectionService,
  CrmContactSyncService,
  CrmCompanySyncService,
  CrmNoteSyncService,
  CrmTaskSyncService,
  CrmMatchingService,
  CrmFieldMappingService,
  CrmBulkSyncService,
} from "@ringee/services";
import {
  createOwnershipContext,
  CrmProviderRegistry,
  CurrentUser,
  CurrentUserData,
  Public,
} from "@ringee/platform";
import { apiConfiguration } from "@ringee/configuration";
import type { Response } from "express";

function frontendUrl(): string {
  return (
    (apiConfiguration.FRONTEND_URL as string | undefined) || "http://localhost:4200"
  );
}

@Controller("crm")
export class CrmController {
  constructor(
    private readonly oauth: CrmOAuthService,
    private readonly connections: CrmConnectionService,
    private readonly status: CrmStatusService,
    private readonly callLog: CrmCallLogService,
    private readonly contactSync: CrmContactSyncService,
    private readonly companySync: CrmCompanySyncService,
    private readonly noteSync: CrmNoteSyncService,
    private readonly taskSync: CrmTaskSyncService,
    private readonly matching: CrmMatchingService,
    private readonly fieldMappings: CrmFieldMappingService,
    private readonly bulkSync: CrmBulkSyncService,
    private readonly providerRegistry: CrmProviderRegistry,
  ) {}

  // ── Connections ──────────────────────────────────────────────────────

  @Get("connections")
  async listConnections(@CurrentUser() user: CurrentUserData) {
    const ctx = createOwnershipContext(user);
    return this.status.listConnections(ctx);
  }

  @Delete("connections/:id")
  async disconnect(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    await this.connections.disconnect(ctx, id);
    return { ok: true };
  }

  @Post("connections/:id/forget")
  async forget(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    await this.connections.remove(ctx, id);
    return { ok: true };
  }

  // ── OAuth ────────────────────────────────────────────────────────────

  @Get(":provider/oauth/start")
  async oauthStart(
    @Param("provider") provider: string,
    @Query("scope") scope: "personal" | "organization" | undefined,
    @Query("redirect") redirect: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ): Promise<{ url: string }> {
    const validProviders: CrmProviderType[] = ["attio", "hubspot", "salesforce"];
    if (!validProviders.includes(provider as CrmProviderType)) {
      throw new BadRequestException(`unknown provider: ${provider}`);
    }
    const ctx = createOwnershipContext(user);
    const url = await this.oauth.createAuthorizationUrl(ctx, {
      provider: provider as CrmProviderType,
      scope,
      redirectFrontendUrl: redirect,
    });
    return { url };
  }

  @Public()
  @Get(":provider/oauth/callback")
  async oauthCallback(
    @Param("provider") provider: string,
    @Query("code") code: string,
    @Query("state") state: string,
    @Query("error") providerError: string | undefined,
    @Res() res: Response,
  ) {
    const base = frontendUrl().replace(/\/$/, "");

    if (providerError) {
      return res.redirect(
        `${base}/dashboard/settings/integrations?crm=error&provider=${provider}&reason=${encodeURIComponent(
          providerError,
        )}`,
      );
    }
    if (!code || !state) {
      return res.redirect(
        `${base}/dashboard/settings/integrations?crm=error&provider=${provider}&reason=missing_code`,
      );
    }
    try {
      const result = await this.oauth.handleCallback(
        provider as CrmProviderType,
        code,
        state,
      );

      // Fire-and-forget initial bulk sync
      const conn = await this.connections.findById(result.connectionId);
      if (conn) {
        this.bulkSync.syncConnection(conn).catch(() => {});
      }

      const target = result.redirectFrontendUrl
        ? `${result.redirectFrontendUrl}`
        : `${base}/dashboard/settings/integrations`;
      const sep = target.includes("?") ? "&" : "?";
      return res.redirect(
        `${target}${sep}crm=connected&provider=${provider}&connectionId=${result.connectionId}`,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : "oauth_failed";

      return res.redirect(
        `${base}/dashboard/settings/integrations?crm=error&provider=${provider}&reason=${encodeURIComponent(
          reason,
        )}`,
      );
    }
  }

  // ── Sync status ──────────────────────────────────────────────────────

  @Get("connections/:id/syncs")
  async listSyncs(
    @Param("id") id: string,
    @Query("status") status: string | undefined,
    @Query("limit") limit: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    const parsedStatus = status
      ? (status.split(",").filter(Boolean) as CrmSyncStatus[])
      : undefined;
    return this.status.listRecentSyncs(ctx, id, {
      status: parsedStatus,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get("calls/:callId/syncs")
  async listSyncsForCall(
    @Param("callId") callId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.status.listSyncsForCall(ctx, callId);
  }

  @Post("syncs/:id/retry")
  async retrySync(@Param("id") id: string) {
    await this.callLog.manualRetry(id);
    return { ok: true };
  }

  // ── Match resolution ────────────────────────────────────────────────

  @Post("syncs/:id/resolve")
  async resolveMatch(
    @Param("id") id: string,
    @Body()
    body: {
      externalId: string;
      externalType: "person" | "company";
    },
  ) {
    if (!body.externalId || !body.externalType) {
      throw new BadRequestException("externalId and externalType required");
    }
    await this.matching.resolveAmbiguousMatch(
      id,
      body.externalId,
      body.externalType,
    );
    return { ok: true };
  }

  // ── Contact sync (inbound) ─────────────────────────────────────────

  @Post("connections/:id/sync-contact")
  async syncContact(
    @Param("id") connectionId: string,
    @Body() body: { externalId: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!body.externalId) {
      throw new BadRequestException("externalId required");
    }
    const ctx = createOwnershipContext(user);
    const conn = await this.connections.findById(connectionId);
    if (!conn) throw new BadRequestException("connection not found");
    await this.connections.assertAccess(ctx, conn);
    return this.contactSync.syncFromCrm(conn, body.externalId, ctx);
  }

  // ── Company sync (inbound) ─────────────────────────────────────────

  @Post("connections/:id/sync-company")
  async syncCompany(
    @Param("id") connectionId: string,
    @Body() body: { externalId: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!body.externalId) {
      throw new BadRequestException("externalId required");
    }
    const ctx = createOwnershipContext(user);
    const conn = await this.connections.findById(connectionId);
    if (!conn) throw new BadRequestException("connection not found");
    await this.connections.assertAccess(ctx, conn);
    return this.companySync.syncFromCrm(conn, body.externalId, ctx);
  }

  // ── Note sync (outbound) ───────────────────────────────────────────

  @Post("contacts/:contactId/sync-note")
  async syncNote(
    @Param("contactId") contactId: string,
    @Body() body: { title?: string; body: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!body.body) throw new BadRequestException("body required");
    const ctx = createOwnershipContext(user);
    await this.noteSync.enqueueNote(ctx, {
      contactId,
      title: body.title,
      body: body.body,
    });
    return { ok: true };
  }

  // ── Task sync (outbound) ───────────────────────────────────────────

  @Post("contacts/:contactId/sync-task")
  async syncTask(
    @Param("contactId") contactId: string,
    @Body()
    body: {
      title: string;
      body?: string;
      dueAt?: string;
      assigneeEmail?: string;
    },
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!body.title) throw new BadRequestException("title required");
    const ctx = createOwnershipContext(user);
    await this.taskSync.enqueueTask(ctx, {
      contactId,
      title: body.title,
      body: body.body,
      dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
      assigneeEmail: body.assigneeEmail,
    });
    return { ok: true };
  }

  // ── Field mappings ─────────────────────────────────────────────────

  @Get("connections/:id/field-mappings")
  async listFieldMappings(
    @Param("id") connectionId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    const conn = await this.connections.findById(connectionId);
    if (!conn) throw new BadRequestException("connection not found");
    await this.connections.assertAccess(ctx, conn);
    return this.fieldMappings.getMappings(connectionId, "contact", "bidirectional");
  }

  @Post("connections/:id/field-mappings/seed")
  async seedFieldMappings(
    @Param("id") connectionId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    const conn = await this.connections.findById(connectionId);
    if (!conn) throw new BadRequestException("connection not found");
    await this.connections.assertAccess(ctx, conn);
    await this.fieldMappings.seedDefaultMappings(connectionId, conn.provider);
    return { ok: true };
  }

  // ── Provider metadata ──────────────────────────────────────────────

  @Get("connections/:id/lists")
  async listCrmLists(
    @Param("id") connectionId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    const conn = await this.connections.findById(connectionId);
    if (!conn) throw new BadRequestException("connection not found");
    await this.connections.assertAccess(ctx, conn);

    const provider = this.providerRegistry.get(conn.provider);
    if (!provider.listLists) return [];

    const decrypted = await this.connections.decrypt(conn);
    return provider.listLists({
      accessToken: decrypted.accessToken,
      refreshToken: decrypted.refreshToken,
      accountId: conn.externalAccountId,
      connectionId: conn.id,
    });
  }

  @Get("connections/:id/members")
  async listCrmMembers(
    @Param("id") connectionId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    const conn = await this.connections.findById(connectionId);
    if (!conn) throw new BadRequestException("connection not found");
    await this.connections.assertAccess(ctx, conn);

    const provider = this.providerRegistry.get(conn.provider);
    if (!provider.listMembers) return [];

    const decrypted = await this.connections.decrypt(conn);
    try {
      return await provider.listMembers({
        accessToken: decrypted.accessToken,
        refreshToken: decrypted.refreshToken,
        accountId: conn.externalAccountId,
        connectionId: conn.id,
      });
    } catch {
      return [];
    }
  }
}
