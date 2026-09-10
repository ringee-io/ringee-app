import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import {
  Prisma,
  Meeting,
  MeetingExternalSyncStatus,
  MeetingStatus,
} from "@prisma/client";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";
import { lockWorkspace } from "./calendar.repository";

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
}

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
   */
  async findBusySlots(
    ctx: OwnershipContext,
    scope: MeetingCalendarScope,
    start: Date,
    end: Date,
  ): Promise<Array<{ start: Date; end: Date }>> {
    const { userFilter, organizationFilter } = ownershipSql(ctx);
    const calendarFilter = calendarSql(scope.calendarId, scope.isDefault);

    return this.prisma.$queryRaw<Array<{ start: Date; end: Date }>>`
      SELECT
        "scheduledAt" AS "start",
        "scheduledAt" + ("duration" * INTERVAL '1 minute') AS "end"
      FROM "Meeting"
      WHERE "status" IN ('scheduled', 'rescheduled')
        AND "scheduledAt" < ${end}
        AND "scheduledAt" + ("duration" * INTERVAL '1 minute') > ${start}
        ${userFilter}
        ${organizationFilter}
        ${calendarFilter}
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
    const ownershipFilter = buildOwnershipFilter(ctx);
    const calendarFilter = calendarSql(scope.calendarId, scope.isDefault);

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
        if (!currentRule) return null;
        capacity = currentRule.capacity;
      } else {
        // A null marker means getBookableSlots used the default capacity-one
        // schedule. It stays valid only while this calendar has no configured
        // rules.
        const configuredRuleCount = await tx.calendarAvailabilityRule.count({
          where: { calendarId: scope.calendarId, ...ownershipFilter },
        });
        if (configuredRuleCount !== 0) return null;
        capacity = 1;
      }

      // Only this calendar's bookings consume this calendar's capacity, so two
      // calendars stay independent and two agents that share one do not.
      const [{ count = 0 } = {}] = await tx.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS "count"
        FROM "Meeting"
        WHERE "status" IN ('scheduled', 'rescheduled')
          AND "scheduledAt" < ${end}
          AND "scheduledAt" + ("duration" * INTERVAL '1 minute') > ${data.scheduledAt}
          ${userFilter}
          ${organizationFilter}
          ${calendarFilter}
      `;
      if (capacity !== null && count >= capacity) return null;

      const meeting = await tx.meeting.create({
        data: this.createData(ctx, { ...data, duration }),
        include: { contact: true },
      });
      if (data.agentCallId) {
        await tx.aiVoiceAgentCall.update({
          where: { id: data.agentCallId },
          data: { meetingId: meeting.id },
        });
      }
      return meeting;
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
    };
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
