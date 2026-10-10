import { Injectable } from "@nestjs/common";
import {
  Prisma,
  InboxThread,
  InboxThreadStatus,
  InboxEventKind,
} from "@prisma/client";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";
import { PrismaService } from "../prisma.service";

export interface FindOrCreateThreadInput {
  ctx: OwnershipContext;
  participantNumber: string;
  participantNumberE164?: string | null;
  ringeeNumber?: string | null;
  numberId?: string | null;
  contactId?: string | null;
}

export interface ListThreadsOptions {
  status?: InboxThreadStatus | InboxThreadStatus[];
  unreadOnly?: boolean;
  kindIn?: InboxEventKind[];
  search?: string;
  page?: number;
  limit?: number;
  assignedToId?: string | null;
}

/** A thread with a missed call; timestamps describe its latest missed event. */
export interface MissedCallThread {
  id: string;
  participantNumber: string;
  participantNumberE164: string | null;
  lastEventAt: Date;
  lastEventKind: InboxEventKind | null;
  contact: {
    id: string;
    name: string | null;
    phoneNumber: string;
    company: string | null;
    timezone: string | null;
    deletedAt: Date | null;
  } | null;
}

@Injectable()
export class InboxThreadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOrCreate(input: FindOrCreateThreadInput): Promise<InboxThread> {
    const { ctx } = input;
    const ownership = buildOwnershipFilter(ctx);

    const lookup: Prisma.InboxThreadWhereInput = {
      ...ownership,
      ...(input.numberId
        ? { numberId: input.numberId }
        : { ringeeNumber: input.ringeeNumber ?? undefined }),
      OR: [
        ...(input.participantNumberE164
          ? [{ participantNumberE164: input.participantNumberE164 }]
          : []),
        { participantNumber: input.participantNumber },
      ],
    };

    const existing = await this.prisma.inboxThread.findFirst({
      where: lookup,
      orderBy: { lastEventAt: "desc" },
    });

    if (existing) {
      // Backfill contactId if it became known later.
      if (input.contactId && !existing.contactId) {
        return this.prisma.inboxThread.update({
          where: { id: existing.id },
          data: { contactId: input.contactId },
        });
      }
      return existing;
    }

