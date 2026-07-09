import { Injectable } from "@nestjs/common";
import {
  CustomIntegrationDelivery,
  CustomIntegrationDeliveryStatus,
  CustomIntegrationEventType,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";

/**
 * Lease window for a claimed delivery. If the draining worker dies before the
 * delivery reaches a terminal state, the lease lapses after this and the next
 * drain reclaims it instead of leaving it stuck in `sending` forever. Kept well
 * above the drain activity's worst-case runtime so an in-flight drain is never
 * robbed of its own deliveries.
 */
const CLAIM_LEASE_MS = 10 * 60 * 1000;

@Injectable()
export class CustomIntegrationDeliveryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(input: {
    integrationId: string;
    eventType: CustomIntegrationEventType;
    subjectId: string | null;
    destinationUrl: string;
    payload: Record<string, unknown>;
    dedupeKey: string;
  }): Promise<CustomIntegrationDelivery> {
    const existing = await this.prisma.customIntegrationDelivery.findUnique({
      where: { dedupeKey: input.dedupeKey },
    });
    if (existing) {
      if (existing.status === "sent") return existing;
      return this.prisma.customIntegrationDelivery.update({
        where: { id: existing.id },
        data: {
          destinationUrl: input.destinationUrl,
          payload: input.payload as Prisma.InputJsonValue,
          status: "pending",
          nextAttemptAt: new Date(),
          lastError: null,
        },
      });
    }
    return this.prisma.customIntegrationDelivery.create({
      data: {
        integrationId: input.integrationId,
        eventType: input.eventType,
        subjectId: input.subjectId,
        destinationUrl: input.destinationUrl,
        payload: input.payload as Prisma.InputJsonValue,
        dedupeKey: input.dedupeKey,
        status: "pending",
        nextAttemptAt: new Date(),
      },
    });
  }

  async claimDueBatch(
    now: Date,
    batchSize: number,
  ): Promise<CustomIntegrationDelivery[]> {
    // Due = freshly `pending`, OR `sending` whose lease has already expired (the
    // worker that claimed them died/timed-out before completing). Without
    // reclaiming the latter, a crashed drain strands deliveries in `sending`
    // forever, since this query previously only looked at `pending`.
    const due = await this.prisma.customIntegrationDelivery.findMany({
      where: {
        status: { in: ["pending", "sending"] },
        nextAttemptAt: { lte: now },
      },
      orderBy: { nextAttemptAt: "asc" },
      take: batchSize,
      select: { id: true },
    });
    if (due.length === 0) return [];
    const ids = due.map((d) => d.id);
    await this.prisma.customIntegrationDelivery.updateMany({
      where: {
        id: { in: ids },
        status: { in: ["pending", "sending"] },
        nextAttemptAt: { lte: now },
      },
      data: {
        status: "sending",
        nextAttemptAt: new Date(now.getTime() + CLAIM_LEASE_MS),
      },
    });
    return this.prisma.customIntegrationDelivery.findMany({
      where: { id: { in: ids }, status: "sending" },
    });
  }

  markSent(id: string, signature: string): Promise<CustomIntegrationDelivery> {
    return this.prisma.customIntegrationDelivery.update({
      where: { id },
      data: {
        status: "sent",
        sentAt: new Date(),
        signature,
        lastError: null,
      },
    });
  }

  scheduleRetry(
    id: string,
    nextAttemptAt: Date,
    error: string,
  ): Promise<CustomIntegrationDelivery> {
    return this.prisma.customIntegrationDelivery.update({
      where: { id },
      data: {
        status: "pending",
        nextAttemptAt,
        attemptCount: { increment: 1 },
        lastError: error,
      },
    });
  }

  markFailed(id: string, error: string): Promise<CustomIntegrationDelivery> {
    return this.prisma.customIntegrationDelivery.update({
      where: { id },
      data: {
        status: "failed",
        attemptCount: { increment: 1 },
        lastError: error,
      },
    });
  }

  list(
    integrationId: string,
    options: {
      limit?: number;
      cursor?: string;
      status?: CustomIntegrationDeliveryStatus;
    } = {},
  ): Promise<CustomIntegrationDelivery[]> {
    const limit = Math.min(options.limit ?? 50, 200);
    return this.prisma.customIntegrationDelivery.findMany({
      where: {
        integrationId,
        ...(options.status ? { status: options.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });
  }
}
