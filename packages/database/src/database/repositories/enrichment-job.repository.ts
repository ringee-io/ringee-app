import { Injectable } from "@nestjs/common";
import {
  EnrichmentJob,
  EnrichmentJobStatus,
  EnrichmentProviderType,
  EnrichmentQueryKind,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";

const MAX_ATTEMPTS = 10;
const BACKOFF_MIN_MS = 2_000;
const BACKOFF_MAX_MS = 5 * 60_000;

/**
 * Lease window for a claimed job. If the draining worker dies before the job
 * reaches a terminal state, the lease lapses after this and the next drain
 * reclaims it instead of leaving it stuck in `in_progress` forever. Kept well
 * above the drain activity's worst-case runtime so an in-flight drain is never
 * robbed of its own jobs.
 */
const CLAIM_LEASE_MS = 10 * 60 * 1000;

export type EnrichmentJobEnqueueInput = {
  connectionId: string;
  provider: EnrichmentProviderType;
  contactId?: string | null;
  userId: string;
  organizationId?: string | null;
  queryKind: EnrichmentQueryKind;
  queryHash: string;
  dedupeKey: string;
  idempotencyKey?: string | null;
  triggeredBy?: string | null;
  nextAttemptAt?: Date;
};

@Injectable()
export class EnrichmentJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(input: EnrichmentJobEnqueueInput): Promise<EnrichmentJob> {
    const existing = await this.prisma.enrichmentJob.findUnique({
      where: { dedupeKey: input.dedupeKey },
    });
    if (existing) return existing;

    return this.prisma.enrichmentJob.create({
      data: {
        connectionId: input.connectionId,
        provider: input.provider,
        contactId: input.contactId ?? null,
        userId: input.userId,
        organizationId: input.organizationId ?? null,
        queryKind: input.queryKind,
        queryHash: input.queryHash,
        dedupeKey: input.dedupeKey,
        idempotencyKey: input.idempotencyKey ?? null,
        triggeredBy: input.triggeredBy ?? null,
        nextAttemptAt: input.nextAttemptAt ?? new Date(),
        status: "pending",
      },
    });
  }

  /**
   * Insert a "skipped" job that points to an existing snapshot — used when
   * an idempotent re-enrichment is short-circuited.
   */
  async createSkipped(input: {
    connectionId: string;
    provider: EnrichmentProviderType;
    contactId?: string | null;
    userId: string;
    organizationId?: string | null;
    queryKind: EnrichmentQueryKind;
    queryHash: string;
    dedupeKey: string;
    triggeredBy?: string | null;
    resultSnapshot: unknown;
  }): Promise<EnrichmentJob> {
    return this.prisma.enrichmentJob.create({
      data: {
        connectionId: input.connectionId,
        provider: input.provider,
        contactId: input.contactId ?? null,
        userId: input.userId,
        organizationId: input.organizationId ?? null,
        queryKind: input.queryKind,
        queryHash: input.queryHash,
        dedupeKey: input.dedupeKey,
        triggeredBy: input.triggeredBy ?? null,
        status: "skipped",
        resultSnapshot:
          (input.resultSnapshot as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        processedAt: new Date(),
      },
    });
  }

  async claimDueBatch(now: Date, batchSize: number): Promise<EnrichmentJob[]> {
    // Due = freshly `pending`, OR `in_progress` whose lease has already expired
    // (the worker that claimed them died/timed-out before completing). Without
    // reclaiming the latter, a crashed drain strands jobs in `in_progress`
    // forever, since this query previously only looked at `pending`.
    const due = await this.prisma.enrichmentJob.findMany({
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
    await this.prisma.enrichmentJob.updateMany({
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
    return this.prisma.enrichmentJob.findMany({
      where: { id: { in: ids }, status: "in_progress" },
    });
  }

  findById(id: string): Promise<EnrichmentJob | null> {
    return this.prisma.enrichmentJob.findUnique({ where: { id } });
  }

  findByDedupeKey(dedupeKey: string): Promise<EnrichmentJob | null> {
    return this.prisma.enrichmentJob.findUnique({ where: { dedupeKey } });
  }

  /**
   * Find the most recent successful (done|not_found) job that matches the
   * given query within `ttlMs`. Used for idempotency / cache short-circuit.
   */
  async findRecentByQueryHash(
    connectionId: string,
    queryHash: string,
    ttlMs: number,
  ): Promise<EnrichmentJob | null> {
    const since = new Date(Date.now() - ttlMs);
    return this.prisma.enrichmentJob.findFirst({
      where: {
        connectionId,
        queryHash,
        status: { in: ["done", "not_found"] },
        processedAt: { gte: since },
      },
      orderBy: { processedAt: "desc" },
    });
  }

  markDone(
    id: string,
    data: {
      resultSnapshot: unknown;
      providerCredits?: number | null;
      costCredits?: number | null;
    },
  ): Promise<EnrichmentJob> {
    return this.prisma.enrichmentJob.update({
      where: { id },
      data: {
        status: "done",
        resultSnapshot:
          (data.resultSnapshot as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        providerCredits: data.providerCredits ?? null,
        costCredits: data.costCredits ?? null,
        processedAt: new Date(),
        attemptCount: { increment: 1 },
        lastError: null,
      },
    });
  }

  markNotFound(
    id: string,
    data: { resultSnapshot?: unknown },
  ): Promise<EnrichmentJob> {
    return this.prisma.enrichmentJob.update({
      where: { id },
      data: {
        status: "not_found",
        resultSnapshot:
          data.resultSnapshot !== undefined
            ? ((data.resultSnapshot as Prisma.InputJsonValue) ??
              Prisma.JsonNull)
            : undefined,
        processedAt: new Date(),
        attemptCount: { increment: 1 },
        lastError: null,
      },
    });
  }

  scheduleRetry(
    id: string,
    attemptCount: number,
    error: string,
  ): Promise<EnrichmentJob> {
    const backoff = Math.min(
      BACKOFF_MAX_MS,
      BACKOFF_MIN_MS * Math.pow(2, Math.max(0, attemptCount - 1)),
    );
    const jitter = Math.floor(Math.random() * 1_000);
    const nextAttemptAt = new Date(Date.now() + backoff + jitter);
    return this.prisma.enrichmentJob.update({
      where: { id },
      data: {
        status: "pending",
        nextAttemptAt,
        attemptCount: { increment: 1 },
        lastError: error,
      },
    });
  }

  markFailed(id: string, error: string): Promise<EnrichmentJob> {
    return this.prisma.enrichmentJob.update({
      where: { id },
      data: {
        status: "failed",
        attemptCount: { increment: 1 },
        lastError: error,
        processedAt: new Date(),
      },
    });
  }

  markRefunded(id: string): Promise<EnrichmentJob> {
    return this.prisma.enrichmentJob.update({
      where: { id },
      data: { refundedAt: new Date() },
    });
  }

  listByContact(contactId: string, limit = 25): Promise<EnrichmentJob[]> {
    return this.prisma.enrichmentJob.findMany({
      where: { contactId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  countByStatus(status: EnrichmentJobStatus): Promise<number> {
    return this.prisma.enrichmentJob.count({ where: { status } });
  }

  static get MAX_ATTEMPTS(): number {
    return MAX_ATTEMPTS;
  }
}
