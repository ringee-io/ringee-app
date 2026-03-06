import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { Prisma, Campaign } from "@prisma/client";

export interface CampaignWithLeadsCount extends Campaign {
  _count: { leads: number };
}

@Injectable()
export class CampaignRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    organizationId: string,
    data: { name: string; description?: string }
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
    options?: { page?: number; limit?: number }
  ): Promise<{
    campaign: Campaign | null;
    leads: Array<{
      id: string;
      attempts: number;
      lastCallAt: Date | null;
      nextCallAt: Date | null;
      contact: { id: string; name: string | null; phoneNumber: string; email: string | null };
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
    options?: { search?: string; status?: string; page?: number; limit?: number }
  ): Promise<{
    data: CampaignWithLeadsCount[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const { search, status, page = 1, limit = 10 } = options || {};

    const where: Prisma.CampaignWhereInput = {
      organizationId,
      ...(status ? { status } : {}),
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

  async updateStatus(id: string, status: string): Promise<Campaign> {
    return this.prisma.campaign.update({
      where: { id },
      data: { status },
    });
  }

  async update(
    id: string,
    data: { name?: string; description?: string }
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
