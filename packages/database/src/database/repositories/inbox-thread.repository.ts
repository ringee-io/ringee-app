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
