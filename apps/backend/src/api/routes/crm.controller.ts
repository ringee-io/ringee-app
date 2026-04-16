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
} from "@ringee/services";
import {
  createOwnershipContext,
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

    console.log("providerError", providerError);
    console.log("code", code);
    console.log("state", state);
    console.log("provider", provider);

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
      const target = result.redirectFrontendUrl
        ? `${result.redirectFrontendUrl}`
        : `${base}/dashboard/settings/integrations`;
      const sep = target.includes("?") ? "&" : "?";
      return res.redirect(
        `${target}${sep}crm=connected&provider=${provider}&connectionId=${result.connectionId}`,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : "oauth_failed";
      
      console.error("CRM OAuth Error", err);

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
}
