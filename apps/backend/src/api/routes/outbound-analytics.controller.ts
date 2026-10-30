import {
  Controller,
  Get,
  Param,
  Query,
  ForbiddenException,
} from "@nestjs/common";
import { CurrentUser, createOwnershipContext } from "@ringee/platform";
import { CampaignService, OutboundAnalyticsService } from "@ringee/services";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
  activeOrgRole?: string | null;
}

@Controller("campaigns/:campaignId/analytics")
export class OutboundAnalyticsController {
  constructor(
    private readonly analyticsService: OutboundAnalyticsService,
    private readonly campaignService: CampaignService,
  ) {}

  /**
   * The campaign must be one of the caller's organization's — and, for a
   * member, one they are assigned to — before any of its numbers are read:
   * the analytics queries themselves select by campaign id alone.
   */
  private async authorize(
    user: CurrentUserData,
    campaignId: string,
  ): Promise<void> {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Organization required");
    }
    await this.campaignService.getCampaignById(
      createOwnershipContext(user),
      campaignId,
      {
        requireMembershipForUserId:
          user.activeOrgRole === "org:admin" ? undefined : user.id,
      },
    );
  }

  @Get("summary")
  async summary(
    @Param("campaignId") campaignId: string,
    @CurrentUser() user: CurrentUserData,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    await this.authorize(user, campaignId);
    return this.analyticsService.getCampaignSummary(
      campaignId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get("dispositions")
  async dispositions(
    @Param("campaignId") campaignId: string,
    @CurrentUser() user: CurrentUserData,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    await this.authorize(user, campaignId);
    return this.analyticsService.getDispositionDistribution(
      campaignId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get("agents")
  async agents(
    @Param("campaignId") campaignId: string,
    @CurrentUser() user: CurrentUserData,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    await this.authorize(user, campaignId);
    return this.analyticsService.getAgentPerformance(
      campaignId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get("dispositions-by-agent")
  async dispositionsByAgent(
    @Param("campaignId") campaignId: string,
    @CurrentUser() user: CurrentUserData,
    @Query("agentUserId") agentUserId?: string,
  ) {
    await this.authorize(user, campaignId);
    return this.analyticsService.getDispositionsByAgent(
      campaignId,
      agentUserId,
    );
  }

  @Get("hourly")
  async hourly(
    @Param("campaignId") campaignId: string,
    @CurrentUser() user: CurrentUserData,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    await this.authorize(user, campaignId);
    return this.analyticsService.getHourlyCallVolume(
      campaignId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }
}
