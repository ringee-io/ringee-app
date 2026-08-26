import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import type { CampaignStatus } from "@ringee/platform";
import { Prisma, Campaign } from "@prisma/client";

export interface CampaignWithLeadsCount extends Campaign {
  _count: { leads: number };
}

@Injectable()
export class CampaignRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Minimal campaign list scoped to an ownership context, for the AI pipeline
   * activation tables. Org context returns the org's campaigns; personal
   * context returns the user's campaigns with no organization.
   */
  async listForPipelineOwner(owner: {
    userId: string;
    organizationId?: string | null;
  }): Promise<{ id: string; name: string; organizationId: string | null }[]> {
    const where: Prisma.CampaignWhereInput = owner.organizationId
      ? { organizationId: owner.organizationId }
      : { userId: owner.userId, organizationId: null };
    return this.prisma.campaign.findMany({
      where,
      select: { id: true, name: true, organizationId: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(
    userId: string,
    organizationId: string,
    data: { name: string; description?: string },
  ): Promise<Campaign> {
    return this.prisma.campaign.create({
      data: {
        name: data.name,
        description: data.description,
        status: "draft",
        user: { connect: { id: userId } },
        organization: { connect: { id: organizationId } },
      },
    });
  }

  async findById(id: string): Promise<CampaignWithLeadsCount | null> {
    return this.prisma.campaign.findUnique({
      where: { id },
      include: {
        _count: { select: { leads: true } },
      },
    });
  }

  async findByIdWithLeads(
    id: string,
    options?: { page?: number; limit?: number },
  ): Promise<{
    campaign: Campaign | null;
    leads: Array<{
      id: string;
      attempts: number;
      lastCallAt: Date | null;
      nextCallAt: Date | null;
      contact: {
        id: string;
        name: string | null;
        phoneNumber: string;
        email: string | null;
      };
    }>;
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const { page = 1, limit = 20 } = options || {};

    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
    });

    if (!campaign) {
      return {
        campaign: null,
        leads: [],
        meta: { total: 0, page, limit, totalPages: 0 },
      };
    }

    const total = await this.prisma.campaignLead.count({
      where: { campaignId: id },
    });

    const leads = await this.prisma.campaignLead.findMany({
      where: { campaignId: id },
      include: {
        contact: {
          select: { id: true, name: true, phoneNumber: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      campaign,
      leads: leads.map((l) => ({
        id: l.id,
        attempts: l.attempts,
        lastCallAt: l.lastCallAt,
        nextCallAt: l.nextCallAt,
        contact: l.contact,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async listByOrganization(
    organizationId: string,
    options?: {
      search?: string;
      status?: string;
      page?: number;
      limit?: number;
      /**
       * When set, restrict results to campaigns this user is a member of.
       * Used to hide campaigns from non-admin members who aren't assigned.
       */
      memberUserId?: string;
    },
  ): Promise<{
    data: CampaignWithLeadsCount[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const {
      search,
      status,
      page = 1,
      limit = 10,
      memberUserId,
    } = options || {};

    const where: Prisma.CampaignWhereInput = {
      organizationId,
      ...(status ? { status } : {}),
      ...(memberUserId ? { members: { some: { userId: memberUserId } } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const total = await this.prisma.campaign.count({ where });

    const data = await this.prisma.campaign.findMany({
      where,
      include: {
        _count: { select: { leads: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });

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

  async findAllActive(): Promise<CampaignWithLeadsCount[]> {
    return this.prisma.campaign.findMany({
      where: { status: "active" },
      include: { _count: { select: { leads: true } } },
    });
  }

  /**
   * `Campaign.status` is a String column, not a Prisma enum, so the type here
   * is the only thing preventing an arbitrary value from being persisted.
   * Keep it narrowed to CampaignStatus.
   */
  async updateStatus(id: string, status: CampaignStatus): Promise<Campaign> {
    return this.prisma.campaign.update({
      where: { id },
      data: { status },
    });
  }

  async update(
    id: string,
    data: Partial<
      Pick<
        Campaign,
        | "name"
        | "description"
        | "dialerMode"
        | "callerIdId"
        | "numberPurchasedId"
        | "rotationNumberIds"
        | "maxAttempts"
        | "timezone"
        | "workStartMin"
        | "workEndMin"
        | "workDays"
        | "wrapUpTimeSec"
        | "retryDelayMin"
      >
    >,
  ): Promise<Campaign> {
    return this.prisma.campaign.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<Campaign> {
    return this.prisma.campaign.delete({
      where: { id },
    });
  }
}
