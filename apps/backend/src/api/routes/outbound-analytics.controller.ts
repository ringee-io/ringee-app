import {
  Controller,
  Get,
  Param,
  Query,
  ForbiddenException,
} from "@nestjs/common";
import { CurrentUser, createOwnershipContext } from "@ringee/platform";
import { OutboundAnalyticsService } from "@ringee/services";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
}

@Controller("campaigns/:campaignId/analytics")
export class OutboundAnalyticsController {
  constructor(
    private readonly analyticsService: OutboundAnalyticsService
  ) {}

  @Get("summary")
  async summary(
    @Param("campaignId") campaignId: string,
    @CurrentUser() user: CurrentUserData,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Organization required");
    }
    return this.analyticsService.getCampaignSummary(
      campaignId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );
  }

  @Get("dispositions")
  async dispositions(
    @Param("campaignId") campaignId: string,
    @CurrentUser() user: CurrentUserData,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Organization required");
    }
    return this.analyticsService.getDispositionDistribution(
      campaignId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );
  }

  @Get("agents")
  async agents(
    @Param("campaignId") campaignId: string,
    @CurrentUser() user: CurrentUserData,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Organization required");
    }
    return this.analyticsService.getAgentPerformance(
      campaignId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );
  }

  @Get("hourly")
  async hourly(
    @Param("campaignId") campaignId: string,
    @CurrentUser() user: CurrentUserData,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Organization required");
    }
    return this.analyticsService.getHourlyCallVolume(
      campaignId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );
  }
}
