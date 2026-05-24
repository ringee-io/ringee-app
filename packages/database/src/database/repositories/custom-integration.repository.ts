import { Injectable } from "@nestjs/common";
import {
  CustomIntegration,
  CustomIntegrationEventType,
  CustomIntegrationStatus,
  Prisma,
} from "@prisma/client";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";
import { PrismaService } from "../prisma.service";

@Injectable()
export class CustomIntegrationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    ctx: OwnershipContext,
    data: {
      name: string;
      apiKeyPrefix: string;
      apiKeyHash: string;
      webhookSigningSecretCt: string;
    },
  ): Promise<CustomIntegration> {
    return this.prisma.customIntegration.create({
      data: {
        ...data,
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
      },
    });
  }

  async list(ctx: OwnershipContext): Promise<CustomIntegration[]> {
    return this.prisma.customIntegration.findMany({
      where: buildOwnershipFilter(ctx),
      orderBy: { createdAt: "desc" },
    });
  }

  findById(id: string): Promise<CustomIntegration | null> {
    return this.prisma.customIntegration.findUnique({ where: { id } });
  }

  findByApiKeyHash(apiKeyHash: string): Promise<CustomIntegration | null> {
    return this.prisma.customIntegration.findUnique({ where: { apiKeyHash } });
  }

  /** Active integrations for a workspace subscribed to the given event. */
  async findActiveSubscribed(
    ctx: OwnershipContext,
    eventType: CustomIntegrationEventType,
  ): Promise<CustomIntegration[]> {
    return this.prisma.customIntegration.findMany({
      where: {
        ...buildOwnershipFilter(ctx),
        status: "active",
        outboundUrl: { not: null },
        subscribedEvents: { has: eventType },
      },
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      outboundUrl?: string | null;
      subscribedEvents?: CustomIntegrationEventType[];
      status?: CustomIntegrationStatus;
    },
  ): Promise<CustomIntegration> {
    return this.prisma.customIntegration.update({
      where: { id },
      data,
    });
  }

  async rotateApiKey(
    id: string,
    apiKeyPrefix: string,
    apiKeyHash: string,
  ): Promise<CustomIntegration> {
    return this.prisma.customIntegration.update({
      where: { id },
      data: { apiKeyPrefix, apiKeyHash, apiKeyLastUsedAt: null },
    });
  }

  async rotateSigningSecret(
    id: string,
    webhookSigningSecretCt: string,
  ): Promise<CustomIntegration> {
    return this.prisma.customIntegration.update({
      where: { id },
      data: { webhookSigningSecretCt },
    });
  }

  touchLastUsed(id: string): Promise<unknown> {
    return this.prisma.customIntegration.update({
      where: { id },
      data: { apiKeyLastUsedAt: new Date() },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.customIntegration.delete({ where: { id } });
  }
}
