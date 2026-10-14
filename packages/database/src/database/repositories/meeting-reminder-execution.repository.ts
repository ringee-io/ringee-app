import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  MeetingReminderExecution,
  MeetingReminderExecutionStatus,
  Prisma,
} from "@prisma/client";
import type { OrganizationOwnershipContext } from "@ringee/platform";
import { PrismaService } from "../prisma.service";

const S = MeetingReminderExecutionStatus;

/** States a call has not left yet — still worth cancelling or watching. */
export const OPEN_REMINDER_EXECUTION_STATUSES: MeetingReminderExecutionStatus[] =
  [S.scheduled, S.claimed, S.placed];

/** States that end an execution. */
export const TERMINAL_REMINDER_EXECUTION_STATUSES: MeetingReminderExecutionStatus[] =
  [
    S.confirmed,
    S.declined,
    S.no_answer,
    S.completed,
    S.skipped,
    S.failed,
    S.cancelled,
  ];

/** What the rail and the meeting screens show next to an execution. */
export type MeetingReminderExecutionWithMeeting = MeetingReminderExecution & {
  meeting: {
    id: string;
    title: string | null;
    scheduledAt: Date;
    contact: { id: string; name: string | null; phoneNumber: string } | null;
  };
  /** The telephony call it placed, for the call detail. */
  agentCall: { callId: string | null } | null;
};

const WITH_MEETING = {
  meeting: {
    select: {
      id: true,
      title: true,
      scheduledAt: true,
      contact: { select: { id: true, name: true, phoneNumber: true } },
    },
  },
  agentCall: { select: { callId: true } },
} satisfies Prisma.MeetingReminderExecutionInclude;

/**
 * Durable reminder calls (AGENT-019). Every transition is conditional on the
 * state it leaves, so two workers — or a worker and a user cancelling the
 * meeting — can never both act on one execution.
 */
