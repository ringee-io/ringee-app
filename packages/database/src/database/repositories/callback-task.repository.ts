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

export interface CreateCallbackTaskInput {
  id?: string;
  userId: string;
  organizationId?: string | null;
  contactId: string;
  callId?: string | null;
  campaignLeadId?: string | null;
  scheduledAt: Date;
  note?: string;
}

@Injectable()
export class CallbackTaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateCallbackTaskInput): Promise<CallbackTask> {
    return this.prisma.callbackTask.create({
      data: {
        id: data.id,
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

  /**
   * Creates a callback under a deterministic id and recovers the existing row
   * when the provider replays the same tool call concurrently.
   */
  async createOnce(
    data: CreateCallbackTaskInput & { id: string },
  ): Promise<{ callback: CallbackTask; created: boolean }> {
    try {
      return { callback: await this.create(data), created: true };
    } catch (error) {
      const target =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? error.meta?.target
          : null;
      const duplicateId =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        Array.isArray(target) &&
        target.includes("id");
      if (!duplicateId) throw error;

      const existing = await this.findById(data.id);
      if (!existing) throw error;
      return { callback: existing, created: false };
    }
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
      /** Only callbacks scheduled at or after this instant. */
      scheduledFrom?: Date;
      /** Only callbacks scheduled at or before this instant. */
      scheduledTo?: Date;
    },
  ): Promise<{
    data: CallbackTaskWithContext[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const {
      status,
      page = 1,
      limit = 20,
      userId,
      scheduledFrom,
      scheduledTo,
    } = options || {};

    const where: Prisma.CallbackTaskWhereInput = {
      ...(owner.organizationId
        ? { organizationId: owner.organizationId }
        : { userId: owner.userId, organizationId: null }),
      ...(userId ? { userId } : {}),
      ...(status ? { status } : {}),
      ...(scheduledFrom || scheduledTo
        ? {
            scheduledAt: {
              ...(scheduledFrom ? { gte: scheduledFrom } : {}),
              ...(scheduledTo ? { lte: scheduledTo } : {}),
            },
          }
        : {}),
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

  /**
   * Atomically claims an automated callback before it starts a billable call.
   * A retried scheduler tick therefore cannot place the same callback twice.
   */
  async claimScheduled(id: string): Promise<CallbackTask | null> {
    const [claimed] = await this.prisma.callbackTask.updateManyAndReturn({
      where: {
        id,
        status: CallbackStatus.scheduled,
        scheduledAt: { lte: new Date() },
      },
      data: { status: CallbackStatus.in_progress },
    });
    return claimed ?? null;
  }

  /** The equivalent CAS for callbacks that only become due for a human. */
  async markDueIfScheduled(id: string): Promise<CallbackTask | null> {
    const [updated] = await this.prisma.callbackTask.updateManyAndReturn({
      where: {
        id,
        status: CallbackStatus.scheduled,
        scheduledAt: { lte: new Date() },
      },
      data: { status: CallbackStatus.due },
    });
    return updated ?? null;
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
