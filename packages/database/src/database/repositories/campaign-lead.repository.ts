import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CampaignLead, Prisma } from "@prisma/client";

export interface CampaignLeadWithContact extends CampaignLead {
  contact: {
    id: string;
    name: string | null;
    phoneNumber: string;
    email: string | null;
    company: string | null;
  };
}

@Injectable()
export class CampaignLeadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    campaignId: string;
    contactId: string;
    userId?: string;
    metadata?: Prisma.JsonValue;
  }): Promise<CampaignLead> {
    return this.prisma.campaignLead.create({
      data: {
        campaign: { connect: { id: data.campaignId } },
        contact: { connect: { id: data.contactId } },
        user: data.userId ? { connect: { id: data.userId } } : undefined,
        metadata: data.metadata ?? Prisma.DbNull,
      },
    });
  }

  async createMany(
    campaignId: string,
    leads: Array<{ contactId: string; metadata?: Prisma.JsonValue }>
  ): Promise<number> {
    const result = await this.prisma.campaignLead.createMany({
      data: leads.map((lead) => ({
        campaignId,
        contactId: lead.contactId,
        metadata: lead.metadata ?? Prisma.DbNull,
      })),
      skipDuplicates: true,
    });
    return result.count;
  }

  async findByCampaign(
    campaignId: string,
    options?: {
      page?: number;
      limit?: number;
      status?: "pending" | "called" | "dead";
    }
  ): Promise<{
    data: CampaignLeadWithContact[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const { page = 1, limit = 20, status } = options || {};

    let statusFilter: Prisma.CampaignLeadWhereInput = {};
    if (status === "pending") {
      statusFilter = { attempts: 0, deadAt: null };
    } else if (status === "called") {
      statusFilter = { attempts: { gt: 0 }, deadAt: null };
    } else if (status === "dead") {
      statusFilter = { deadAt: { not: null } };
    }

    const where: Prisma.CampaignLeadWhereInput = {
      campaignId,
      ...statusFilter,
    };

    const total = await this.prisma.campaignLead.count({ where });

    const data = await this.prisma.campaignLead.findMany({
      where,
      include: {
        contact: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            email: true,
            company: true,
          },
        },
      },
      orderBy: [{ nextCallAt: "asc" }, { createdAt: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: data as CampaignLeadWithContact[],
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findExistingContactIds(
    campaignId: string,
    contactIds: string[]
  ): Promise<string[]> {
    const existing = await this.prisma.campaignLead.findMany({
      where: {
        campaignId,
        contactId: { in: contactIds },
      },
      select: { contactId: true },
    });
    return existing.map((l) => l.contactId);
  }

  async updateAttempt(
    id: string,
    data: {
      attempts?: number;
      lastCallAt?: Date;
      nextCallAt?: Date | null;
      deadAt?: Date | null;
    }
  ): Promise<CampaignLead> {
    return this.prisma.campaignLead.update({
      where: { id },
      data,
    });
  }

  async incrementAttempt(id: string): Promise<CampaignLead> {
    return this.prisma.campaignLead.update({
      where: { id },
      data: {
        attempts: { increment: 1 },
        lastCallAt: new Date(),
      },
    });
  }

  async assignToAgent(leadId: string, userId: string): Promise<CampaignLead> {
    return this.prisma.campaignLead.update({
      where: { id: leadId },
      data: { user: { connect: { id: userId } } },
    });
  }

  async markAsDead(id: string): Promise<CampaignLead> {
    return this.prisma.campaignLead.update({
      where: { id },
      data: { deadAt: new Date() },
    });
  }
}
