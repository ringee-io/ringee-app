import { Injectable } from "@nestjs/common";
import {
  Prisma,
  CallSession,
  CallSessionItem,
  CallSessionAccessToken,
  CallSessionEvent,
  CallSessionStatus,
  CallSessionItemStatus,
  CallSessionAccessTokenStatus,
  CallSessionEventType,
  CallSessionActorSource,
  CallSessionSource,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { OwnershipContext } from "@ringee/platform";

export interface CallSessionWithItems extends CallSession {
  items: CallSessionItem[];
}

@Injectable()
export class CallSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── CallSession ──────────────────────────────────────────────

  async create(
    data: Prisma.CallSessionCreateInput,
  ): Promise<CallSession> {
    return this.prisma.callSession.create({ data });
  }

  async findById(id: string): Promise<CallSession | null> {
    return this.prisma.callSession.findUnique({ where: { id } });
  }

  async findByIdWithItems(id: string): Promise<CallSessionWithItems | null> {
    return this.prisma.callSession.findUnique({
      where: { id },
      include: { items: { orderBy: { positionIndex: "asc" } } },
    }) as Promise<CallSessionWithItems | null>;
  }

  async update(
    id: string,
    data: Prisma.CallSessionUpdateInput,
  ): Promise<CallSession> {
    return this.prisma.callSession.update({ where: { id }, data });
  }

  async softDelete(id: string, status: CallSessionStatus): Promise<CallSession> {
    return this.prisma.callSession.update({
      where: { id },
      data: { status, deletedAt: new Date() },
    });
  }

  async listForOwner(
    ctx: OwnershipContext,
    options?: { page?: number; limit?: number; status?: CallSessionStatus },
  ): Promise<{ data: CallSession[]; total: number; page: number; limit: number }> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const where: Prisma.CallSessionWhereInput = {
      deletedAt: null,
      ...(ctx.organizationId
        ? { organizationId: ctx.organizationId }
        : { userId: ctx.userId, organizationId: null }),
      ...(options?.status ? { status: options.status } : {}),
    };
    const [total, data] = await Promise.all([
      this.prisma.callSession.count({ where }),
      this.prisma.callSession.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { data, total, page, limit };
  }

  async incrementCallsCompleted(id: string): Promise<CallSession> {
    return this.prisma.callSession.update({
      where: { id },
      data: { callsCompleted: { increment: 1 } },
    });
  }

  // ── CallSessionItem ──────────────────────────────────────────

  async createItem(
    data: Prisma.CallSessionItemCreateInput,
  ): Promise<CallSessionItem> {
    return this.prisma.callSessionItem.create({ data });
  }

  async createItemsBulk(
    rows: Prisma.CallSessionItemCreateManyInput[],
  ): Promise<number> {
    const res = await this.prisma.callSessionItem.createMany({
      data: rows,
      skipDuplicates: true,
    });
    return res.count;
  }

  async findItemById(id: string): Promise<CallSessionItem | null> {
    return this.prisma.callSessionItem.findUnique({ where: { id } });
  }

  async findItemsBySession(sessionId: string): Promise<CallSessionItem[]> {
    return this.prisma.callSessionItem.findMany({
      where: { callSessionId: sessionId },
      orderBy: { positionIndex: "asc" },
    });
  }

  async updateItem(
    id: string,
    data: Prisma.CallSessionItemUpdateInput,
  ): Promise<CallSessionItem> {
    return this.prisma.callSessionItem.update({ where: { id }, data });
  }

  async deleteItemsBySession(sessionId: string): Promise<number> {
    const res = await this.prisma.callSessionItem.deleteMany({
      where: { callSessionId: sessionId },
    });
    return res.count;
  }

  async countItemsBySessionStatus(
    sessionId: string,
    status: CallSessionItemStatus,
  ): Promise<number> {
    return this.prisma.callSessionItem.count({
      where: { callSessionId: sessionId, status },
    });
  }

  async findActiveCallingItem(
    sessionId: string,
  ): Promise<CallSessionItem | null> {
    return this.prisma.callSessionItem.findFirst({
      where: {
        callSessionId: sessionId,
        status: CallSessionItemStatus.calling,
      },
    });
  }

  // ── CallSessionAccessToken ───────────────────────────────────

  async createAccessToken(
    data: Prisma.CallSessionAccessTokenCreateInput,
  ): Promise<CallSessionAccessToken> {
    return this.prisma.callSessionAccessToken.create({ data });
  }

  async findAccessTokenByHash(
    hash: string,
  ): Promise<CallSessionAccessToken | null> {
    return this.prisma.callSessionAccessToken.findUnique({
      where: { tokenHash: hash },
    });
  }

  async updateAccessToken(
    id: string,
    data: Prisma.CallSessionAccessTokenUpdateInput,
  ): Promise<CallSessionAccessToken> {
    return this.prisma.callSessionAccessToken.update({ where: { id }, data });
  }

  async hasActiveAccessToken(sessionId: string): Promise<boolean> {
    const row = await this.prisma.callSessionAccessToken.findFirst({
      where: {
        callSessionId: sessionId,
        status: CallSessionAccessTokenStatus.active,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    return Boolean(row);
  }

  async revokeAccessTokensBySession(
    sessionId: string,
  ): Promise<number> {
    const res = await this.prisma.callSessionAccessToken.updateMany({
      where: {
        callSessionId: sessionId,
        status: CallSessionAccessTokenStatus.active,
      },
      data: { status: CallSessionAccessTokenStatus.revoked },
    });
    return res.count;
  }

  // ── CallSessionEvent ─────────────────────────────────────────

  async logEvent(data: {
    callSessionId: string;
    type: CallSessionEventType;
    actorUserId?: string | null;
    actorSource?: CallSessionActorSource | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    payload?: Prisma.InputJsonValue;
  }): Promise<CallSessionEvent> {
    return this.prisma.callSessionEvent.create({
      data: {
        callSessionId: data.callSessionId,
        type: data.type,
        actorUserId: data.actorUserId ?? null,
        actorSource: data.actorSource ?? null,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
        payload: data.payload,
      },
    });
  }

  async listEvents(
    sessionId: string,
    limit = 100,
  ): Promise<CallSessionEvent[]> {
    return this.prisma.callSessionEvent.findMany({
      where: { callSessionId: sessionId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }
}

export {
  CallSessionStatus,
  CallSessionItemStatus,
  CallSessionAccessTokenStatus,
  CallSessionEventType,
  CallSessionActorSource,
  CallSessionSource,
};
