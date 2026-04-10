import { Injectable } from "@nestjs/common";
import {
  OutboundAnalyticsRepository,
  CampaignLeadRepository,
} from "@ringee/database";

@Injectable()
export class OutboundAnalyticsService {
  constructor(
    private readonly analyticsRepo: OutboundAnalyticsRepository,
    private readonly campaignLeadRepo: CampaignLeadRepository
  ) {}

  async getCampaignSummary(
    campaignId: string,
    startDate?: Date,
    endDate?: Date
  ) {
    const [stats, leadCounts] = await Promise.all([
      this.analyticsRepo.getCampaignSummary(campaignId, startDate, endDate),
      this.campaignLeadRepo.countByStatus(campaignId),
    ]);

    return { ...stats, leadsByStatus: leadCounts };
  }

  async getAgentPerformance(
    campaignId: string,
    startDate?: Date,
    endDate?: Date
  ) {
    return this.analyticsRepo.getAgentPerformance(
      campaignId,
      startDate,
      endDate
    );
  }

  async getDispositionDistribution(
    campaignId: string,
    startDate?: Date,
    endDate?: Date
  ) {
    return this.analyticsRepo.getDispositionDistribution(
      campaignId,
      startDate,
      endDate
    );
  }

  async getHourlyCallVolume(
    campaignId: string,
    startDate?: Date,
    endDate?: Date
  ) {
    return this.analyticsRepo.getHourlyCallVolume(
      campaignId,
      startDate,
      endDate
    );
  }
}
