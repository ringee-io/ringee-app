import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CampaignList } from "@prisma/client";

@Injectable()
export class CampaignListRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    campaignId: string;
    name: string;
    description?: string;
    source?: string;
  }): Promise<CampaignList> {
    return this.prisma.campaignList.create({
      data: {
        campaign: { connect: { id: data.campaignId } },
        name: data.name,
        description: data.description,
        source: data.source,
      },
    });
  }

  async findById(id: string): Promise<CampaignList | null> {
    return this.prisma.campaignList.findUnique({ where: { id } });
  }

  async findByCampaign(campaignId: string): Promise<CampaignList[]> {
    return this.prisma.campaignList.findMany({
      where: { campaignId },
      orderBy: { createdAt: "desc" },
    });
  }

  async findByCampaignWithCounts(
    campaignId: string,
  ): Promise<(CampaignList & { _count: { leads: number } })[]> {
    return this.prisma.campaignList.findMany({
      where: { campaignId },
      include: { _count: { select: { leads: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async delete(id: string): Promise<CampaignList> {
    return this.prisma.campaignList.delete({ where: { id } });
  }
}
