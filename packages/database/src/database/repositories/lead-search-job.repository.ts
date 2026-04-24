import { Injectable } from "@nestjs/common";
import {
  EnrichmentProviderType,
  LeadSearchJob,
  LeadSearchJobStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class LeadSearchJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: {
    connectionId: string;
    provider: EnrichmentProviderType;
    userId: string;
    organizationId?: string | null;
    filters: Record<string, unknown>;
    filtersHash: string;
    page: number;
    perPage: number;
  }): Promise<LeadSearchJob> {
    return this.prisma.leadSearchJob.create({
      data: {
        connectionId: input.connectionId,
        provider: input.provider,
        userId: input.userId,
        organizationId: input.organizationId ?? null,
        filters: input.filters as Prisma.InputJsonValue,
        filtersHash: input.filtersHash,
        page: input.page,
        perPage: input.perPage,
        status: "pending",
      },
    });
  }

  findById(id: string): Promise<LeadSearchJob | null> {
    return this.prisma.leadSearchJob.findUnique({ where: { id } });
  }

  markInProgress(id: string): Promise<LeadSearchJob> {
    return this.prisma.leadSearchJob.update({
      where: { id },
      data: { status: "in_progress" },
    });
  }

  markDone(
    id: string,
    data: {
      totalResults: number;
      resultSnapshot: unknown;
      providerCredits?: number | null;
      costCredits?: number | null;
    },
  ): Promise<LeadSearchJob> {
    return this.prisma.leadSearchJob.update({
      where: { id },
      data: {
        status: "done",
        totalResults: data.totalResults,
        resultSnapshot:
          (data.resultSnapshot as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        providerCredits: data.providerCredits ?? null,
        costCredits: data.costCredits ?? null,
        completedAt: new Date(),
      },
    });
  }

  updateSnapshot(id: string, snapshot: unknown): Promise<LeadSearchJob> {
    return this.prisma.leadSearchJob.update({
      where: { id },
      data: {
        resultSnapshot: snapshot as Prisma.InputJsonValue,
      },
    });
  }

  markFailed(id: string, error: string): Promise<LeadSearchJob> {
    return this.prisma.leadSearchJob.update({
      where: { id },
      data: {
        status: "failed",
        lastError: error,
        completedAt: new Date(),
      },
    });
  }

  listForUser(userId: string, limit = 50): Promise<LeadSearchJob[]> {
    return this.prisma.leadSearchJob.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  findRecentByHash(input: {
    userId: string;
    organizationId?: string | null;
    provider: EnrichmentProviderType;
    filtersHash: string;
    page: number;
    perPage: number;
    olderThan?: Date;
  }): Promise<LeadSearchJob | null> {
    return this.prisma.leadSearchJob.findFirst({
      where: {
        provider: input.provider,
        filtersHash: input.filtersHash,
        page: input.page,
        perPage: input.perPage,
        status: "done",
        ...(input.organizationId
          ? { organizationId: input.organizationId }
          : { userId: input.userId, organizationId: null }),
        ...(input.olderThan ? { completedAt: { gte: input.olderThan } } : {}),
      },
      orderBy: { completedAt: "desc" },
    });
  }

  countByStatus(status: LeadSearchJobStatus): Promise<number> {
    return this.prisma.leadSearchJob.count({ where: { status } });
  }
}
