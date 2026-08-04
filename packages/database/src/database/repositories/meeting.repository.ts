import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { Prisma, Meeting, MeetingStatus } from "@prisma/client";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";

@Injectable()
export class MeetingRepository {
  constructor(private readonly prisma: PrismaService) {}

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
