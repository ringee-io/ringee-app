import {
  lockFollowUp,
  applyFollowUpPlan,
} from "./pending-action-follow-up.persistence";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import {
  Prisma,
  Contact,
  Meeting,
  MeetingAttendanceStatus,
  MeetingEmailDeliveryStatus,
  MeetingEmailKind,
  MeetingExternalSyncStatus,
  MeetingReminderExecutionStatus,
  MeetingStatus,
} from "@prisma/client";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";
import { lockWorkspace } from "./calendar.repository";
import {
  meetingActor,
  lockMeetingRequest,
  recordMeetingAction,
  resolveMeetingRequest,
} from "./meeting-action.persistence";

interface MeetingCreateData {
  contactId: string;
  callId?: string;
  title?: string;
  scheduledAt: Date;
  duration?: number;
  location?: string;
  notes?: string;
  /** The Ringee calendar this booking belongs to. */
  calendarId: string;
  /** Voice-agent call to claim atomically with a protected booking. */
  agentCallId?: string;
  actorAgentId?: string;
  /** The member the meeting is with (CAL-003). */
  responsibleUserId?: string | null;
  /** The address chosen for the lead at booking time. */
  leadEmail?: string | null;
}

/** An answer to "will you attend?", as the confirmation tool records it. */
export interface MeetingAttendanceInput {
  actorAgentId?: string;
  meetingId: string;
  /** The schedule version the answer was given for. */
  expectedScheduleVersion: number;
  status: Extract<MeetingAttendanceStatus, "confirmed" | "declined">;
  /** The agent call whose tool recorded it — the evidence. */
  agentCallId: string;
  note?: string | null;
  /** An address the lead dictated and confirmed on the call. */
  leadEmail?: string | null;
  /** The email this answer owes, created in the same transaction. */
  email: { kind: MeetingEmailKind; idempotencyKey: string } | null;
  /** The reminder execution the answer closes, in the same transaction. */
  executionId?: string | null;
}

export type MeetingAttendanceOutcome =
  | { result: "recorded"; meeting: Meeting; repeated: boolean }
  | { result: "not_found" | "cancelled" | "stale" | "past" };

/** A move an agent makes for the person on a call (AGENT-021). */
export interface MeetingMoveInput {
  actorAgentId?: string;
  meetingId: string;
  /** The schedule version the agent was handed. */
  expectedScheduleVersion: number;
  scheduledAt: Date;
  /** The email the move owes, created in the same transaction. */
  email: { idempotencyKey: string; agentCallId: string } | null;
}

export type MeetingMoveOutcome =
  | {
      result: "moved";
      meeting: Meeting & { contact: Contact | null };
      /** The time it moved from; unknown on a repeat of the same move. */
      previousScheduledAt: Date | null;
      /** This exact move had already been made — nothing was written. */
      repeated: boolean;
      replacement?: boolean;
      changedSinceAction?: boolean;
    }
  | {
      result: "not_found" | "cancelled" | "stale" | "unavailable";
    }
  /** The time it already has: nothing moved, nothing is owed. */
  | { result: "unchanged" };

/** A moved meeting's answer was for another time (CAL-003). */
const ATTENDANCE_RESET = {
  attendanceStatus: MeetingAttendanceStatus.pending,
  attendanceUpdatedAt: null,
  attendanceAgentCallId: null,
  attendanceScheduleVersion: null,
  attendanceNote: null,
} satisfies Prisma.MeetingUpdateInput;

/**
 * A moved meeting's external event still shows the old time until it is
 * moved too: never `synced` meanwhile, so a move that fails — or never runs —
 * stays visible and retryable (CAL-002).
 */
const EXTERNAL_EVENT_STALE = {
  externalSyncStatus: MeetingExternalSyncStatus.pending,
} satisfies Prisma.MeetingUpdateInput;

/** Emails that have not gone out, withdrawn when their meeting moves. */
const UNSENT_EMAIL_STATUSES: MeetingEmailDeliveryStatus[] = [
  MeetingEmailDeliveryStatus.pending,
  MeetingEmailDeliveryStatus.needs_email,
  MeetingEmailDeliveryStatus.needs_member,
  MeetingEmailDeliveryStatus.failed,
];

const ACTIVE_MEETING_STATUSES: MeetingStatus[] = [
  MeetingStatus.scheduled,
  MeetingStatus.rescheduled,
];

/**
 * Which meetings occupy a calendar.
 *
 * A booking only ever consumes the capacity of the calendar it was made on, so
 * every availability query is scoped to one calendar. Rows written before
 * calendars existed carry no `calendarId`; they were the workspace's single
 * calendar, so they still count against the global one — and against nothing
 * else.
 */
function calendarSql(calendarId: string, isDefault: boolean): Prisma.Sql {
  return isDefault
    ? Prisma.sql`AND ("calendarId" = ${calendarId}::uuid OR "calendarId" IS NULL)`
    : Prisma.sql`AND "calendarId" = ${calendarId}::uuid`;
}

/** The calendar a capacity check applies to. */
export interface MeetingCalendarScope {
  calendarId: string;
  /** The workspace's global calendar also owns pre-calendar meeting rows. */
  isDefault: boolean;
  expectedCalendarUpdatedAt?: Date;
}

function ownershipSql(ctx: OwnershipContext): {
  userFilter: Prisma.Sql;
  organizationFilter: Prisma.Sql;
} {
  const owner = buildOwnershipFilter(ctx);
  return {
    userFilter: owner.userId
      ? Prisma.sql`AND "userId" = ${owner.userId}::uuid`
      : Prisma.empty,
    organizationFilter:
      owner.organizationId === null
        ? Prisma.sql`AND "organizationId" IS NULL`
        : owner.organizationId
          ? Prisma.sql`AND "organizationId" = ${owner.organizationId}::uuid`
          : Prisma.empty,
  };
}

