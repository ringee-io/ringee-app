import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { randomBytes, timingSafeEqual } from "crypto";
import { apiConfiguration } from "@ringee/configuration";
import { CrmProviderType } from "@ringee/database";
import {
  CrmProviderRegistry,
  CryptoService,
  OwnershipContext,
  RedisService,
  trustedFrontendOrigin,
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

  /**
   * The provider's authorization URL, and the value the starting browser must
   * hold (as a cookie) for the callback to be accepted: a state is bound to
   * the browser that started it, so a link started by someone else cannot
   * attach whoever approves it to their workspace.
   */
  async createAuthorizationUrl(
    ctx: OwnershipContext,
    opts: OAuthStartOptions,
  ): Promise<{ url: string; browserBinding: string }> {
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
      // Only back to one of Ringee's own frontends; anything else would make
      // the callback an open redirect.
      redirectFrontendUrl: safeReturnUrl(opts.redirectFrontendUrl),
    });

    await this.redis.set(this.nonceKey(nonce), "1", STATE_TTL_MS);

    const url = await provider.getAuthorizationUrl({
      redirectUri: this.getBackendRedirectUri(opts.provider),
      state,
      scope: undefined,
    });
    return { url, browserBinding: nonce };
  }

  async consumeState(
    stateRaw: string,
    browserBinding: string | null,
  ): Promise<OAuthStatePayload> {
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
    if (!sameSecret(payload.nonce, browserBinding)) {
      throw new UnauthorizedException(
        "oauth state was not started in this browser",
      );
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
      redirectFrontendUrl:
        safeReturnUrl(payload.redirectFrontendUrl) ?? undefined,
    };
  }

  async handleCallback(
    provider: CrmProviderType,
    code: string,
    stateRaw: string,
    browserBinding: string | null,
  ): Promise<{
    connectionId: string;
    accountName: string | null;
    redirectFrontendUrl?: string;
  }> {
    const state = await this.consumeState(stateRaw, browserBinding);
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
      organizationId:
        state.scope === "organization" ? state.organizationId : null,
    };

    const connection = await this.connections.upsertFromOAuth(ctx, provider, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? null,
      expiresAt: tokens.expiresAt ?? null,
      scopes: tokens.scopes,
      externalAccountId: workspace.accountId,
      externalAccountName: workspace.accountName,
      providerMetadata: workspace.metadata ?? null,
      capabilities: (workspace.capabilities ?? null) as Record<
        string,
        unknown
      > | null,
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
    return randomBytes(bytes).toString("hex");
  }
}

/** A return URL on one of Ringee's own frontends, else `null`. */
function safeReturnUrl(value: unknown): string | null {
  if (typeof value !== "string" || !trustedFrontendOrigin(value)) return null;
  return value;
}

function sameSecret(expected: string, actual: string | null): boolean {
  if (!actual) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}