@Injectable()
export class MeetingReminderExecutionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Plans executions. The idempotency key makes replanning the same meeting,
   * version and offset a no-op instead of a second call.
   */
  async createMany(
    rows: Prisma.MeetingReminderExecutionCreateManyInput[],
  ): Promise<number> {
    if (rows.length === 0) return 0;
    const { count } = await this.prisma.meetingReminderExecution.createMany({
      data: rows,
      skipDuplicates: true,
    });
    return count;
  }

  /**
   * Withdraws planned work. Claimed work must pass authorizeDial against the
   * current meeting and policy before it may start a provider request.
   */
  async cancelScheduled(
    where: {
      meetingId?: string;
      policyId?: string;
      agentId?: string;
      /** Keep executions planned for this meeting version. */
      exceptScheduleVersion?: number;
    },
    reason: string,
  ): Promise<number> {
    const { count } = await this.prisma.meetingReminderExecution.updateMany({
      where: {
        status: S.scheduled,
        ...(where.meetingId ? { meetingId: where.meetingId } : {}),
        ...(where.policyId ? { policyId: where.policyId } : {}),
        ...(where.agentId ? { agentId: where.agentId } : {}),
        ...(where.exceptScheduleVersion !== undefined
          ? { scheduleVersion: { not: where.exceptScheduleVersion } }
          : {}),
      },
      data: { status: S.cancelled, reason, finishedAt: new Date() },
    });
    return count;
  }

  /**
   * Claims what is due, plus anything whose worker died holding it.
   *
   * One statement with `FOR UPDATE SKIP LOCKED`, so concurrent ticks split the
   * work instead of sharing it. A reclaimed row keeps its `dialTries`: the
   * service checks whether the earlier try already placed a leg before it
   * dials again.
   */
  claimDue(
    now: Date,
    leaseUntil: Date,
    limit: number,
  ): Promise<MeetingReminderExecution[]> {
    return this.prisma.$queryRaw<MeetingReminderExecution[]>`
      UPDATE "MeetingReminderExecution"
      SET "status" = 'claimed'::"MeetingReminderExecutionStatus",
          "claimToken" = ${randomUUID()}::uuid,
          "leaseExpiresAt" = (${leaseUntil}::timestamptz AT TIME ZONE 'UTC'),
          "updatedAt" = (now() AT TIME ZONE 'UTC')
      WHERE "id" IN (
        SELECT "id"
        FROM "MeetingReminderExecution"
        WHERE ("status" = 'scheduled'
                AND "fireAt" <= (${now}::timestamptz AT TIME ZONE 'UTC'))
           OR ("status" = 'claimed'
                AND "leaseExpiresAt" < (${now}::timestamptz AT TIME ZONE 'UTC'))
        ORDER BY "fireAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `;
  }

  /** Claims one planned execution — the "call now" path. */
  async claimScheduled(
    id: string,
    leaseUntil: Date,
  ): Promise<MeetingReminderExecution | null> {
    const [row] =
      await this.prisma.meetingReminderExecution.updateManyAndReturn({
        where: { id, status: S.scheduled },
        data: {
          status: S.claimed,
          claimToken: randomUUID(),
          leaseExpiresAt: leaseUntil,
        },
      });
    return row ?? null;
  }

  /** Reserve one stable dial key. A reclaimed reservation keeps the same key. */
  async beginDial(
    id: string,
    claimToken: string,
    now: Date,
    leaseUntil: Date,
  ): Promise<MeetingReminderExecution | null> {
    const where = {
      id,
      status: S.claimed,
      claimToken,
      leaseExpiresAt: { gt: now },
    };
    const [row] =
      await this.prisma.meetingReminderExecution.updateManyAndReturn({
        where: { ...where, dialReservedAt: null },
        data: {
          dialTries: { increment: 1 },
          dialReservedAt: now,
          leaseExpiresAt: leaseUntil,
        },
      });
    return row ?? this.prisma.meetingReminderExecution.findFirst({ where });
  }

  /**
   * The dial's commit point. Locks serialize this check with meeting changes
   * and policy updates; no provider I/O is performed in the transaction.
   */
  async authorizeDial(
    execution: MeetingReminderExecution,
    now: Date,
    earliestMeetingAt: Date,
    leaseUntil: Date,
  ): Promise<boolean> {
    if (!execution.claimToken) return false;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Meeting"
        WHERE "id" = ${execution.meetingId}::uuid
          AND "organizationId" = ${execution.organizationId}::uuid FOR UPDATE`;
      if (execution.policyId) {
        await tx.$queryRaw`SELECT "id" FROM "MeetingReminderPolicy"
          WHERE "id" = ${execution.policyId}::uuid FOR UPDATE`;
      }
      const { count } = await tx.meetingReminderExecution.updateMany({
        where: {
          id: execution.id,
          status: S.claimed,
          claimToken: execution.claimToken,
          leaseExpiresAt: { gt: now },
          agent: {
            status: "active",
            deletedAt: null,
            organizationId: execution.organizationId,
          },
          meeting: {
            organizationId: execution.organizationId,
            scheduleVersion: execution.scheduleVersion,
            status: { in: ["scheduled", "rescheduled"] },
            attendanceStatus: "pending",
            scheduledAt: { gte: earliestMeetingAt },
          },
          ...(execution.trigger === "policy"
            ? {
                policy: {
                  is: { enabled: true, version: execution.policyVersion ?? -1 },
                },
              }
            : {}),
        },
        data: { leaseExpiresAt: leaseUntil },
      });
      return count === 1;
    });
  }

  async markPlaced(
    id: string,
    agentCallId: string,
    claimToken: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.meetingReminderExecution.updateMany({
      where: { id, status: S.claimed, claimToken },
      data: {
        status: S.placed,
        agentCallId,
        leaseExpiresAt: null,
        claimToken: null,
      },
    });
    return count === 1;
  }

  /** Ends an execution, if it is still in one of `from`. */
  async finish(
    id: string,
    status: MeetingReminderExecutionStatus,
    from: MeetingReminderExecutionStatus[],
    data?: { reason?: string; lastError?: string; agentCallId?: string },
    claimToken?: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.meetingReminderExecution.updateMany({
      where: {
        id,
        status: { in: from },
        ...(from.includes(S.claimed)
          ? { claimToken: claimToken ?? "00000000-0000-0000-0000-000000000000" }
          : {}),
      },
      data: {
        status,
        finishedAt: new Date(),
        leaseExpiresAt: null,
        ...(data?.reason ? { reason: data.reason } : {}),
        ...(data?.lastError
          ? { lastError: data.lastError.slice(0, 2000) }
          : {}),
        ...(data?.agentCallId ? { agentCallId: data.agentCallId } : {}),
      },
    });
    return count === 1;
  }

  /** Hands a claimed execution back for later — a deferral, not a failure. */
  async defer(
    id: string,
    fireAt: Date,
    reason: string,
    claimToken: string,
    unplaced = false,
  ): Promise<boolean> {
    const { count } = await this.prisma.meetingReminderExecution.updateMany({
      where: { id, status: S.claimed, claimToken },
      data: {
        status: S.scheduled,
        fireAt,
        leaseExpiresAt: null,
        claimToken: null,
        reason,
        ...(unplaced ? { dialReservedAt: null } : {}),
      },
    });
    return count === 1;
  }

  /** The conversation's own ending, applied to the execution that placed it. */
  async finishByAgentCall(
    agentCallId: string,
    status: MeetingReminderExecutionStatus,
    from: MeetingReminderExecutionStatus[],
  ): Promise<boolean> {
    const { count } = await this.prisma.meetingReminderExecution.updateMany({
      where: { agentCallId, status: { in: from } },
      data: { status, finishedAt: new Date(), leaseExpiresAt: null },
    });
    return count === 1;
  }

  findById(id: string): Promise<MeetingReminderExecution | null> {
    return this.prisma.meetingReminderExecution.findUnique({ where: { id } });
  }

  findByAgentCallId(
    agentCallId: string,
  ): Promise<MeetingReminderExecution | null> {
    return this.prisma.meetingReminderExecution.findUnique({
      where: { agentCallId },
    });
  }

  findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<MeetingReminderExecution | null> {
    return this.prisma.meetingReminderExecution.findUnique({
      where: { idempotencyKey },
    });
  }

  /** Placed calls that never reported back, for the worker to settle. */
  listPlacedBefore(
    before: Date,
    take = 50,
  ): Promise<MeetingReminderExecution[]> {
    return this.prisma.meetingReminderExecution.findMany({
      where: { status: S.placed, updatedAt: { lt: before } },
      orderBy: { updatedAt: "asc" },
      take,
    });
  }

  /**
   * Whether another call about this meeting is being dialed or is live, so a
   * second one never overlaps it. A claim older than `activeSince` is a dead
   * worker's, not a live call.
   */
  async hasActiveForMeeting(
    meetingId: string,
    excludeId: string | null,
    activeSince: Date,
  ): Promise<boolean> {
    const count = await this.prisma.meetingReminderExecution.count({
      where: {
        meetingId,
        status: { in: [S.claimed, S.placed] },
        updatedAt: { gte: activeSince },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    return count > 0;
  }

  /**
   * Which meeting versions and offsets already have a call that was not
   * withdrawn — so replanning after a policy change never calls a lead twice
   * for the same reminder.
   */
  listUsedOffsets(meetingIds: string[]): Promise<
    Array<{
      meetingId: string;
      scheduleVersion: number;
      offsetMinutes: number | null;
    }>
  > {
    if (meetingIds.length === 0) return Promise.resolve([]);
    return this.prisma.meetingReminderExecution.findMany({
      where: {
        meetingId: { in: meetingIds },
        trigger: "policy",
        status: { notIn: [S.cancelled] },
      },
      select: { meetingId: true, scheduleVersion: true, offsetMinutes: true },
    });
  }

  countForMeetingVersion(
    meetingId: string,
    scheduleVersion: number,
    trigger: string,
  ): Promise<number> {
    return this.prisma.meetingReminderExecution.count({
      where: { meetingId, scheduleVersion, trigger },
    });
  }

  /**
   * The newest execution of one trigger for a meeting version that has not
   * finished, whatever its age: one put off because the lead was busy, one
   * being dialed, or one placed that has not reported back.
   */
  findOpenForMeetingVersion(
    meetingId: string,
    scheduleVersion: number,
    trigger: string,
  ): Promise<MeetingReminderExecution | null> {
    return this.prisma.meetingReminderExecution.findFirst({
      where: {
        meetingId,
        scheduleVersion,
        trigger,
        status: { in: OPEN_REMINDER_EXECUTION_STATUSES },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  listUpcomingForOwner(
    ctx: OrganizationOwnershipContext,
    options: { from: Date; take: number; agentId?: string },
  ): Promise<MeetingReminderExecutionWithMeeting[]> {
    return this.prisma.meetingReminderExecution.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: S.scheduled,
        fireAt: { gte: options.from },
        ...(options.agentId ? { agentId: options.agentId } : {}),
      },
      include: WITH_MEETING,
      orderBy: { fireAt: "asc" },
      take: options.take,
    });
  }

  countUpcomingForOwner(
    ctx: OrganizationOwnershipContext,
    options: { from: Date; agentId?: string },
  ): Promise<number> {
    return this.prisma.meetingReminderExecution.count({
      where: {
        organizationId: ctx.organizationId,
        status: S.scheduled,
        fireAt: { gte: options.from },
        ...(options.agentId ? { agentId: options.agentId } : {}),
      },
    });
  }

  /** Recently finished executions, for the rail's activity list. */
  listFinishedForOwner(
    ctx: OrganizationOwnershipContext,
    options: { since: Date; take: number },
  ): Promise<MeetingReminderExecutionWithMeeting[]> {
    return this.prisma.meetingReminderExecution.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: {
          in: [S.confirmed, S.declined, S.no_answer, S.completed, S.failed],
        },
        finishedAt: { gte: options.since },
      },
      include: WITH_MEETING,
      orderBy: { finishedAt: "desc" },
      take: options.take,
    });
  }

  /** The executions of one meeting, newest first, for its detail. */
  listForMeeting(
    ctx: OrganizationOwnershipContext,
    meetingId: string,
  ): Promise<MeetingReminderExecution[]> {
    return this.prisma.meetingReminderExecution.findMany({
      where: { organizationId: ctx.organizationId, meetingId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }
}
