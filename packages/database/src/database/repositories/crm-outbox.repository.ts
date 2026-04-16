import { Injectable } from "@nestjs/common";
import { CrmOutboxEvent, CrmOutboxStatus, CrmProviderType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class CrmOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(input: {
    connectionId: string | null;
    provider: CrmProviderType;
    kind: string;
    subjectId?: string | null;
    payload: Record<string, unknown>;
    dedupeKey: string;
    nextAttemptAt?: Date;
  }): Promise<CrmOutboxEvent> {
    const existing = await this.prisma.crmOutboxEvent.findUnique({
      where: { dedupeKey: input.dedupeKey },
    });
    if (existing) {
      if (existing.status === "sent") return existing;
      return this.prisma.crmOutboxEvent.update({
        where: { id: existing.id },
        data: {
          payload: input.payload as Prisma.InputJsonValue,
          nextAttemptAt: input.nextAttemptAt ?? new Date(),
          status: "pending",
          lastError: null,
        },
      });
    }
    return this.prisma.crmOutboxEvent.create({
      data: {
        connectionId: input.connectionId,
        provider: input.provider,
        kind: input.kind,
        subjectId: input.subjectId ?? null,
        payload: input.payload as Prisma.InputJsonValue,
        dedupeKey: input.dedupeKey,
        nextAttemptAt: input.nextAttemptAt ?? new Date(),
        status: "pending",
      },
    });
  }

  async claimDueBatch(now: Date, batchSize: number): Promise<CrmOutboxEvent[]> {
    const due = await this.prisma.crmOutboxEvent.findMany({
      where: { status: "pending", nextAttemptAt: { lte: now } },
      orderBy: { nextAttemptAt: "asc" },
      take: batchSize,
      select: { id: true },
    });
    if (due.length === 0) return [];
    const ids = due.map((d) => d.id);
    await this.prisma.crmOutboxEvent.updateMany({
      where: { id: { in: ids }, status: "pending" },
      data: {
        status: "in_progress",
        nextAttemptAt: new Date(now.getTime() + 120_000),
      },
    });
    return this.prisma.crmOutboxEvent.findMany({ where: { id: { in: ids } } });
  }

  markSent(id: string): Promise<CrmOutboxEvent> {
    return this.prisma.crmOutboxEvent.update({
      where: { id },
      data: {
        status: "sent",
        processedAt: new Date(),
        lastError: null,
      },
    });
  }

  scheduleRetry(id: string, nextAttemptAt: Date, error: string): Promise<CrmOutboxEvent> {
    return this.prisma.crmOutboxEvent.update({
      where: { id },
      data: {
        status: "pending",
        nextAttemptAt,
        attemptCount: { increment: 1 },
        lastError: error,
      },
    });
  }

  markFailed(id: string, error: string): Promise<CrmOutboxEvent> {
    return this.prisma.crmOutboxEvent.update({
      where: { id },
      data: {
        status: "failed",
        attemptCount: { increment: 1 },
        lastError: error,
      },
    });
  }

  countByStatus(status: CrmOutboxStatus): Promise<number> {
    return this.prisma.crmOutboxEvent.count({ where: { status } });
  }
}
