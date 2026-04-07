import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { RetryRule, DispositionCategory } from "@prisma/client";

@Injectable()
export class RetryRuleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(data: {
    campaignId: string;
    dispositionCategory: DispositionCategory;
    maxAttempts: number;
    delayMinutes: number;
    delayMultiplier?: number;
  }): Promise<RetryRule> {
    return this.prisma.retryRule.upsert({
      where: {
        campaignId_dispositionCategory: {
          campaignId: data.campaignId,
          dispositionCategory: data.dispositionCategory,
        },
      },
      update: {
        maxAttempts: data.maxAttempts,
        delayMinutes: data.delayMinutes,
        delayMultiplier: data.delayMultiplier ?? 1.0,
      },
      create: {
        campaignId: data.campaignId,
        dispositionCategory: data.dispositionCategory,
        maxAttempts: data.maxAttempts,
        delayMinutes: data.delayMinutes,
        delayMultiplier: data.delayMultiplier ?? 1.0,
      },
    });
  }

  async findByCampaign(campaignId: string): Promise<RetryRule[]> {
    return this.prisma.retryRule.findMany({
      where: { campaignId },
      orderBy: { dispositionCategory: "asc" },
    });
  }

  async findByCampaignAndCategory(
    campaignId: string,
    dispositionCategory: DispositionCategory
  ): Promise<RetryRule | null> {
    return this.prisma.retryRule.findUnique({
      where: {
        campaignId_dispositionCategory: { campaignId, dispositionCategory },
      },
    });
  }

  async delete(id: string): Promise<RetryRule> {
    return this.prisma.retryRule.delete({ where: { id } });
  }
}
