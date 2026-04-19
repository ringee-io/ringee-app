import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  CrmConnection,
  CrmConnectionRepository,
  CrmConnectionScope,
  CrmConnectionStatus,
  CrmProviderType,
} from "@ringee/database";
import {
  CrmError,
  CrmProviderRegistry,
  CryptoService,
  OwnershipContext,
} from "@ringee/platform";

export type DecryptedCrmCredentials = {
  connection: CrmConnection;
  accessToken: string;
  refreshToken: string | null;
};

const REFRESH_SKEW_MS = 60_000;

@Injectable()
export class CrmConnectionService {
  private readonly logger = new Logger(CrmConnectionService.name);

  constructor(
    private readonly repo: CrmConnectionRepository,
    private readonly crypto: CryptoService,
    private readonly registry: CrmProviderRegistry,
  ) {}

  resolveScope(ctx: OwnershipContext): {
    scope: CrmConnectionScope;
    organizationId: string | null;
  } {
    if (ctx.organizationId) {
      return { scope: "organization", organizationId: ctx.organizationId };
    }
    return { scope: "personal", organizationId: null };
  }

  listVisible(ctx: OwnershipContext): Promise<CrmConnection[]> {
    return this.repo.listVisibleTo(ctx);
  }

  findById(id: string): Promise<CrmConnection | null> {
    return this.repo.findById(id);
  }

  async findActive(
    ctx: OwnershipContext,
    provider: CrmProviderType,
  ): Promise<CrmConnection | null> {
    const { scope, organizationId } = this.resolveScope(ctx);
    return this.repo.findActive({
      provider,
      scope,
      userId: ctx.userId,
      organizationId,
    });
  }

  async upsertFromOAuth(
    ctx: OwnershipContext,
    provider: CrmProviderType,
    input: {
      accessToken: string;
      refreshToken: string | null;
      expiresAt: Date | null;
      scopes?: string[];
      externalAccountId: string;
      externalAccountName: string | null;
      providerMetadata?: Record<string, unknown> | null;
      capabilities?: Record<string, unknown> | null;
    },
  ): Promise<CrmConnection> {
    const { scope, organizationId } = this.resolveScope(ctx);
    const accessTokenCiphertext = this.crypto.encrypt({ t: input.accessToken });
    const refreshTokenCiphertext = input.refreshToken
      ? this.crypto.encrypt({ t: input.refreshToken })
      : null;

    return this.repo.upsertConnection({
      ctx: {
        provider,
        scope,
        userId: ctx.userId,
        organizationId,
      },
      externalAccountId: input.externalAccountId,
      externalAccountName: input.externalAccountName,
      accessTokenCiphertext,
      refreshTokenCiphertext,
      tokenExpiresAt: input.expiresAt,
      scopes: input.scopes ?? [],
      providerMetadata: input.providerMetadata ?? undefined,
      capabilities: input.capabilities ?? undefined,
    });
  }

  async updateTokens(
    id: string,
    tokens: { accessToken: string; refreshToken?: string | null; expiresAt?: Date | null },
  ): Promise<CrmConnection> {
    const accessTokenCiphertext = this.crypto.encrypt({ t: tokens.accessToken });
    const refreshTokenCiphertext = tokens.refreshToken
      ? this.crypto.encrypt({ t: tokens.refreshToken })
      : undefined;
    return this.repo.updateTokens(id, {
      accessTokenCiphertext,
      refreshTokenCiphertext,
      tokenExpiresAt: tokens.expiresAt ?? null,
    });
  }

  async markStatus(
    id: string,
    status: CrmConnectionStatus,
    errorCode?: string | null,
  ): Promise<CrmConnection> {
    return this.repo.markStatus(id, status, errorCode ?? null);
  }

  async touchLastSync(id: string): Promise<void> {
    await this.repo.touchLastSync(id);
  }

  async decrypt(connection: CrmConnection): Promise<DecryptedCrmCredentials> {
    const accessTokenPayload = this.crypto.decrypt(connection.accessTokenCiphertext);
    const accessToken = (accessTokenPayload as { t?: string }).t;
    if (!accessToken) {
      throw new BadRequestException("corrupt access token for connection");
    }
    let refreshToken: string | null = null;
    if (connection.refreshTokenCiphertext) {
      const refreshPayload = this.crypto.decrypt(connection.refreshTokenCiphertext);
      refreshToken = (refreshPayload as { t?: string }).t ?? null;
    }
    return { connection, accessToken, refreshToken };
  }

