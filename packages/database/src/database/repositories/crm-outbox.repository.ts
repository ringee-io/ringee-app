import { Injectable } from "@nestjs/common";
import {
  CrmOutboxEvent,
  CrmOutboxStatus,
  CrmProviderType,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";

/**
 * How long a claimed event stays "leased" to the draining worker. If the worker
 * crashes or the drain activity is killed (the crmDrain workflow runs with an
 * 8-minute startToCloseTimeout and no retries) before the event reaches a
 * terminal state, the lease lapses and the next drain reclaims it — instead of
 * orphaning it in `in_progress` forever. Kept comfortably above the activity's
 * worst-case runtime so a drain that is still running never has its own
 * in-flight events stolen out from under it.
 */
const CLAIM_LEASE_MS = 10 * 60 * 1000;

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
    // Due = freshly `pending`, OR `in_progress` whose lease has already expired
    // (the worker that claimed them died/timed-out before completing). Reclaiming
    // the latter is what stops a crashed or killed drain from stranding events in
    // `in_progress` permanently — the previous query only ever looked at
    // `pending`, so any orphaned event was lost forever.
    const due = await this.prisma.crmOutboxEvent.findMany({
      where: {
        status: { in: ["pending", "in_progress"] },
        nextAttemptAt: { lte: now },
      },
      orderBy: { nextAttemptAt: "asc" },
      take: batchSize,
      select: { id: true },
    });
    if (due.length === 0) return [];
    const ids = due.map((d) => d.id);
    // Re-assert the same due-window in the claim so a concurrent drainer can't
    // double-claim: the update pushes `nextAttemptAt` a full lease into the
    // future, taking these rows out of the due window for everyone else.
    await this.prisma.crmOutboxEvent.updateMany({
      where: {
        id: { in: ids },
        status: { in: ["pending", "in_progress"] },
        nextAttemptAt: { lte: now },
      },
      data: {
        status: "in_progress",
        nextAttemptAt: new Date(now.getTime() + CLAIM_LEASE_MS),
      },
    });
    // Only hand back rows this call actually leased (status still in_progress),
    // never ones a racing drainer already advanced.
    return this.prisma.crmOutboxEvent.findMany({
      where: { id: { in: ids }, status: "in_progress" },
    });
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

  scheduleRetry(
    id: string,
    nextAttemptAt: Date,
    error: string,
  ): Promise<CrmOutboxEvent> {
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
