import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  MeetingEmailDelivery,
  MeetingEmailDeliveryStatus,
  Prisma,
} from "@prisma/client";
import type { OrganizationOwnershipContext } from "@ringee/platform";
import { PrismaService } from "../prisma.service";

const D = MeetingEmailDeliveryStatus;

/** Deliveries a person has to act on before they can go out. */
export const ATTENTION_EMAIL_DELIVERY_STATUSES: MeetingEmailDeliveryStatus[] = [
  D.needs_email,
  D.needs_member,
  D.failed,
];

export type MeetingEmailDeliveryWithMeeting = MeetingEmailDelivery & {
  meeting: {
    id: string;
    title: string | null;
    scheduledAt: Date;
    contact: { id: string; name: string | null } | null;
  };
};

/**
 * Durable meeting emails (AGENT-020). Created inside the transaction that
 * records the attendance, so an answer and its email exist together or not at
 * all; delivered by the worker under a lease.
 */
@Injectable()
export class MeetingEmailDeliveryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Claims pending deliveries, and any whose worker died mid-send. A sending
   * row past its lease may already have reached the provider: the service
   * retries it under the same idempotency key, never as a new email.
   */
  claimDue(
    now: Date,
    leaseUntil: Date,
    limit: number,
    organizationIds: string[] | null = null,
  ): Promise<MeetingEmailDelivery[]> {
    return this.prisma.$queryRaw<MeetingEmailDelivery[]>`
      UPDATE "MeetingEmailDelivery"
      SET "status" = 'sending'::"MeetingEmailDeliveryStatus",
          "claimToken" = ${randomUUID()}::uuid,
          "leaseExpiresAt" = (${leaseUntil}::timestamptz AT TIME ZONE 'UTC'),
          "attempts" = "attempts" + 1,
          "updatedAt" = (now() AT TIME ZONE 'UTC')
      WHERE "id" IN (
        SELECT "id"
        FROM "MeetingEmailDelivery"
        WHERE ("status" = 'pending'
           OR ("status" = 'sending'
                AND "leaseExpiresAt" < (${now}::timestamptz AT TIME ZONE 'UTC')))
          ${organizationIds === null ? Prisma.empty : Prisma.sql`AND "organizationId"::text = ANY(${organizationIds}::text[])`}
        ORDER BY "createdAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `;
  }

  /** Freeze the first provider request while holding the current meeting version. */
  async prepareSend(
    delivery: MeetingEmailDelivery,
    expectedMeetingVersion: number,
    now: Date,
    payload: Prisma.InputJsonObject,
  ): Promise<MeetingEmailDelivery | null> {
    if (!delivery.claimToken) return null;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Meeting"
        WHERE "id" = ${delivery.meetingId}::uuid
          AND "organizationId" = ${delivery.organizationId}::uuid FOR UPDATE`;
      const where: Prisma.MeetingEmailDeliveryWhereInput = {
        id: delivery.id,
        status: D.sending,
        claimToken: delivery.claimToken,
        leaseExpiresAt: { gt: now },
        meeting: {
          organizationId: delivery.organizationId,
          scheduleVersion: expectedMeetingVersion,
          attendanceScheduleVersion: delivery.scheduleVersion,
          attendanceStatus:
            delivery.kind === "attendance_confirmed" ? "confirmed" : "declined",
          status: { in: ["scheduled", "rescheduled"] },
        },
      };
      const [row] = await tx.meetingEmailDelivery.updateManyAndReturn({
        where,
        data: {
          leaseExpiresAt: delivery.leaseExpiresAt,
          // Retries must carry precisely the same provider request.
          ...(delivery.firstAttemptAt
            ? {}
            : { firstAttemptAt: now, sendPayload: payload }),
        },
      });
      return row ?? null;
    });
  }

  async markSent(
    id: string,
    data: {
      providerEmailId: string | null;
      messageId: string | null;
      toAddresses: string[];
      ccAddresses: string[];
      replyTo: string | null;
      subject: string;
      inReplyTo: string | null;
    },
    claimToken: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.meetingEmailDelivery.updateMany({
      where: { id, status: D.sending, claimToken },
      data: {
        ...data,
        status: D.sent,
        sentAt: new Date(),
        leaseExpiresAt: null,
        lastError: null,
      },
    });
    return count === 1;
  }

  /** Moves a delivery the worker holds to a non-sent state. */
  async release(
    id: string,
    status: MeetingEmailDeliveryStatus,
    lastError: string | null,
    claimToken: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.meetingEmailDelivery.updateMany({
      where: { id, status: D.sending, claimToken },
      data: {
        status,
        leaseExpiresAt: null,
        lastError: lastError ? lastError.slice(0, 2000) : null,
      },
    });
    return count === 1;
  }

  async setMessageId(id: string, messageId: string): Promise<void> {
    await this.prisma.meetingEmailDelivery.updateMany({
      where: { id, messageId: null },
      data: { messageId },
    });
  }

  /** Sent recently without a Message-ID yet: the provider reports it later. */
  listMissingMessageId(
    since: Date,
    take = 25,
  ): Promise<MeetingEmailDelivery[]> {
    return this.prisma.meetingEmailDelivery.findMany({
      where: {
        status: D.sent,
        messageId: null,
        providerEmailId: { not: null },
        sentAt: { gte: since },
      },
      orderBy: { sentAt: "asc" },
      take,
    });
  }

  /** The last email about a meeting, which the next one threads under. */
  findLatestSentForMeeting(
    meetingId: string,
    excludeId: string,
  ): Promise<MeetingEmailDelivery | null> {
    return this.prisma.meetingEmailDelivery.findFirst({
      where: { meetingId, status: D.sent, id: { not: excludeId } },
      orderBy: { sentAt: "desc" },
    });
  }

  findByIdForOwner(
    ctx: OrganizationOwnershipContext,
    id: string,
  ): Promise<MeetingEmailDelivery | null> {
    return this.prisma.meetingEmailDelivery.findFirst({
      where: { organizationId: ctx.organizationId, id },
    });
  }

  /**
   * Puts waiting deliveries of a meeting back in the queue — the lead's email
   * was completed, or a member was reassigned.
   */
  async requeueForMeeting(
    meetingId: string,
    from: MeetingEmailDeliveryStatus[],
  ): Promise<number> {
    const { count } = await this.prisma.meetingEmailDelivery.updateMany({
      where: { meetingId, status: { in: from } },
      // A person fixed what it was waiting on: it gets a fresh set of tries.
      data: { status: D.pending, lastError: null, attempts: 0 },
    });
    return count;
  }

  /**
   * Withdraws what has not gone out for a meeting that moved or was cancelled.
   * A send already in flight is left to finish: it is about to be on its way,
   * and the next email about the meeting threads after it.
   */
  async cancelUnsentForMeeting(meetingId: string): Promise<number> {
    const { count } = await this.prisma.meetingEmailDelivery.updateMany({
      where: {
        meetingId,
        status: { in: [D.pending, D.needs_email, D.needs_member, D.failed] },
      },
      data: { status: D.cancelled, leaseExpiresAt: null },
    });
    return count;
  }

  listAttentionForOwner(
    ctx: OrganizationOwnershipContext,
    options: { since: Date; take: number },
  ): Promise<MeetingEmailDeliveryWithMeeting[]> {
    return this.prisma.meetingEmailDelivery.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { in: ATTENTION_EMAIL_DELIVERY_STATUSES },
        updatedAt: { gte: options.since },
      },
      include: {
        meeting: {
          select: {
            id: true,
            title: true,
            scheduledAt: true,
            contact: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: options.take,
    });
  }

  listForMeeting(
    ctx: OrganizationOwnershipContext,
    meetingId: string,
  ): Promise<MeetingEmailDelivery[]> {
    return this.prisma.meetingEmailDelivery.findMany({
      where: { organizationId: ctx.organizationId, meetingId },
      orderBy: { createdAt: "desc" },
    });
  }
}
