import { Injectable } from "@nestjs/common";
import {
  BackofficeCampaignListResult,
  BackofficeCampaignRepository,
  CampaignAgentRow,
  CampaignAttemptsResult,
  CampaignConfig,
  CampaignDailyPoint,
  CampaignDispositionRow,
  CampaignHourlyPoint,
  CampaignLeadStatusRow,
  CampaignListRow,
  CampaignMemberRow,
  CampaignMetrics,
  CampaignOrganizationOption,
  CampaignRetryRuleRow,
  CampaignSortKey,
  CampaignOwnerScope,
} from "@ringee/database";

export interface ListCampaignsInput {
  start: Date;
  end: Date;
  search?: string;
  status?: string;
  organizationId?: string;
  ownerScope?: CampaignOwnerScope;
  onlyNew?: boolean;
  sort?: CampaignSortKey;
  page: number;
  pageSize: number;
}

export interface BackofficeCampaignDetail {
  range: { start: string; end: string };
  campaign: CampaignConfig;
  metrics: CampaignMetrics;
  daily: CampaignDailyPoint[];
  hourly: CampaignHourlyPoint[];
  dispositions: CampaignDispositionRow[];
  agents: CampaignAgentRow[];
  leadsByStatus: CampaignLeadStatusRow[];
  lists: CampaignListRow[];
  members: CampaignMemberRow[];
  retryRules: CampaignRetryRuleRow[];
}

/**
 * Read-only campaign analytics for the backoffice. Every method is cross-tenant
 * — the SuperAdminGuard on the controller is the access boundary.
 */
@Injectable()
export class BackofficeCampaignService {
  constructor(private readonly repo: BackofficeCampaignRepository) {}

  listCampaigns(
    input: ListCampaignsInput,
  ): Promise<BackofficeCampaignListResult> {
    const take = Math.min(Math.max(input.pageSize, 1), 100);
    const skip = Math.max(input.page - 1, 0) * take;
    return this.repo.listCampaigns({
      start: input.start,
      end: input.end,
      search: input.search,
      status: input.status,
      organizationId: input.organizationId,
      ownerScope: input.ownerScope,
      onlyNew: input.onlyNew,
      sort: input.sort,
      skip,
      take,
    });
  }

  listOrganizationOptions(): Promise<CampaignOrganizationOption[]> {
    return this.repo.listOrganizationOptions();
  }

  async getCampaignDetail(
    campaignId: string,
    start: Date,
    end: Date,
  ): Promise<BackofficeCampaignDetail> {
    const [
      campaign,
      metrics,
      daily,
      hourly,
      dispositions,
      agents,
      leadsByStatus,
      lists,
      members,
      retryRules,
    ] = await Promise.all([
      this.repo.getConfig(campaignId),
      this.repo.getMetrics(campaignId, start, end),
      this.repo.getDaily(campaignId, start, end),
      this.repo.getHourly(campaignId, start, end),
      this.repo.getDispositions(campaignId, start, end),
      this.repo.getAgents(campaignId, start, end),
      this.repo.getLeadsByStatus(campaignId),
      this.repo.getLists(campaignId),
      this.repo.getMembers(campaignId),
      this.repo.getRetryRules(campaignId),
    ]);

    return {
      range: { start: start.toISOString(), end: end.toISOString() },
      campaign,
      metrics,
      daily,
      hourly,
      dispositions,
      agents,
      leadsByStatus,
      lists,
      members,
      retryRules,
    };
  }

  listAttempts(input: {
    campaignId: string;
    start: Date;
    end: Date;
    page: number;
    pageSize: number;
  }): Promise<CampaignAttemptsResult> {
    const take = Math.min(Math.max(input.pageSize, 1), 100);
    const skip = Math.max(input.page - 1, 0) * take;
    return this.repo.listAttempts({
      campaignId: input.campaignId,
      start: input.start,
      end: input.end,
      skip,
      take,
    });
  }
}