    return this.prisma.inboxThread.create({
      data: {
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
        contactId: input.contactId ?? null,
        numberId: input.numberId ?? null,
        participantNumber: input.participantNumber,
        participantNumberE164: input.participantNumberE164 ?? null,
        ringeeNumber: input.ringeeNumber ?? null,
      },
    });
  }

  async findById(id: string): Promise<InboxThread | null> {
    return this.prisma.inboxThread.findUnique({
      where: { id },
      include: { contact: true },
    });
  }

  async listByOwner(
    ctx: OwnershipContext,
    options: ListThreadsOptions = {},
  ): Promise<{
    data: (InboxThread & { contact: any })[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const {
      status,
      unreadOnly,
      kindIn,
      search,
      page = 1,
      limit = 30,
      assignedToId,
    } = options;

    const ownership = buildOwnershipFilter(ctx);

    const where: Prisma.InboxThreadWhereInput = {
      ...ownership,
      ...(status
        ? Array.isArray(status)
          ? { status: { in: status } }
          : { status }
        : {}),
      ...(unreadOnly ? { unreadCount: { gt: 0 } } : {}),
      ...(kindIn && kindIn.length > 0 ? { lastEventKind: { in: kindIn } } : {}),
      ...(assignedToId !== undefined ? { assignedToId } : {}),
      ...(search
        ? {
            OR: [
              { participantNumber: { contains: search } },
              { participantNumberE164: { contains: search } },
              {
                contact: {
                  OR: [
                    { name: { contains: search, mode: "insensitive" } },
                    { firstName: { contains: search, mode: "insensitive" } },
                    { lastName: { contains: search, mode: "insensitive" } },
                  ],
                },
              },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.inboxThread.findMany({
        where,
        include: { contact: true },
        orderBy: { lastEventAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inboxThread.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Per-filter thread counts for the inbox filter pills. Mirrors the filter
   * definitions on the frontend (THREAD_FILTER_OPTIONS) so the badges match
   * what each tab will actually show.
   */
  async countsByFilter(ctx: OwnershipContext): Promise<{
    all: number;
    unread: number;
    missed: number;
    voicemails: number;
    sms: number;
  }> {
    const ownership = buildOwnershipFilter(ctx);
    const [all, unread, missed, voicemails, sms] = await Promise.all([
      this.prisma.inboxThread.count({
        where: {
          ...ownership,
          status: {
            in: [InboxThreadStatus.open, InboxThreadStatus.pending],
          },
        },
      }),
      this.prisma.inboxThread.count({
        where: { ...ownership, unreadCount: { gt: 0 } },
      }),
      this.prisma.inboxThread.count({
        where: { ...ownership, lastEventKind: InboxEventKind.missed_call },
      }),
      this.prisma.inboxThread.count({
        where: {
          ...ownership,
          lastEventKind: InboxEventKind.voicemail_received,
        },
      }),
      this.prisma.inboxThread.count({
        where: {
          ...ownership,
          lastEventKind: {
            in: [
              InboxEventKind.sms_received,
              InboxEventKind.sms_sent,
              InboxEventKind.mms_received,
              InboxEventKind.mms_sent,
            ],
          },
        },
      }),
    ]);
    return { all, unread, missed, voicemails, sms };
  }

  /**
   * Open threads with a missed call or a voicemail since
   * `since`, newest first. In an organization, only the caller's own: those
   * assigned to them, and unassigned ones on a line of theirs (the thread's
   * user) — the rest of the team's missed calls stay in the shared inbox.
   */
  async listMissedCallThreads(
    ctx: OwnershipContext,
    options: { since: Date; limit: number },
  ): Promise<MissedCallThread[]> {
    const missed: Prisma.InboxEventWhereInput = {
      kind: {
        in: [InboxEventKind.missed_call, InboxEventKind.voicemail_received],
      },
      occurredAt: { gte: options.since },
    };
    const threads = await this.prisma.inboxThread.findMany({
      where: {
        ...buildOwnershipFilter(ctx),
        status: { in: [InboxThreadStatus.open, InboxThreadStatus.pending] },
        events: { some: missed },
        ...(ctx.organizationId
          ? {
              OR: [
                { assignedToId: ctx.userId },
                { assignedToId: null, userId: ctx.userId },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        participantNumber: true,
        participantNumberE164: true,
        events: {
          where: missed,
          orderBy: [{ occurredAt: "desc" }, { sequence: "desc" }],
          take: 1,
          select: { occurredAt: true, kind: true },
        },
        contact: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            company: true,
            timezone: true,
            deletedAt: true,
          },
        },
      },
      orderBy: { lastEventAt: "desc" },
      take: options.limit,
    });
    return threads.flatMap(({ events, ...thread }) => {
      const latest = events[0];
      return latest
        ? [
            {
              ...thread,
              lastEventAt: latest.occurredAt,
              lastEventKind: latest.kind,
            },
          ]
        : [];
    });
  }

  /** Number of threads with at least one unread event (drives the nav badge). */
  async countUnread(ctx: OwnershipContext): Promise<number> {
    const ownership = buildOwnershipFilter(ctx);
    return this.prisma.inboxThread.count({
      where: { ...ownership, unreadCount: { gt: 0 } },
    });
  }

  async update(
    id: string,
    data: Prisma.InboxThreadUpdateInput,
  ): Promise<InboxThread> {
    return this.prisma.inboxThread.update({ where: { id }, data });
  }

  async incrementUnread(id: string, delta = 1): Promise<void> {
    await this.prisma.inboxThread.update({
      where: { id },
      data: { unreadCount: { increment: delta } },
    });
  }

  async resetUnread(id: string): Promise<void> {
    await this.prisma.inboxThread.update({
      where: { id },
      data: { unreadCount: 0 },
    });
  }
}