  /**
   * Returns credentials with a non-expired access token, refreshing
   * via OAuth if the current one is expired (or within REFRESH_SKEW_MS of expiry).
   */
  async getValidCredentials(connection: CrmConnection): Promise<DecryptedCrmCredentials> {
    const decrypted = await this.decrypt(connection);
    if (!this.isTokenExpired(connection)) return decrypted;
    return this.refreshTokens(connection, decrypted);
  }

  /**
   * Forces a token refresh regardless of expiry — used as the reactive path
   * when a provider call returns AUTH_EXPIRED.
   */
  async forceRefresh(connection: CrmConnection): Promise<DecryptedCrmCredentials> {
    const decrypted = await this.decrypt(connection);
    return this.refreshTokens(connection, decrypted);
  }

  /**
   * Runs a provider call with auto-refresh: gets valid credentials
   * (proactive refresh if expiry is near), and if the call still throws
   * AUTH_EXPIRED (e.g. the stored `tokenExpiresAt` was null but the
   * access token was actually expired), force-refreshes once and retries.
   */
  async runWithFreshCredentials<T>(
    connection: CrmConnection,
    fn: (creds: {
      accessToken: string;
      refreshToken: string | null;
      accountId: string;
      connectionId: string;
    }) => Promise<T>,
  ): Promise<T> {
    let decrypted = await this.getValidCredentials(connection);
    const makeCreds = (d: DecryptedCrmCredentials) => ({
      accessToken: d.accessToken,
      refreshToken: d.refreshToken,
      accountId: d.connection.externalAccountId,
      connectionId: d.connection.id,
    });

    try {
      return await fn(makeCreds(decrypted));
    } catch (err) {
      if (err instanceof CrmError && err.code === "AUTH_EXPIRED") {
        decrypted = await this.forceRefresh(decrypted.connection);
        return fn(makeCreds(decrypted));
      }
      throw err;
    }
  }

  private isTokenExpired(connection: CrmConnection): boolean {
    if (!connection.tokenExpiresAt) return false;
    return connection.tokenExpiresAt.getTime() - Date.now() <= REFRESH_SKEW_MS;
  }

  private async refreshTokens(
    connection: CrmConnection,
    current: DecryptedCrmCredentials,
  ): Promise<DecryptedCrmCredentials> {
    if (!current.refreshToken) {
      await this.markStatus(connection.id, "revoked", "NO_REFRESH_TOKEN");
      throw new CrmError("AUTH_REVOKED", false, "no refresh token available");
    }

    const provider = this.registry.get(connection.provider);
    try {
      const tokens = await provider.refreshToken(current.refreshToken);
      const updated = await this.updateTokens(connection.id, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? current.refreshToken,
        expiresAt: tokens.expiresAt ?? null,
      });
      this.logger.log(`refreshed tokens for connection ${connection.id}`);
      return {
        connection: updated,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? current.refreshToken,
      };
    } catch (err) {
      if (err instanceof CrmError && provider.isRefreshFailureTerminal(err)) {
        await this.markStatus(connection.id, "revoked", err.code);
      }
      throw err;
    }
  }

  async assertAccess(ctx: OwnershipContext, connection: CrmConnection): Promise<void> {
    if (connection.scope === "organization") {
      if (!ctx.organizationId || connection.organizationId !== ctx.organizationId) {
        throw new NotFoundException("connection not found");
      }
      return;
    }
    if (connection.userId !== ctx.userId || connection.organizationId !== null) {
      throw new NotFoundException("connection not found");
    }
  }

  async disconnect(ctx: OwnershipContext, id: string): Promise<void> {
    const conn = await this.repo.findById(id);
    if (!conn) throw new NotFoundException("connection not found");
    await this.assertAccess(ctx, conn);
    await this.repo.markStatus(id, "disconnected");
  }

  async remove(ctx: OwnershipContext, id: string): Promise<void> {
    const conn = await this.repo.findById(id);
    if (!conn) throw new NotFoundException("connection not found");
    await this.assertAccess(ctx, conn);
    await this.repo.remove(id);
  }
}