@Injectable()
export class MeetingRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ringee meetings that occupy any part of the requested window.
   *
   * The end of a meeting is derived from its stored duration, so this uses a
   * parameterized SQL query rather than approximating the overlap with only
   * `scheduledAt`. The ownership predicate still comes from the canonical
   * workspace filter: organization calendars see organization meetings, while
   * personal calendars see only personal rows.
   * Prisma binds dates as timestamptz, but scheduledAt stores UTC without a
   * zone; convert parameters explicitly so the session zone cannot shift them.
   */
  async findBusySlots(
    ctx: OwnershipContext,
    scope: MeetingCalendarScope,
    start: Date,
    end: Date,
    /** A meeting being moved, which does not occupy its own new time. */
    excludeMeetingId?: string,
  ): Promise<Array<{ start: Date; end: Date }>> {
    const { userFilter, organizationFilter } = ownershipSql(ctx);
    const calendarFilter = calendarSql(scope.calendarId, scope.isDefault);
    const excludeFilter = excludeMeetingId
      ? Prisma.sql`AND "id" <> ${excludeMeetingId}::uuid`
      : Prisma.empty;

    return this.prisma.$queryRaw<Array<{ start: Date; end: Date }>>`
      SELECT
        "scheduledAt" AS "start",
        "scheduledAt" + ("duration" * INTERVAL '1 minute') AS "end"
      FROM "Meeting"
      WHERE "status" IN ('scheduled', 'rescheduled')
        AND "scheduledAt" < (${end}::timestamptz AT TIME ZONE 'UTC')
        AND "scheduledAt" + ("duration" * INTERVAL '1 minute') > (${start}::timestamptz AT TIME ZONE 'UTC')
        ${userFilter}
        ${organizationFilter}
        ${calendarFilter}
        ${excludeFilter}
    `;
  }

  async create(
    ctx: OwnershipContext,
    data: MeetingCreateData,
  ): Promise<Meeting> {
    return this.prisma.meeting.create({
      data: this.createData(ctx, data),
      include: {
        contact: true,
      },
    });
  }

  /**
   * Re-checks the requested Ringee slot and creates the meeting as one guarded
   * database operation. A transaction-scoped workspace row lock serializes agent
   * bookings in the same workspace across API instances. Capacity and the
   * voice-agent call marker are both checked while that lock is held, because
   * the earlier tool lookup may already be stale or concurrently retried by
   * the time the caller confirms a time.
   */
  async createIfAvailable(
    ctx: OwnershipContext,
    data: MeetingCreateData,
    scope: MeetingCalendarScope,
    availabilityRuleId: string | null,
  ): Promise<Meeting | null> {
    const duration = data.duration ?? 30;
    const end = new Date(data.scheduledAt.getTime() + duration * 60_000);
    const { userFilter, organizationFilter } = ownershipSql(ctx);

    return this.prisma.$transaction(async (tx) => {
      await lockWorkspace(tx, ctx);

      if (data.agentCallId) {
        const agentCalls = await tx.$queryRaw<
          Array<{ meetingId: string | null }>
        >`
          SELECT "meetingId"
          FROM "AiVoiceAgentCall"
          WHERE "id" = ${data.agentCallId}::uuid
            ${userFilter}
            ${organizationFilter}
          FOR UPDATE
        `;
        // The row is both the authorization boundary and the idempotency
        // marker. Missing means this booking cannot safely be attributed;
        // populated means another retry already won.
        if (agentCalls.length !== 1 || agentCalls[0]!.meetingId) return null;
      }

      const actor =
        data.agentCallId && data.actorAgentId
          ? await meetingActor(tx, ctx, {
              agentCallId: data.agentCallId,
              agentId: data.actorAgentId,
            })
          : null;
      if (
        data.actorAgentId &&
        (!actor ||
          actor.participant ||
          actor.call.contactId !== data.contactId ||
          actor.call.calendarId !== data.calendarId ||
          actor.call.callId !== data.callId)
      )
        return null;

      const execution = data.agentCallId
        ? await tx.callbackTask.findUnique({
            where: { agentCallId: data.agentCallId },
            include: { followUp: true },
          })
        : null;
      let objective =
        execution?.followUp?.sourceType === "human_call_outcome"
          ? execution.followUp
          : null;
      if (objective) {
        await tx.$queryRaw`SELECT "id" FROM "Call" WHERE "id" = ${objective.sourceId}::uuid FOR UPDATE`;
        objective = await lockFollowUp(tx, objective.id);
        const source = objective
          ? await tx.call.findFirst({
              where: {
                id: objective.sourceId,
                organizationId: ctx.organizationId,
                userId: objective.responsibleUserId,
                contactId: data.contactId,
                outcomeRevision: objective.sourceRevision,
              },
            })
          : null;
        if (
          !objective ||
          !source ||
          !execution?.dispatchCommittedAt ||
          execution.organizationId !== ctx.organizationId ||
          execution.contactId !== data.contactId ||
          execution.sourceRevision !== objective.sourceRevision ||
          objective.objectiveType !== "book_meeting" ||
          objective.calendarId !== data.calendarId ||
          ["resolved", "closed"].includes(objective.state)
        )
          return null;
        const placed = await tx.aiVoiceAgentCall.findFirst({
          where: {
            id: data.agentCallId,
            callId: data.callId,
            agentId: objective.agentId!,
            organizationId: ctx.organizationId,
            userId: objective.configuredByUserId,
            contactId: data.contactId,
            calendarId: objective.calendarId,
          },
        });
        if (!placed) return null;
      }

      if (
        !(await this.hasRoom(tx, ctx, scope, availabilityRuleId, {
          start: data.scheduledAt,
          end,
        }))
      ) {
        return null;
      }

      const meeting = await tx.meeting.create({
        data: this.createData(ctx, { ...data, duration }),
        include: { contact: true },
      });
      if (data.agentCallId) {
        await tx.aiVoiceAgentCall.update({
          where: { id: data.agentCallId },
          data: { meetingId: meeting.id, outcome: "meeting_booked" },
        });
      }
      const action = actor
        ? await recordMeetingAction(tx, {
            key: `booking:${actor.call.id}`,
            meeting,
            actor,
            kind: "booked",
            receipt: "booked",
            followUpId: objective?.id,
            callbackId: execution?.id,
            evidence: { sourceRevision: objective?.sourceRevision ?? null },
          })
        : null;
      if (objective && execution) {
        await tx.pendingActionFollowUp.update({
          where: { id: objective.id },
          data: {
            meetingId: meeting.id,
            meetingScheduledAt: meeting.scheduledAt,
          },
        });
        const evidence = {
          kind: "stored_authorized_booking",
          actionId: action?.id ?? null,
          meetingId: meeting.id,
          agentCallId: data.agentCallId!,
          callbackId: execution.id,
          sourceRevision: objective.sourceRevision,
          calendarId: meeting.calendarId,
          scheduledAt: meeting.scheduledAt.toISOString(),
        };
        await applyFollowUpPlan(
          tx,
          objective,
          {
            state: "resolved",
            reason: "appointment_booked",
            nextAction: null,
            nextActionAt: null,
            evidence,
          },
          {
            key: `booking:${meeting.id}`,
            kind: "objective_resolved",
            evidence,
          },
          new Date(),
        );
      }
      return meeting;
    });
  }

  /**
   * Whether a calendar still has room for a meeting at `window`, read inside
   * the caller's transaction while it holds the workspace lock — the check a
   * booking and a move share, so they can never both take the last place.
   * `excludeMeetingId` is a meeting being moved, which must not count against
   * its own new time.
   */
  private async hasRoom(
    tx: Prisma.TransactionClient,
    ctx: OwnershipContext,
    scope: MeetingCalendarScope,
    availabilityRuleId: string | null,
    window: { start: Date; end: Date; excludeMeetingId?: string },
  ): Promise<boolean> {
    const { userFilter, organizationFilter } = ownershipSql(ctx);
    const ownershipFilter = buildOwnershipFilter(ctx);
    const calendarFilter = calendarSql(scope.calendarId, scope.isDefault);

    if (
      scope.expectedCalendarUpdatedAt &&
      !(await tx.calendar.count({
        where: {
          id: scope.calendarId,
          ...ownershipFilter,
          updatedAt: scope.expectedCalendarUpdatedAt,
          archivedAt: null,
        },
      }))
    )
      return false;

    let capacity: number | null;
    if (availabilityRuleId) {
      const currentRule = await tx.calendarAvailabilityRule.findFirst({
        where: {
          id: availabilityRuleId,
          calendarId: scope.calendarId,
          ...ownershipFilter,
        },
        select: { capacity: true },
      });
      // Availability settings are replaced, not mutated. A missing id means
      // the slot snapshot was based on a schedule version that is now stale —
      // or belonged to a different calendar than the one being booked.
      if (!currentRule) return false;
      capacity = currentRule.capacity;
    } else {
      // A null marker means getBookableSlots used the default capacity-one
      // schedule. It stays valid only while this calendar has no configured
      // rules.
      const configuredRuleCount = await tx.calendarAvailabilityRule.count({
        where: { calendarId: scope.calendarId, ...ownershipFilter },
      });
      if (configuredRuleCount !== 0) return false;
      capacity = 1;
    }

    // Only this calendar's bookings consume this calendar's capacity, so two
    // calendars stay independent and two agents that share one do not.
    const [{ count = 0 } = {}] = await tx.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count"
      FROM "Meeting"
      WHERE "status" IN ('scheduled', 'rescheduled')
        AND "scheduledAt" < (${window.end}::timestamptz AT TIME ZONE 'UTC')
        AND "scheduledAt" + ("duration" * INTERVAL '1 minute') > (${window.start}::timestamptz AT TIME ZONE 'UTC')
        ${
          window.excludeMeetingId
            ? Prisma.sql`AND "id" <> ${window.excludeMeetingId}::uuid`
            : Prisma.empty
        }
        ${userFilter}
        ${organizationFilter}
        ${calendarFilter}
    `;
    return capacity === null || count < capacity;
  }

  /**
   * Moves a meeting to a time its calendar still has room for, as one guarded
   * operation — the move an agent makes for the person on a call (AGENT-021).
   *
   * Serialized with bookings by the workspace lock, and with every other
   * change to the meeting by its row lock. The version must still be the one
   * the agent was handed (`stale` otherwise) — except for a repeat of this
   * same move, which finds the meeting already there one version on and
   * writes nothing. The time it already has is no move at all, and a start
   * that passed while the locks were awaited is no longer offered. The move
   * is a new schedule version (CAL-003); every email still waiting about the
   * old time is withdrawn, the email the move owes is created with it, under
   * its own key, and an external event is marked as not yet following it
   * (CAL-002) until it is moved too.
   */
  async rescheduleIfAvailable(
    ctx: OwnershipContext,
    input: MeetingMoveInput,
    scope: MeetingCalendarScope,
    availabilityRuleId: string | null,
  ): Promise<MeetingMoveOutcome> {
    const { userFilter, organizationFilter } = ownershipSql(ctx);
    return this.prisma.$transaction(async (tx) => {
      await lockWorkspace(tx, ctx);
      const [row] = await tx.$queryRaw<
        Array<{
          status: MeetingStatus;
          scheduledAt: Date;
          scheduleVersion: number;
          duration: number;
          externalEventId: string | null;
        }>
      >`
        SELECT "status", "scheduledAt", "scheduleVersion", "duration",
               "externalEventId"
        FROM "Meeting"
        WHERE "id" = ${input.meetingId}::uuid
          ${userFilter}
          ${organizationFilter}
        FOR UPDATE
      `;
      if (!row) return { result: "not_found" as const };
      const original = await tx.meeting.findUniqueOrThrow({
        where: { id: input.meetingId },
        include: { contact: true },
      });
      const actor =
        input.actorAgentId && input.email
          ? await meetingActor(tx, ctx, {
              agentCallId: input.email.agentCallId,
              agentId: input.actorAgentId,
            })
          : null;
      if (input.actorAgentId && !actor) return { result: "not_found" as const };
      const requestId = actor?.participant?.handoffId;
      const key = requestId ? `reschedule:${requestId}` : null;
      const prior = key
        ? await tx.meetingAutomationAction.findUnique({
            where: { actionKey: key },
          })
        : null;
      if (prior && prior.organizationId === ctx.organizationId) {
        const meeting = await tx.meeting.findUniqueOrThrow({
          where: { id: prior.meetingId },
          include: { contact: true },
        });
        return {
          result: "moved" as const,
          meeting,
          previousScheduledAt: prior.previousScheduledAt,
          repeated: true,
          replacement: prior.kind === "replaced",
          changedSinceAction:
            meeting.scheduleVersion !== prior.scheduleVersion ||
            meeting.scheduledAt.getTime() !== prior.scheduledAt.getTime(),
        };
      }
      if (row.scheduleVersion !== input.expectedScheduleVersion)
        return { result: "stale" as const };
      const request = actor
        ? await lockMeetingRequest(
            tx,
            original,
            actor,
            input.expectedScheduleVersion,
          )
        : null;
      if (actor && !request) return { result: "stale" as const };
      const previousScheduledAt = new Date(row.scheduledAt);
      const replacement =
        previousScheduledAt.getTime() <= Date.now() ||
        row.status === "cancelled";
      if (!ACTIVE_MEETING_STATUSES.includes(row.status) && !replacement)
        return { result: "cancelled" as const };
      if (replacement && !request?.objective)
        return { result: "cancelled" as const };
      if (request) {
        const offered = request.handoff.offeredSlots as Array<{
          start: string;
        }> | null;
        if (
          request.handoff.offeredAgentCallId !== actor!.call.id ||
          !offered?.some(
            (slot) =>
              new Date(slot.start).getTime() === input.scheduledAt.getTime(),
          )
        )
          return { result: "unavailable" as const };
      }
      if (previousScheduledAt.getTime() === input.scheduledAt.getTime())
        return { result: "unchanged" as const };
      if (input.scheduledAt.getTime() <= Date.now())
        return { result: "unavailable" as const };
      if (original.calendarId && original.calendarId !== scope.calendarId)
        return { result: "not_found" as const };
      const end = new Date(input.scheduledAt.getTime() + row.duration * 60_000);
      if (
        !(await this.hasRoom(tx, ctx, scope, availabilityRuleId, {
          start: input.scheduledAt,
          end,
          excludeMeetingId: input.meetingId,
        }))
      ) {
        return { result: "unavailable" as const };
      }

      const meeting = replacement
        ? await tx.meeting.create({
            data: {
              ...this.createData(
                {
                  userId: original.userId,
                  organizationId: original.organizationId,
                },
                {
                  contactId: original.contactId,
                  callId: actor!.call.callId!,
                  calendarId: scope.calendarId,
                  responsibleUserId:
                    original.responsibleUserId ?? original.userId,
                  leadEmail: original.leadEmail,
                  scheduledAt: input.scheduledAt,
                  duration: original.duration,
                  title: original.title ?? undefined,
                  location: original.externalEventId
                    ? undefined
                    : (original.location ?? undefined),
                },
              ),
              replacesMeetingId: original.id,
            },
            include: { contact: true },
          })
        : await tx.meeting.update({
            where: { id: input.meetingId },
            data: {
              scheduledAt: input.scheduledAt,
              scheduleVersion: { increment: 1 },
              ...ATTENDANCE_RESET,
              ...(row.externalEventId ? EXTERNAL_EVENT_STALE : {}),
            },
            include: { contact: true },
          });
      await tx.meetingReminderExecution.updateMany({
        where: {
          meetingId: original.id,
          status: { in: ["scheduled", "claimed"] },
          dispatchCommittedAt: null,
        },
        data: {
          status: "cancelled",
          reason: "meeting_changed",
          leaseExpiresAt: null,
          claimToken: null,
        },
      });
      // What was waiting to go out was about the old time.
      await tx.meetingEmailDelivery.updateMany({
        where: {
          meetingId: input.meetingId,
          status: { in: UNSENT_EMAIL_STATUSES },
        },
        data: {
          status: MeetingEmailDeliveryStatus.cancelled,
          leaseExpiresAt: null,
        },
      });
      if (input.email && meeting.organizationId && !actor) {
        await tx.meetingEmailDelivery.createMany({
          data: [
            {
              userId: meeting.userId,
              organizationId: meeting.organizationId,
              meetingId: meeting.id,
              kind: MeetingEmailKind.rescheduled,
              scheduleVersion: meeting.scheduleVersion,
              idempotencyKey: input.email.idempotencyKey,
              agentCallId: input.email.agentCallId,
              previousScheduledAt,
            },
          ],
          skipDuplicates: true,
        });
      }
      if (actor && request && key) {
        const action = await recordMeetingAction(tx, {
          key,
          meeting,
          actor,
          kind: replacement ? "replaced" : "rescheduled",
          receipt: replacement ? "replaced" : "rescheduled",
          previousScheduledAt,
          handoffId: request.handoff.id,
          followUpId: request.objective?.id,
          callbackId: request.callback?.id,
          language: request.handoff.language,
          evidence: {
            originalMeetingId: original.id,
            expectedScheduleVersion: input.expectedScheduleVersion,
          },
        });
        await resolveMeetingRequest(tx, request, action);
      }
      return {
        result: "moved" as const,
        meeting,
        previousScheduledAt,
        repeated: false,
        replacement,
      };
    });
  }

  private createData(
    ctx: OwnershipContext,
    data: MeetingCreateData,
  ): Prisma.MeetingCreateInput {
    return {
      scheduledAt: data.scheduledAt,
      duration: data.duration ?? 30,
      title: data.title,
      location: data.location,
      notes: data.notes,
      user: { connect: { id: ctx.userId } },
      organization: ctx.organizationId
        ? { connect: { id: ctx.organizationId } }
        : undefined,
      contact: { connect: { id: data.contactId } },
      call: data.callId ? { connect: { id: data.callId } } : undefined,
      calendar: { connect: { id: data.calendarId } },
      responsibleUser: data.responsibleUserId
        ? { connect: { id: data.responsibleUserId } }
        : undefined,
      leadEmail: data.leadEmail ?? undefined,
    };
  }

  /**
   * Records whether the lead will attend, and the email that answer owes, as
   * one transaction (AGENT-017).
   *
   * The meeting row is locked first, so a reschedule or cancellation running
   * at the same moment is serialized with it: an answer given for a version
   * that has since moved is refused as `stale`, never written over the new
   * time. Repeating the same answer on the same call changes nothing and
   * creates no second email — the delivery key is the same.
   */
  async recordAttendance(
    ctx: OwnershipContext,
    input: MeetingAttendanceInput,
  ): Promise<MeetingAttendanceOutcome> {
    const { userFilter, organizationFilter } = ownershipSql(ctx);
    return this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<
        Array<{
          status: MeetingStatus;
          scheduledAt: Date;
          scheduleVersion: number;
          attendanceStatus: MeetingAttendanceStatus;
          attendanceAgentCallId: string | null;
        }>
      >`
        SELECT "status", "scheduledAt", "scheduleVersion",
               "attendanceStatus", "attendanceAgentCallId"
        FROM "Meeting"
        WHERE "id" = ${input.meetingId}::uuid
          ${userFilter}
          ${organizationFilter}
        FOR UPDATE
      `;
      if (!row) return { result: "not_found" as const };
      if (!ACTIVE_MEETING_STATUSES.includes(row.status)) {
        return { result: "cancelled" as const };
      }
      if (row.scheduleVersion !== input.expectedScheduleVersion) {
        return { result: "stale" as const };
      }
      if (new Date(row.scheduledAt).getTime() <= Date.now()) {
        return { result: "past" as const };
      }

      const actor = input.actorAgentId
        ? await meetingActor(tx, ctx, {
            agentCallId: input.agentCallId,
            agentId: input.actorAgentId,
          })
        : null;
      if (input.actorAgentId) {
        const execution = await tx.meetingReminderExecution.findFirst({
          where: {
            id: input.executionId ?? "00000000-0000-0000-0000-000000000000",
            agentCallId: input.agentCallId,
            meetingId: input.meetingId,
            scheduleVersion: input.expectedScheduleVersion,
            organizationId: ctx.organizationId!,
          },
        });
        if (!actor || actor.participant?.role === "handoff" || !execution)
          return { result: "not_found" as const };
      }

      const repeated =
        row.attendanceStatus === input.status &&
        row.attendanceAgentCallId === input.agentCallId;

      const meeting = await tx.meeting.update({
        where: { id: input.meetingId },
        data: {
          attendanceStatus: input.status,
          attendanceUpdatedAt: new Date(),
          attendanceAgentCallId: input.agentCallId,
          attendanceScheduleVersion: row.scheduleVersion,
          attendanceNote: input.note?.trim() || null,
          ...(input.leadEmail ? { leadEmail: input.leadEmail } : {}),
        },
      });

      if (input.email && meeting.organizationId && !actor) {
        await tx.meetingEmailDelivery.createMany({
          data: [
            {
              userId: meeting.userId,
              organizationId: meeting.organizationId,
              meetingId: meeting.id,
              kind: input.email.kind,
              scheduleVersion: row.scheduleVersion,
              idempotencyKey: input.email.idempotencyKey,
            },
          ],
          skipDuplicates: true,
        });
        if (input.leadEmail) {
          await tx.meetingEmailDelivery.updateMany({
            where: {
              idempotencyKey: input.email.idempotencyKey,
              organizationId: meeting.organizationId,
              status: "needs_email",
              firstAttemptAt: null,
            },
            data: { status: "pending", lastError: null, attempts: 0 },
          });
        }
      }

      if (input.executionId) {
        await tx.meetingReminderExecution.updateMany({
          where: {
            id: input.executionId,
            status: {
              in: [
                MeetingReminderExecutionStatus.claimed,
                MeetingReminderExecutionStatus.placed,
              ],
            },
          },
          data: {
            status:
              input.status === MeetingAttendanceStatus.confirmed
                ? MeetingReminderExecutionStatus.confirmed
                : MeetingReminderExecutionStatus.declined,
            finishedAt: new Date(),
            leaseExpiresAt: null,
          },
        });
      }

      if (actor) {
        await recordMeetingAction(tx, {
          key: `attendance:${meeting.id}:v${row.scheduleVersion}:${input.status}`,
          meeting,
          actor,
          kind:
            input.status === "confirmed"
              ? "attendance_confirmed"
              : "attendance_declined",
          ...(input.status === "confirmed"
            ? { receipt: MeetingEmailKind.attendance_confirmed }
            : {}),
          evidence: {
            attendance: input.status,
            attendanceScheduleVersion: row.scheduleVersion,
          },
        });
        await tx.aiVoiceAgentCall.update({
          where: { id: actor.call.id },
          data: {
            outcome:
              input.status === "confirmed" ? "confirmed" : "cannot_attend",
          },
        });
      }

      return { result: "recorded" as const, meeting, repeated };
    });
  }

  /** A final answer about the bound appointment, never inferred from analysis. */
  async recordAgentDecision(
    ctx: OwnershipContext,
    input: {
      meetingId: string;
      expectedScheduleVersion: number;
      agentCallId: string;
      actorAgentId: string;
      cancel: boolean;
      continueRescheduling: boolean;
      response: string;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Meeting" WHERE "id" = ${input.meetingId}::uuid
        AND "organizationId" = ${ctx.organizationId}::uuid FOR UPDATE`;
      const meeting = await tx.meeting.findFirst({
        where: { id: input.meetingId, ...buildOwnershipFilter(ctx) },
      });
      const actor = await meetingActor(tx, ctx, {
        agentCallId: input.agentCallId,
        agentId: input.actorAgentId,
      });
      if (!meeting || !actor || meeting.contactId !== actor.call.contactId)
        return null;
      const key = `decision:${meeting.id}:v${input.expectedScheduleVersion}:${input.cancel ? "cancel" : "keep"}`;
      const prior = await tx.meetingAutomationAction.findUnique({
        where: { actionKey: key },
      });
      const handoffSeed = actor.participant
        ? await tx.aiVoiceAgentHandoff.findUnique({
            where: { id: actor.participant.handoffId },
          })
        : await tx.aiVoiceAgentHandoff.findFirst({
            where: { agentCallId: actor.call.id, meetingId: meeting.id },
          });
      if (handoffSeed) {
        await tx.$queryRaw`SELECT "id" FROM "AiVoiceAgentHandoff" WHERE "id" = ${handoffSeed.id}::uuid FOR UPDATE`;
        if (
          !(await meetingActor(tx, ctx, {
            agentCallId: input.agentCallId,
            agentId: input.actorAgentId,
          }))
        )
          return null;
      }
      if (
        actor.participant?.role === "handoff" ||
        actor.participant?.role === "callback"
      ) {
        if (
          actor.participant.meetingId !== meeting.id ||
          actor.participant.meetingScheduleVersion !==
            input.expectedScheduleVersion
        )
          return null;
      } else {
        const execution = await tx.meetingReminderExecution.findFirst({
          where: {
            agentCallId: actor.call.id,
            meetingId: meeting.id,
            scheduleVersion: input.expectedScheduleVersion,
            organizationId: ctx.organizationId!,
          },
        });
        if (!execution) return null;
      }
      if (prior)
        return prior.agentCallId === actor.call.id &&
          prior.scheduleVersion === meeting.scheduleVersion &&
          (prior.kind !== "cancelled" || meeting.status === "cancelled")
          ? prior
          : null;
      if (
        meeting.scheduleVersion !== input.expectedScheduleVersion ||
        !ACTIVE_MEETING_STATUSES.includes(meeting.status) ||
        meeting.scheduledAt <= new Date()
      )
        return null;
      const seed = handoffSeed
        ? await tx.pendingActionFollowUp.findUnique({
            where: { handoffId: handoffSeed.id },
          })
        : null;
      const objective = seed ? await lockFollowUp(tx, seed.id) : null;
      if (
        objective &&
        (objective.mode !== "automatic" ||
          ["closed", "resolved"].includes(objective.state))
      )
        return null;
      if (input.continueRescheduling && !objective) return null;
      const updated = input.cancel
        ? await tx.meeting.update({
            where: { id: meeting.id },
            data: {
              status: "cancelled",
              cancelledAt: new Date(),
              scheduleVersion: { increment: 1 },
              ...(meeting.externalEventId ? EXTERNAL_EVENT_STALE : {}),
            },
          })
        : meeting;
      await tx.meetingReminderExecution.updateMany({
        where: {
          meetingId: meeting.id,
          status: { in: ["scheduled", "claimed"] },
          dispatchCommittedAt: null,
        },
        data: {
          status: "cancelled",
          reason: input.cancel ? "meeting_cancelled" : "attendance_declined",
          leaseExpiresAt: null,
          claimToken: null,
        },
      });
      await tx.meetingEmailDelivery.updateMany({
        where: { meetingId: meeting.id, status: { in: UNSENT_EMAIL_STATUSES } },
        data: { status: "cancelled", leaseExpiresAt: null },
      });
      const action = await recordMeetingAction(tx, {
        key,
        meeting: updated,
        actor,
        kind: input.cancel ? "cancelled" : "declined_without_rescheduling",
        receipt: input.cancel ? "cancelled" : "declined_without_rescheduling",
        handoffId: handoffSeed?.id,
        followUpId: objective?.id,
        language: handoffSeed?.language,
        evidence: {
          explicitCancellation: input.cancel,
          response: input.response,
          continueRescheduling: input.continueRescheduling,
          expectedScheduleVersion: input.expectedScheduleVersion,
        },
      });
      if (objective && !input.continueRescheduling) {
        await applyFollowUpPlan(
          tx,
          objective,
          {
            state: "closed",
            reason: action.kind,
            closureReason: "refusal",
            nextAction: null,
            nextActionAt: null,
            evidence: { actionId: action.id, decision: action.kind },
          },
          {
            key: `action:${action.id}`,
            kind: "objective_closed",
            actorType: "agent",
            actorId: actor.agent.id,
            evidence: { actionId: action.id },
          },
          new Date(),
        );
      }
      return action;
    });
  }

  findAgentAction(ctx: OwnershipContext, key: string) {
    return this.prisma.meetingAutomationAction.findFirst({
      where: {
        actionKey: key,
        organizationId:
          ctx.organizationId ?? "00000000-0000-0000-0000-000000000000",
      },
      include: { meeting: { include: { contact: true } } },
    });
  }

  listPendingMaintenance(organizationIds: string[] | null, take = 50) {
    return this.prisma.meetingAutomationAction.findMany({
      where: {
        maintenanceCompletedAt: null,
        maintenanceReviewAt: { lte: new Date() },
        ...(organizationIds ? { organizationId: { in: organizationIds } } : {}),
      },
      orderBy: { maintenanceReviewAt: "asc" },
      take,
      include: { meeting: true },
    });
  }

  deferMaintenance(id: string) {
    return this.prisma.meetingAutomationAction.update({
      where: { id },
      data: { maintenanceReviewAt: new Date(Date.now() + 60_000) },
    });
  }

  completeMaintenance(id: string) {
    return this.prisma.meetingAutomationAction.update({
      where: { id },
      data: { maintenanceCompletedAt: new Date() },
    });
  }

  /**
   * Moves a meeting. A new time is a new schedule version: every reminder
   * planned for the old one goes stale, and an attendance answer given for
   * the old time no longer stands (CAL-003). Its external event is marked as
   * not yet following it, in the same transaction (CAL-002).
   */
  async reschedule(
    id: string,
    data: {
      scheduledAt: Date;
      title?: string;
      duration?: number;
      location?: string;
      notes?: string;
    },
  ): Promise<Meeting> {
    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.meeting.update({
        where: { id },
        data: {
          ...data,
          scheduleVersion: { increment: 1 },
          ...ATTENDANCE_RESET,
        },
        include: { contact: true },
      });
      if (!moved.externalEventId) return moved;
      return tx.meeting.update({
        where: { id },
        data: EXTERNAL_EVENT_STALE,
        include: { contact: true },
      });
    });
  }

  /** Cancels a meeting; its version moves so nothing planned for it runs. */
  async cancel(id: string): Promise<Meeting> {
    return this.prisma.meeting.update({
      where: { id },
      data: {
        status: MeetingStatus.cancelled,
        cancelledAt: new Date(),
        scheduleVersion: { increment: 1 },
      },
      include: { contact: true },
    });
  }

  /**
   * Hands a meeting to another member. The version moves because a reminder
   * call names the member; the lead's attendance answer still stands.
   */
  async setResponsible(
    id: string,
    responsibleUserId: string,
  ): Promise<Meeting> {
    return this.prisma.meeting.update({
      where: { id },
      data: { responsibleUserId, scheduleVersion: { increment: 1 } },
      include: { contact: true },
    });
  }

  async setLeadEmail(id: string, leadEmail: string): Promise<Meeting> {
    return this.prisma.meeting.update({
      where: { id },
      data: { leadEmail },
      include: { contact: true },
    });
  }

  /**
   * Upcoming active meetings on some calendars — what a reminder policy plans
   * calls for. The global calendar also owns meetings that predate calendars
   * (`calendarId` null), exactly as its capacity does.
   */
  listUpcomingOnCalendars(
    ctx: OwnershipContext,
    options: {
      calendarIds: string[];
      includeUnassigned: boolean;
      after: Date;
      take?: number;
      afterCursor?: { scheduledAt: Date; id: string };
    },
  ): Promise<Meeting[]> {
    return this.prisma.meeting.findMany({
      where: {
        ...buildOwnershipFilter(ctx),
        status: { in: ACTIVE_MEETING_STATUSES },
        scheduledAt: { gt: options.after },
        ...(options.afterCursor
          ? {
              AND: [
                {
                  OR: [
                    { scheduledAt: { gt: options.afterCursor.scheduledAt } },
                    {
                      scheduledAt: options.afterCursor.scheduledAt,
                      id: { gt: options.afterCursor.id },
                    },
                  ],
                },
              ],
            }
          : {}),
        OR: [
          { calendarId: { in: options.calendarIds } },
          ...(options.includeUnassigned ? [{ calendarId: null }] : []),
        ],
      },
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
      take: options.take ?? 1000,
    });
  }

  /**
   * Records the outcome of pushing a meeting to its calendar's external
   * destination.
   *
   * The destination is written with the result rather than read back from the
   * calendar later, so re-pointing a calendar at another Google account never
   * rewrites where an event that already exists lives.
   */
  async recordExternalSync(
    id: string,
    result:
      | {
          status: "synced";
          externalEventId: string;
          integrationId: string;
          targetCalendarId: string;
          location?: string;
        }
      | {
          status: "failed";
          integrationId: string | null;
          targetCalendarId: string | null;
          error: string;
        },
  ): Promise<Meeting> {
    return this.prisma.meeting.update({
      where: { id },
      data:
        result.status === "synced"
          ? {
              externalEventId: result.externalEventId,
              externalCalendarIntegrationId: result.integrationId,
              externalCalendarTargetId: result.targetCalendarId,
              externalSyncStatus: MeetingExternalSyncStatus.synced,
              externalSyncError: null,
              externalSyncedAt: new Date(),
              ...(result.location ? { location: result.location } : {}),
              externalSyncAttempts: { increment: 1 },
            }
          : {
              externalCalendarIntegrationId: result.integrationId,
              externalCalendarTargetId: result.targetCalendarId,
              externalSyncStatus: MeetingExternalSyncStatus.failed,
              externalSyncError: result.error.slice(0, 2000),
              externalSyncAttempts: { increment: 1 },
            },
    });
  }

  /**
   * Records an external event moved to the meeting's time — only while the
   * meeting is still at the time that was applied. A move that lands after a
   * newer one never marks the newer schedule as synced (CAL-002). Returns
   * whether it was recorded.
   */
  async recordExternalMove(
    id: string,
    applied: {
      scheduledAt: Date;
      duration: number;
      externalEventId: string;
      integrationId: string;
      targetCalendarId: string;
    },
  ): Promise<boolean> {
    const { count } = await this.prisma.meeting.updateMany({
      where: {
        id,
        scheduledAt: applied.scheduledAt,
        duration: applied.duration,
        externalEventId: applied.externalEventId,
      },
      data: {
        externalCalendarIntegrationId: applied.integrationId,
        externalCalendarTargetId: applied.targetCalendarId,
        externalSyncStatus: MeetingExternalSyncStatus.synced,
        externalSyncError: null,
        externalSyncedAt: new Date(),
        externalSyncAttempts: { increment: 1 },
      },
    });
    return count === 1;
  }

  async recordExternalCancellation(
    ctx: OwnershipContext,
    meeting: Meeting,
    error?: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.meeting.updateMany({
      where: {
        id: meeting.id,
        ...buildOwnershipFilter(ctx),
        scheduleVersion: meeting.scheduleVersion,
        status: "cancelled",
        externalEventId: meeting.externalEventId,
      },
      data: {
        externalSyncStatus: error ? "failed" : "synced",
        externalSyncError: error?.slice(0, 2000) ?? null,
        ...(error ? {} : { externalSyncedAt: new Date() }),
        externalSyncAttempts: { increment: 1 },
      },
    });
    return count === 1;
  }

  /**
   * Marks a booking as waiting for its external event, before the attempt.
   *
   * Conditional on the booking not already being `synced`: two attempts can
   * overlap, and an unconditional write would walk a row another attempt just
   * synced back to `pending` — then record `failed` over an event that exists.
   * Returns whether this caller claimed the attempt.
   */
  async markExternalSyncPending(id: string): Promise<boolean> {
    const { count } = await this.prisma.meeting.updateMany({
      where: {
        id,
        externalSyncStatus: { not: MeetingExternalSyncStatus.synced },
      },
      data: { externalSyncStatus: MeetingExternalSyncStatus.pending },
    });
    return count > 0;
  }

  /** The meeting row alone, only when it belongs to the workspace. */
  async findByIdForOwner(
    ctx: OwnershipContext,
    id: string,
  ): Promise<Meeting | null> {
    return this.prisma.meeting.findFirst({
      where: { id, ...buildOwnershipFilter(ctx) },
    });
  }

  async findById(id: string): Promise<Meeting | null> {
    return this.prisma.meeting.findUnique({
      where: { id },
      include: {
        contact: true,
        call: { include: { recordings: true } },
        calendar: { select: { id: true, name: true, isDefault: true } },
      },
    });
  }

  async listByOwner(
    ctx: OwnershipContext,
    options?: {
      status?: MeetingStatus;
      upcoming?: boolean;
      search?: string;
      page?: number;
      limit?: number;
      /** Narrow an org-wide list to a single member's meetings. */
      userId?: string;
      /** Only meetings scheduled at or after this instant. */
      scheduledFrom?: Date;
      /** Only meetings scheduled at or before this instant. */
      scheduledTo?: Date;
      /** Only meetings booked on one calendar. */
      calendarId?: string;
    },
  ): Promise<{
    data: Meeting[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const {
      status,
      upcoming,
      search,
      page = 1,
      limit = 20,
      userId,
      scheduledFrom,
      scheduledTo,
      calendarId,
    } = options || {};

    const ownershipFilter = buildOwnershipFilter(ctx);
    const where: Prisma.MeetingWhereInput = {
      ...ownershipFilter,
      ...(userId ? { userId } : {}),
      ...(calendarId ? { calendarId } : {}),
      ...(status ? { status } : {}),
      ...(upcoming
        ? { scheduledAt: { gte: new Date() }, status: MeetingStatus.scheduled }
        : {}),
      // An explicit window wins over `upcoming` — both write scheduledAt, and a
      // caller asking for a specific day means that day, not "from now on".
      ...(scheduledFrom || scheduledTo
        ? {
            scheduledAt: {
              ...(scheduledFrom ? { gte: scheduledFrom } : {}),
              ...(scheduledTo ? { lte: scheduledTo } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              {
                contact: {
                  OR: [
                    { name: { contains: search, mode: "insensitive" } },
                    { phoneNumber: { contains: search } },
                  ],
                },
              },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.meeting.findMany({
        where,
        include: {
          contact: true,
          call: true,
          calendar: { select: { id: true, name: true, isDefault: true } },
        },
        orderBy: { scheduledAt: upcoming ? "asc" : "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.meeting.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async upcomingThisWeek(ctx: OwnershipContext): Promise<{
    count: number;
    meetings: Meeting[];
  }> {
    const now = new Date();
    const endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
    endOfWeek.setHours(23, 59, 59, 999);

    const ownershipFilter = buildOwnershipFilter(ctx);
    const where: Prisma.MeetingWhereInput = {
      ...ownershipFilter,
      status: MeetingStatus.scheduled,
      scheduledAt: { gte: now, lte: endOfWeek },
    };

    const [meetings, count] = await Promise.all([
      this.prisma.meeting.findMany({
        where,
        include: { contact: true },
        orderBy: { scheduledAt: "asc" },
        take: 3,
      }),
      this.prisma.meeting.count({ where }),
    ]);

    return { count, meetings };
  }

  async update(
    id: string,
    data: {
      title?: string;
      scheduledAt?: Date;
      duration?: number;
      location?: string;
      notes?: string;
      status?: MeetingStatus;
      cancelledAt?: Date;
      externalEventId?: string;
    },
  ): Promise<Meeting> {
    return this.prisma.meeting.update({
      where: { id },
      data,
      include: { contact: true },
    });
  }

  async delete(id: string): Promise<Meeting> {
    return this.prisma.meeting.delete({ where: { id } });
  }
}
