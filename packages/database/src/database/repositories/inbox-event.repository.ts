import { Injectable } from "@nestjs/common";
import { Prisma, InboxEvent, InboxEventKind } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class InboxEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.InboxEventCreateInput): Promise<InboxEvent> {
    return this.prisma.inboxEvent.create({ data });
  }

  async findById(id: string): Promise<InboxEvent | null> {
    return this.prisma.inboxEvent.findUnique({
      where: { id },
      include: {
        call: { include: { recordings: true } },
        message: true,
        recording: true,
        voicemailDropAsset: true,
        meeting: true,
      },
    });
  }

  async listByThread(
    threadId: string,
    options: {
      page?: number;
      limit?: number;
      kindIn?: InboxEventKind[];
    } = {},
  ): Promise<{
    data: any[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const { page = 1, limit = 100, kindIn } = options;

    const where: Prisma.InboxEventWhereInput = {
      threadId,
      ...(kindIn && kindIn.length > 0 ? { kind: { in: kindIn } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.inboxEvent.findMany({
        where,
        include: {
          call: { include: { recordings: true } },
          message: true,
          recording: true,
          voicemailDropAsset: true,
          meeting: true,
        },
        orderBy: [{ occurredAt: "asc" }, { sequence: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inboxEvent.count({ where }),
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

  async existsForCallEvent(
    threadId: string,
    callId: string,
    kind: InboxEventKind,
  ): Promise<boolean> {
    const existing = await this.prisma.inboxEvent.findFirst({
      where: { threadId, callId, kind },
      select: { id: true },
    });
    return !!existing;
  }

  async existsForMessage(
    threadId: string,
    messageId: string,
  ): Promise<boolean> {
    const existing = await this.prisma.inboxEvent.findFirst({
      where: { threadId, messageId },
      select: { id: true },
    });
    return !!existing;
  }

  async update(
    id: string,
    data: Prisma.InboxEventUpdateInput,
  ): Promise<InboxEvent> {
    return this.prisma.inboxEvent.update({ where: { id }, data });
  }
}
