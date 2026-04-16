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
import { CryptoService, OwnershipContext } from "@ringee/platform";

export type DecryptedCrmCredentials = {
  connection: CrmConnection;
  accessToken: string;
  refreshToken: string | null;
};

@Injectable()
export class CrmConnectionService {
  private readonly logger = new Logger(CrmConnectionService.name);

  constructor(
    private readonly repo: CrmConnectionRepository,
    private readonly crypto: CryptoService,
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
