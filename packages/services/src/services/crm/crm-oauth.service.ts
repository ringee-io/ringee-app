import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { CrmProviderType } from "@ringee/database";
import {
  CrmProviderRegistry,
  CryptoService,
  OwnershipContext,
  RedisService,
} from "@ringee/platform";
import { CrmConnectionService } from "./crm-connection.service";

export type OAuthStartOptions = {
  provider: CrmProviderType;
  scope?: "personal" | "organization";
  redirectFrontendUrl?: string;
};

export type OAuthStatePayload = {
  userId: string;
  organizationId: string | null;
  scope: "personal" | "organization";
  provider: CrmProviderType;
  nonce: string;
  redirectFrontendUrl?: string;
};

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class CrmOAuthService {
  private readonly logger = new Logger(CrmOAuthService.name);

  constructor(
    private readonly registry: CrmProviderRegistry,
    private readonly crypto: CryptoService,
    private readonly redis: RedisService,
    private readonly connections: CrmConnectionService,
  ) {}

  getBackendRedirectUri(provider: CrmProviderType): string {
    const base = apiConfiguration.BACKEND_URL as string | undefined;
    if (!base) throw new BadRequestException("BACKEND_URL not configured");
    return `${base.replace(/\/$/, "")}/api/crm/${provider}/oauth/callback`;
  }

  async createAuthorizationUrl(
    ctx: OwnershipContext,
    opts: OAuthStartOptions,
  ): Promise<string> {
    const provider = this.registry.get(opts.provider);
    const scope: "personal" | "organization" =
      opts.scope ?? (ctx.organizationId ? "organization" : "personal");

    if (scope === "organization" && !ctx.organizationId) {
      throw new BadRequestException(
        "cannot start organization-scoped oauth without an active organization",
      );
    }

    const nonce = this.randomHex(16);
    const state = this.crypto.encrypt({
      v: 1,
      userId: ctx.userId,
      organizationId: scope === "organization" ? ctx.organizationId : null,
      scope,
      provider: opts.provider,
      nonce,
      redirectFrontendUrl: opts.redirectFrontendUrl ?? null,
    });

    await this.redis.set(this.nonceKey(nonce), "1", STATE_TTL_MS);

    return provider.getAuthorizationUrl({
      redirectUri: this.getBackendRedirectUri(opts.provider),
      state,
      scope: undefined,
    });
  }

  async consumeState(stateRaw: string): Promise<OAuthStatePayload> {
    let decoded: Record<string, unknown>;
    try {
      decoded = this.crypto.decrypt(stateRaw);
    } catch {
      throw new UnauthorizedException("invalid oauth state");
    }
    const payload = decoded as Partial<OAuthStatePayload>;
    if (
      !payload.userId ||
      !payload.scope ||
      !payload.provider ||
      !payload.nonce
    ) {
      throw new UnauthorizedException("invalid oauth state");
    }
    const exists = await this.redis.has(this.nonceKey(payload.nonce));
    if (!exists) {
      throw new UnauthorizedException("oauth state expired or already used");
    }
    await this.redis.del(this.nonceKey(payload.nonce));
    return {
      userId: payload.userId,
      organizationId: payload.organizationId ?? null,
      scope: payload.scope,
      provider: payload.provider,
      nonce: payload.nonce,
      redirectFrontendUrl: payload.redirectFrontendUrl ?? undefined,
    };
  }

  async handleCallback(
    provider: CrmProviderType,
    code: string,
    stateRaw: string,
  ): Promise<{
    connectionId: string;
    accountName: string | null;
    redirectFrontendUrl?: string;
  }> {
    const state = await this.consumeState(stateRaw);
    if (state.provider !== provider) {
      throw new UnauthorizedException("oauth provider mismatch");
    }
    const providerImpl = this.registry.get(provider);
    const redirectUri = this.getBackendRedirectUri(provider);

    const tokens = await providerImpl.exchangeCode({ code, redirectUri });

    const workspace = await providerImpl.getWorkspaceInfo({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? null,
      accountId: "",
      connectionId: "",
    });

    const ctx: OwnershipContext = {
      userId: state.userId,
      organizationId: state.scope === "organization" ? state.organizationId : null,
    };

    const connection = await this.connections.upsertFromOAuth(ctx, provider, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? null,
      expiresAt: tokens.expiresAt ?? null,
      scopes: tokens.scopes,
      externalAccountId: workspace.accountId,
      externalAccountName: workspace.accountName,
      providerMetadata: workspace.metadata ?? null,
      capabilities: (workspace.capabilities ?? null) as Record<string, unknown> | null,
    });

    return {
      connectionId: connection.id,
      accountName: workspace.accountName,
      redirectFrontendUrl: state.redirectFrontendUrl,
    };
  }

  private nonceKey(nonce: string): string {
    return `crm:oauth:nonce:${nonce}`;
  }

  private randomHex(bytes: number): string {
    const arr = new Uint8Array(bytes);
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
}
