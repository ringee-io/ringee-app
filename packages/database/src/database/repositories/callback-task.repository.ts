import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CallbackTask, CallbackStatus } from "@prisma/client";

export interface CallbackTaskWithLead extends CallbackTask {
  campaignLead: {
    id: string;
    campaignId: string;
    contact: {
      id: string;
      name: string | null;
      phoneNumber: string;
      company: string | null;
    };
  };
}

@Injectable()
export class CallbackTaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    campaignLeadId: string;
    agentUserId: string;
    scheduledAt: Date;
    note?: string;
  }): Promise<CallbackTask> {
    return this.prisma.callbackTask.create({ data });
  }

  async findById(id: string): Promise<CallbackTask | null> {
    return this.prisma.callbackTask.findUnique({ where: { id } });
  }

  async findByAgent(
    agentUserId: string,
    options?: { status?: CallbackStatus; page?: number; limit?: number }
  ): Promise<{
    data: CallbackTaskWithLead[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const { status, page = 1, limit = 20 } = options || {};

    const where = {
      agentUserId,
      ...(status ? { status } : {}),
    };

    const total = await this.prisma.callbackTask.count({ where });
    const data = await this.prisma.callbackTask.findMany({
      where,
      include: {
        campaignLead: {
          include: {
            contact: {
              select: {
                id: true,
                name: true,
                phoneNumber: true,
                company: true,
              },
            },
          },
        },
      },
      orderBy: { scheduledAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: data as CallbackTaskWithLead[],
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findDue(): Promise<CallbackTask[]> {
    return this.prisma.callbackTask.findMany({
      where: {
        status: CallbackStatus.scheduled,
        scheduledAt: { lte: new Date() },
      },
      orderBy: { scheduledAt: "asc" },
    });
  }

  async updateStatus(
    id: string,
    status: CallbackStatus,
    completedAt?: Date
  ): Promise<CallbackTask> {
    return this.prisma.callbackTask.update({
      where: { id },
      data: { status, ...(completedAt ? { completedAt } : {}) },
    });
  }

  async update(
    id: string,
    data: Partial<Pick<CallbackTask, "scheduledAt" | "note" | "status">>
  ): Promise<CallbackTask> {
    return this.prisma.callbackTask.update({ where: { id }, data });
  }

  async findByCampaignLead(campaignLeadId: string): Promise<CallbackTask[]> {
    return this.prisma.callbackTask.findMany({
      where: { campaignLeadId },
      orderBy: { scheduledAt: "desc" },
    });
  }
}
