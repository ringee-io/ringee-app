import { Injectable } from "@nestjs/common";
import {
  CrmConnectionScope,
  EnrichmentConnection,
  EnrichmentConnectionStatus,
  EnrichmentProviderType,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";

export type EnrichmentConnectionContext = {
  scope: CrmConnectionScope;
  userId: string;
  organizationId?: string | null;
  provider: EnrichmentProviderType;
};

@Injectable()
export class EnrichmentConnectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActive(
    ctx: EnrichmentConnectionContext,
  ): Promise<EnrichmentConnection | null> {
    return this.prisma.enrichmentConnection.findFirst({
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

  findById(id: string): Promise<EnrichmentConnection | null> {
    return this.prisma.enrichmentConnection.findUnique({ where: { id } });
  }

  listForUser(userId: string): Promise<EnrichmentConnection[]> {
    return this.prisma.enrichmentConnection.findMany({
      where: { userId, scope: "personal", organizationId: null },
      orderBy: { createdAt: "desc" },
    });
  }

  listForOrganization(organizationId: string): Promise<EnrichmentConnection[]> {
    return this.prisma.enrichmentConnection.findMany({
      where: { organizationId, scope: "organization" },
      orderBy: { createdAt: "desc" },
    });
  }

  listVisibleTo(ctx: {
    userId: string;
    organizationId?: string | null;
  }): Promise<EnrichmentConnection[]> {
    if (ctx.organizationId) return this.listForOrganization(ctx.organizationId);
    return this.listForUser(ctx.userId);
  }

  listActiveForContext(ctx: {
    userId: string;
    organizationId?: string | null;
  }): Promise<EnrichmentConnection[]> {
    const where: Prisma.EnrichmentConnectionWhereInput = ctx.organizationId
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
    return this.prisma.enrichmentConnection.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });
  }

  async upsertConnection(input: {
    ctx: EnrichmentConnectionContext;
    externalAccountId: string;
    externalAccountName?: string | null;
    accessTokenCiphertext: string;
    providerMetadata?: Record<string, unknown> | null;
    capabilities?: Record<string, unknown> | null;
  }): Promise<EnrichmentConnection> {
    const { ctx } = input;
    const findWhere: Prisma.EnrichmentConnectionWhereInput =
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

    const existing = await this.prisma.enrichmentConnection.findFirst({
      where: findWhere,
    });

    if (existing) {
      return this.prisma.enrichmentConnection.update({
        where: { id: existing.id },
        data: {
          externalAccountId: input.externalAccountId,
          externalAccountName: input.externalAccountName ?? null,
          accessTokenCiphertext: input.accessTokenCiphertext,
          providerMetadata: (input.providerMetadata ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
          capabilities: (input.capabilities ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
          status: "active",
          lastErrorCode: null,
          lastErrorAt: null,
        },
      });
    }

    return this.prisma.enrichmentConnection.create({
      data: {
        provider: ctx.provider,
        scope: ctx.scope,
        userId: ctx.userId,
        organizationId:
          ctx.scope === "organization" ? (ctx.organizationId ?? null) : null,
        externalAccountId: input.externalAccountId,
        externalAccountName: input.externalAccountName ?? null,
        accessTokenCiphertext: input.accessTokenCiphertext,
        providerMetadata: (input.providerMetadata ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        capabilities: (input.capabilities ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        status: "active",
      },
    });
  }

  markStatus(
    id: string,
    status: EnrichmentConnectionStatus,
    errorCode?: string | null,
  ): Promise<EnrichmentConnection> {
    return this.prisma.enrichmentConnection.update({
      where: { id },
      data: {
        status,
        lastErrorCode: errorCode ?? null,
        lastErrorAt: errorCode ? new Date() : null,
      },
    });
  }

  touchLastUsed(id: string): Promise<EnrichmentConnection> {
    return this.prisma.enrichmentConnection.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }

  remove(id: string): Promise<EnrichmentConnection> {
    return this.prisma.enrichmentConnection.delete({ where: { id } });
  }
}
