import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { Prisma, Meeting, MeetingStatus } from "@prisma/client";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";

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
    start: Date,
    end: Date,
  ): Promise<Array<{ start: Date; end: Date }>> {
    const owner = buildOwnershipFilter(ctx);
    const userFilter = owner.userId
      ? Prisma.sql`AND "userId" = ${owner.userId}::uuid`
      : Prisma.empty;
    const organizationFilter =
      owner.organizationId === null
        ? Prisma.sql`AND "organizationId" IS NULL`
        : owner.organizationId
          ? Prisma.sql`AND "organizationId" = ${owner.organizationId}::uuid`
          : Prisma.empty;

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
    `;
  }

  async create(
    ctx: OwnershipContext,
    data: {
      contactId: string;
      callId?: string;
      title?: string;
      scheduledAt: Date;
      duration?: number;
      location?: string;
      notes?: string;
    },
  ): Promise<Meeting> {
    return this.prisma.meeting.create({
      data: {
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
      },
      include: {
        contact: true,
      },
    });
  }

  async findById(id: string): Promise<Meeting | null> {
    return this.prisma.meeting.findUnique({
      where: { id },
      include: {
        contact: true,
        call: { include: { recordings: true } },
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
    } = options || {};

    const ownershipFilter = buildOwnershipFilter(ctx);
    const where: Prisma.MeetingWhereInput = {
      ...ownershipFilter,
      ...(userId ? { userId } : {}),
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
