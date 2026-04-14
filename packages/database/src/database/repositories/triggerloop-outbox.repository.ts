import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

export type OutboxKind = "event" | "startWorkflow" | "cancelWorkflow";
export type OutboxStatus = "pending" | "sent" | "failed";

export interface TriggerLoopOutboxRecord {
  id: string;
  kind: OutboxKind;
  endpoint: string;
  payload: Prisma.JsonValue;
  status: OutboxStatus;
  attemptCount: number;
  lastError: string | null;
  nextAttemptAt: Date;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class TriggerLoopOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get delegate() {
    return (this.prisma as unknown as {
      triggerLoopOutboxEvent: {
        create: (args: unknown) => Promise<TriggerLoopOutboxRecord>;
        findMany: (args: unknown) => Promise<TriggerLoopOutboxRecord[]>;
        update: (args: unknown) => Promise<TriggerLoopOutboxRecord>;
        updateMany: (args: unknown) => Promise<{ count: number }>;
        count: (args: unknown) => Promise<number>;
      };
    }).triggerLoopOutboxEvent;
  }

  enqueue(input: {
    kind: OutboxKind;
    endpoint: string;
    payload: Prisma.InputJsonValue;
  }): Promise<TriggerLoopOutboxRecord> {
    return this.delegate.create({
      data: {
        kind: input.kind,
        endpoint: input.endpoint,
        payload: input.payload,
        status: "pending",
      },
    });
  }

  /**
   * Reserves up to `batchSize` rows due for retry. Advances nextAttemptAt
   * by a safety window so concurrent workers don't reclaim the same rows.
   */
  async claimDueBatch(
    now: Date,
    batchSize: number,
  ): Promise<TriggerLoopOutboxRecord[]> {
    const due = await this.delegate.findMany({
      where: { status: "pending", nextAttemptAt: { lte: now } },
      orderBy: { nextAttemptAt: "asc" },
      take: batchSize,
      select: { id: true },
    });

    if (due.length === 0) return [];

    const ids = (due as unknown as { id: string }[]).map((d) => d.id);
    await this.delegate.updateMany({
      where: { id: { in: ids } },
      data: {
        nextAttemptAt: new Date(now.getTime() + 60_000),
        attemptCount: { increment: 1 },
      },
    });

    return this.delegate.findMany({ where: { id: { in: ids } } });
  }

  markSent(id: string): Promise<TriggerLoopOutboxRecord> {
    return this.delegate.update({
      where: { id },
      data: { status: "sent", sentAt: new Date(), lastError: null },
    });
  }

  scheduleRetry(
    id: string,
    nextAttemptAt: Date,
    error: string,
  ): Promise<TriggerLoopOutboxRecord> {
    return this.delegate.update({
      where: { id },
      data: { status: "pending", nextAttemptAt, lastError: error },
    });
  }

  markFailed(id: string, error: string): Promise<TriggerLoopOutboxRecord> {
    return this.delegate.update({
      where: { id },
      data: { status: "failed", lastError: error },
    });
  }

  countByStatus(status: OutboxStatus): Promise<number> {
    return this.delegate.count({ where: { status } });
  }
}
