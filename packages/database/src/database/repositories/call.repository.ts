import { Injectable } from "@nestjs/common";
import { Prisma, Call, CallStatus } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";

@Injectable()
export class CallRepository {
  constructor(private readonly prisma: PrismaService) { }

  async createCall(
    ctx: OwnershipContext,
    data: Omit<Prisma.CallCreateInput, "user" | "organization">,
  ): Promise<Call> {
    return this.prisma.call.create({
      data: {
        ...data,
        user: { connect: { id: ctx.userId } },
        organization: ctx.organizationId
          ? { connect: { id: ctx.organizationId } }
          : undefined,
      },
    });
  }

  async findById(id: string): Promise<Call | null> {
    return this.prisma.call.findUnique({ where: { id } });
  }

  async findByControlId(callControlId: string): Promise<Call | null> {
    return this.prisma.call.findUnique({ where: { callControlId } });
  }

  async findBySessionId(callSessionId: string): Promise<Call[]> {
    return this.prisma.call.findMany({ where: { callSessionId } });
  }

  async findOneBySessionId(callSessionId: string): Promise<Call | null> {
    return this.prisma.call.findFirst({ where: { callSessionId } });
  }

  async findActiveByOwner(ctx: OwnershipContext): Promise<Call[]> {
    const ownershipFilter = buildOwnershipFilter(ctx);
    return this.prisma.call.findMany({
      where: {
        ...ownershipFilter,
        status: {
          in: [
            CallStatus.pending,
            CallStatus.ringing,
            CallStatus.answered,
            CallStatus.recording,
          ],
        },
      },
    });
  }

  async updateStatus(callControlId: string, status: CallStatus): Promise<Call> {
    return this.prisma.call.update({
      where: { callControlId },
      data: {
        status,
        answeredAt: status === CallStatus.answered ? new Date() : undefined,
        updatedAt: new Date(),
      },
    });
  }

  async completeCall(
    callControlId: string,
    startedAt: string,
    endedAt: string,
  ): Promise<Call> {
    const endedAtDate = new Date(endedAt);
    const startedAtDate = new Date(startedAt);
    const durationSeconds = Math.floor(
      (endedAtDate.getTime() - startedAtDate.getTime()) / 1000,
    );

    return this.prisma.call.update({
      where: { callControlId },
      data: {
        status: CallStatus.completed,
        endedAt: endedAtDate,
        startedAt: startedAtDate,
        durationSeconds,
      },
    });
  }

  async updateControlState(
    callControlId: string,
    params: {
      clientState?: string;
      lastCommandId?: string;
      lastEventType?: string;
      errorMessage?: string | null;
    },
  ): Promise<Call> {
    return this.prisma.call.update({
      where: { callControlId },
      data: {
        ...params,
        updatedAt: new Date(),
      },
    });
  }

  async logEvent(
    callControlId: string,
    eventType: string,
    details?: any,
  ): Promise<Call> {
    return this.prisma.call.update({
      where: { callControlId },
      data: {
        lastEventType: eventType,
        directionMeta:
          details && Object.keys(details).length > 0
            ? { ...details, timestamp: new Date().toISOString() }
            : Prisma.JsonNull,
      },
    });
  }

  async deleteCall(callControlId: string): Promise<void> {
    await this.prisma.call.delete({ where: { callControlId } });
  }

  async listByOwnerPaginated(
    ctx: OwnershipContext,
    options: {
      page?: number;
      limit?: number;
      status?: CallStatus[];
      orderBy?: "createdAt" | "startedAt" | "endedAt";
      sortDirection?: "asc" | "desc";
    } = {},
  ): Promise<{
    data: Call[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const {
      page = 1,
      limit = 20,
      status,
      orderBy = "createdAt",
      sortDirection = "desc",
    } = options;

    const skip = (Number(page) - 1) * Number(limit);

    const ownershipFilter = buildOwnershipFilter(ctx);
    const where: Prisma.CallWhereInput = {
      ...ownershipFilter,
      ...(status ? { status: { in: status } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.call.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [orderBy]: sortDirection },
        include: {
          contact: true,
          user: true,
          recordings: true,
        },
      }),
      this.prisma.call.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateCost(
    callControlId: string,
    totalCost: number,
    costMeta: any,
  ): Promise<Call> {
    return this.prisma.call.update({
      where: { callControlId },
      data: {
        totalCost,
        costMeta,
      },
    });
  }

  async listWithRecordings(params: {
    ctx: OwnershipContext;
    dateFrom?: Date;
    dateTo?: Date;
    page?: number;
    limit?: number;
  }): Promise<{
    data: Call[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const { ctx, dateFrom, dateTo, page = 1, limit = 20 } = params;
    const skip = (Number(page) - 1) * Number(limit);

    const ownershipFilter = buildOwnershipFilter(ctx);
    const where: Prisma.CallWhereInput = {
      ...ownershipFilter,
      createdAt: {
        gte: dateFrom,
        lte: dateTo,
      },
      recordings: {
        some: {},
      },
    };

    const [data, total] = await Promise.all([
      this.prisma.call.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: "desc" },
        include: {
          recordings: true,
          contact: true,
          user: true,
        },
      }),
      this.prisma.call.count({ where }),
    ]);

    return {
      data,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
    };
  }
}
