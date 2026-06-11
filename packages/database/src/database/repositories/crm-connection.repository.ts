import { Injectable } from "@nestjs/common";
import {
  CrmConnection,
  CrmConnectionScope,
  CrmConnectionStatus,
  CrmProviderType,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";

export type CrmConnectionContext = {
  scope: CrmConnectionScope;
  userId: string;
  organizationId?: string | null;
  provider: CrmProviderType;
};

@Injectable()
export class CrmConnectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActive(ctx: CrmConnectionContext): Promise<CrmConnection | null> {
    return this.prisma.crmConnection.findFirst({
      where: {
        provider: ctx.provider,
        scope: ctx.scope,
        ...(ctx.scope === "organization"
          ? { organizationId: ctx.organizationId ?? undefined }
          : { userId: ctx.userId, organizationId: null }),
        status: "active",
      },
    });
  }

  findById(id: string): Promise<CrmConnection | null> {
    return this.prisma.crmConnection.findUnique({ where: { id } });
  }

  listForUser(userId: string): Promise<CrmConnection[]> {
    return this.prisma.crmConnection.findMany({
      where: { userId, scope: "personal", organizationId: null },
      orderBy: { createdAt: "desc" },
    });
  }

  listForOrganization(organizationId: string): Promise<CrmConnection[]> {
    return this.prisma.crmConnection.findMany({
      where: { organizationId, scope: "organization" },
      orderBy: { createdAt: "desc" },
    });
  }

  listVisibleTo(ctx: {
    userId: string;
    organizationId?: string | null;
  }): Promise<CrmConnection[]> {
    if (ctx.organizationId) {
      return this.listForOrganization(ctx.organizationId);
    }
    return this.listForUser(ctx.userId);
  }

  async upsertConnection(input: {
    ctx: CrmConnectionContext;
    externalAccountId: string;
    externalAccountName?: string | null;
    accessTokenCiphertext: string;
    refreshTokenCiphertext?: string | null;
    tokenExpiresAt?: Date | null;
    scopes?: string[];
    providerMetadata?: Record<string, unknown> | null;
    capabilities?: Record<string, unknown> | null;
  }): Promise<CrmConnection> {
    const {
      ctx,
      externalAccountId,
      externalAccountName,
      accessTokenCiphertext,
      refreshTokenCiphertext,
      tokenExpiresAt,
      scopes,
      providerMetadata,
      capabilities,
    } = input;

    const findWhere: Prisma.CrmConnectionWhereInput =
      ctx.scope === "organization"
        ? {
            scope: ctx.scope,
            organizationId: ctx.organizationId,
            provider: ctx.provider,
          }
        : {
            scope: ctx.scope,
            userId: ctx.userId,
            provider: ctx.provider,
            organizationId: null,
          };

    const existing = await this.prisma.crmConnection.findFirst({
      where: findWhere,
    });

    if (existing) {
      return this.prisma.crmConnection.update({
        where: { id: existing.id },
        data: {
          externalAccountId,
          externalAccountName: externalAccountName ?? null,
          accessTokenCiphertext,
          refreshTokenCiphertext: refreshTokenCiphertext ?? null,
          tokenExpiresAt: tokenExpiresAt ?? null,
          scopes: scopes ?? [],
          providerMetadata: (providerMetadata ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
          capabilities: (capabilities ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
          status: "active",
          lastErrorCode: null,
          lastErrorAt: null,
        },
      });
    }

    return this.prisma.crmConnection.create({
      data: {
        provider: ctx.provider,
        scope: ctx.scope,
        userId: ctx.userId,
        organizationId:
          ctx.scope === "organization" ? (ctx.organizationId ?? null) : null,
        externalAccountId,
        externalAccountName: externalAccountName ?? null,
        accessTokenCiphertext,
        refreshTokenCiphertext: refreshTokenCiphertext ?? null,
        tokenExpiresAt: tokenExpiresAt ?? null,
        scopes: scopes ?? [],
        providerMetadata: (providerMetadata ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        capabilities: (capabilities ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        status: "active",
      },
    });
  }

  updateTokens(
    id: string,
    data: {
      accessTokenCiphertext: string;
      refreshTokenCiphertext?: string | null;
      tokenExpiresAt?: Date | null;
    },
  ): Promise<CrmConnection> {
    return this.prisma.crmConnection.update({
      where: { id },
      data: {
        accessTokenCiphertext: data.accessTokenCiphertext,
        refreshTokenCiphertext: data.refreshTokenCiphertext ?? undefined,
        tokenExpiresAt: data.tokenExpiresAt ?? undefined,
        status: "active",
        lastErrorCode: null,
        lastErrorAt: null,
      },
    });
  }

  markStatus(
    id: string,
    status: CrmConnectionStatus,
    errorCode?: string | null,
  ): Promise<CrmConnection> {
    return this.prisma.crmConnection.update({
      where: { id },
      data: {
        status,
        lastErrorCode: errorCode ?? null,
        lastErrorAt: errorCode ? new Date() : null,
      },
    });
  }

  touchLastSync(id: string): Promise<CrmConnection> {
    return this.prisma.crmConnection.update({
      where: { id },
      data: { lastSyncAt: new Date() },
    });
  }

  listAllActive(): Promise<CrmConnection[]> {
    return this.prisma.crmConnection.findMany({
      where: { status: "active" },
      orderBy: { lastSyncAt: "asc" },
    });
  }

  /**
   * All active connections visible to a given ownership context, across
   * every provider. Used by outbound sync services so every connected CRM
   * (Attio, Odoo, …) receives the event, not only the first provider that
   * happened to be checked.
   */
  listActiveForContext(ctx: {
    userId: string;
    organizationId?: string | null;
  }): Promise<CrmConnection[]> {
    const where: Prisma.CrmConnectionWhereInput = ctx.organizationId
      ? {
          status: "active",
          scope: "organization",
          organizationId: ctx.organizationId,
        }
      : {
          status: "active",
          scope: "personal",
          userId: ctx.userId,
          organizationId: null,
        };
    return this.prisma.crmConnection.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });
  }

  remove(id: string): Promise<CrmConnection> {
    return this.prisma.crmConnection.delete({ where: { id } });
  }
}
