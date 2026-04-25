import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  CrmConnectionScope,
  EnrichmentConnection,
  EnrichmentConnectionRepository,
  EnrichmentConnectionStatus,
  EnrichmentProviderType,
} from "@ringee/database";
import {
  CryptoService,
  EnrichmentError,
  EnrichmentProviderRegistry,
  OwnershipContext,
} from "@ringee/platform";

export type DecryptedEnrichmentCredentials = {
  connection: EnrichmentConnection;
  apiKey: string;
  metadata: Record<string, unknown>;
};

@Injectable()
export class EnrichmentConnectionService {
  private readonly logger = new Logger(EnrichmentConnectionService.name);

  constructor(
    private readonly repo: EnrichmentConnectionRepository,
    private readonly crypto: CryptoService,
    private readonly registry: EnrichmentProviderRegistry,
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

  listVisible(ctx: OwnershipContext): Promise<EnrichmentConnection[]> {
    return this.repo.listVisibleTo({
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
    });
  }

  findById(id: string): Promise<EnrichmentConnection | null> {
    return this.repo.findById(id);
  }

  async findActive(
    ctx: OwnershipContext,
    provider: EnrichmentProviderType,
  ): Promise<EnrichmentConnection | null> {
    const { scope, organizationId } = this.resolveScope(ctx);
    return this.repo.findActive({
      provider,
      scope,
      userId: ctx.userId,
      organizationId,
    });
  }

  listActive(ctx: OwnershipContext): Promise<EnrichmentConnection[]> {
    return this.repo.listActiveForContext({
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
    });
  }

  /**
   * Validate the credentials against the provider, then encrypt and persist
   * the connection. Throws on invalid credentials before any DB write.
   */
  async create(
    ctx: OwnershipContext,
    provider: EnrichmentProviderType,
    input: { apiKey: string; metadata?: Record<string, unknown> },
  ): Promise<EnrichmentConnection> {
    const providerImpl = this.registry.get(provider);
    const account = await providerImpl.validateCredentials({
      apiKey: input.apiKey,
      accountId: "validate",
      connectionId: "validate",
      metadata: input.metadata,
    });

    const blob = JSON.stringify({
      apiKey: input.apiKey,
      metadata: input.metadata ?? {},
    });
    const accessTokenCiphertext = this.crypto.encrypt({ t: blob });
    const { scope, organizationId } = this.resolveScope(ctx);

    return this.repo.upsertConnection({
      ctx: { provider, scope, userId: ctx.userId, organizationId },
      externalAccountId: account.accountId,
      externalAccountName: account.accountName ?? null,
      accessTokenCiphertext,
      providerMetadata: account.metadata ?? null,
      capabilities: providerImpl.capabilities as unknown as Record<
        string,
        unknown
      >,
    });
  }

  async validateWithoutPersist(
    provider: EnrichmentProviderType,
    apiKey: string,
    metadata?: Record<string, unknown>,
  ): Promise<{
    accountId: string;
    accountName: string | null;
    metadata?: Record<string, unknown>;
  }> {
    const providerImpl = this.registry.get(provider);
    const account = await providerImpl.validateCredentials({
      apiKey,
      accountId: "validate",
      connectionId: "validate",
      metadata,
    });
    return account;
  }

  async decrypt(
    connection: EnrichmentConnection,
  ): Promise<DecryptedEnrichmentCredentials> {
    const payload = this.crypto.decrypt(connection.accessTokenCiphertext) as {
      t?: string;
    };
    if (!payload.t) {
      throw new BadRequestException("corrupt enrichment credentials");
    }
    const parsed = JSON.parse(payload.t) as {
      apiKey: string;
      metadata?: Record<string, unknown>;
    };
    if (!parsed.apiKey) {
      throw new BadRequestException("missing apiKey in enrichment credentials");
    }
    return {
      connection,
      apiKey: parsed.apiKey,
      metadata: parsed.metadata ?? {},
    };
  }

  async disconnect(
    ctx: OwnershipContext,
    id: string,
  ): Promise<EnrichmentConnection> {
    const conn = await this.requireConnection(id);
    this.assertAccess(ctx, conn);
    return this.repo.markStatus(id, "disconnected");
  }

  async forget(ctx: OwnershipContext, id: string): Promise<void> {
    const conn = await this.requireConnection(id);
    this.assertAccess(ctx, conn);
    await this.repo.remove(id);
  }

  async markStatus(
    id: string,
    status: EnrichmentConnectionStatus,
    errorCode?: string | null,
  ): Promise<EnrichmentConnection> {
    return this.repo.markStatus(id, status, errorCode ?? null);
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.repo.touchLastUsed(id);
  }

  /**
   * Maps a provider-side error to a connection-status mutation when the
   * error is terminal (bad credentials, quota exceeded). Returns true if
   * the connection was marked.
   */
  async reportProviderError(
    connection: EnrichmentConnection,
    err: unknown,
  ): Promise<boolean> {
    if (!(err instanceof EnrichmentError)) return false;
    if (err.code === "INVALID_CREDENTIALS" || err.code === "QUOTA_EXCEEDED") {
      await this.markStatus(connection.id, "error", err.code);
      this.logger.warn(
        `Enrichment connection ${connection.id} marked error: ${err.code} (${err.message})`,
      );
      return true;
    }
    return false;
  }

  private async requireConnection(id: string): Promise<EnrichmentConnection> {
    const c = await this.repo.findById(id);
    if (!c) throw new NotFoundException("Enrichment connection not found");
    return c;
  }

  private assertAccess(
    ctx: OwnershipContext,
    conn: EnrichmentConnection,
  ): void {
    if (conn.scope === "organization") {
      if (!ctx.organizationId || conn.organizationId !== ctx.organizationId) {
        throw new ForbiddenException("Cannot access this connection");
      }
      return;
    }
    if (conn.userId !== ctx.userId) {
      throw new ForbiddenException("Cannot access this connection");
    }
  }
}
