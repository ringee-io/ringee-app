import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CallbackTask, CallbackStatus, Prisma } from "@prisma/client";

export interface CallbackTaskWithContext extends CallbackTask {
  contact: {
    id: string;
    name: string | null;
    phoneNumber: string;
    company: string | null;
  };
  campaignLead: {
    id: string;
    campaignId: string;
    campaign: { id: string; name: string };
  } | null;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    imageUrl: string | null;
  };
}

export interface CallbackOwnerFilter {
  userId: string;
  organizationId?: string | null;
}

@Injectable()
export class CallbackTaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    userId: string;
    organizationId?: string | null;
    contactId: string;
    callId?: string | null;
    campaignLeadId?: string | null;
    scheduledAt: Date;
    note?: string;
  }): Promise<CallbackTask> {
    return this.prisma.callbackTask.create({
      data: {
        userId: data.userId,
        organizationId: data.organizationId ?? null,
        contactId: data.contactId,
        callId: data.callId ?? null,
        campaignLeadId: data.campaignLeadId ?? null,
        scheduledAt: data.scheduledAt,
        note: data.note,
      },
    });
  }

  async findById(id: string): Promise<CallbackTask | null> {
    return this.prisma.callbackTask.findUnique({ where: { id } });
  }

  /**
   * List callbacks visible to the given owner context.
   * - Org context: returns every callback in the organization.
   * - Freelancer context: returns the user's personal callbacks (organizationId IS NULL).
   */
  async listForOwner(
    owner: CallbackOwnerFilter,
    options?: {
      status?: CallbackStatus;
      page?: number;
      limit?: number;
      /** Narrow an org-wide list to a single member's callbacks. */
      userId?: string;
    },
  ): Promise<{
    data: CallbackTaskWithContext[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const { status, page = 1, limit = 20, userId } = options || {};

    const where: Prisma.CallbackTaskWhereInput = {
      ...(owner.organizationId
        ? { organizationId: owner.organizationId }
        : { userId: owner.userId, organizationId: null }),
      ...(userId ? { userId } : {}),
      ...(status ? { status } : {}),
    };

    const total = await this.prisma.callbackTask.count({ where });
    const data = await this.prisma.callbackTask.findMany({
      where,
      include: {
        contact: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            company: true,
          },
        },
        campaignLead: {
          select: {
            id: true,
            campaignId: true,
            campaign: { select: { id: true, name: true } },
          },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            imageUrl: true,
          },
        },
      },
      orderBy: { scheduledAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: data as CallbackTaskWithContext[],
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
    completedAt?: Date,
  ): Promise<CallbackTask> {
    return this.prisma.callbackTask.update({
      where: { id },
      data: { status, ...(completedAt ? { completedAt } : {}) },
    });
  }

  async update(
    id: string,
    data: Partial<Pick<CallbackTask, "scheduledAt" | "note" | "status">>,
  ): Promise<CallbackTask> {
    return this.prisma.callbackTask.update({ where: { id }, data });
  }

  async findByCampaignLead(campaignLeadId: string): Promise<CallbackTask[]> {
    return this.prisma.callbackTask.findMany({
      where: { campaignLeadId },
      orderBy: { scheduledAt: "desc" },
    });
  }

  async findByContact(contactId: string): Promise<CallbackTask[]> {
    return this.prisma.callbackTask.findMany({
      where: { contactId },
      orderBy: { scheduledAt: "desc" },
    });
  }
}
