import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import {
  CampaignRepository,
  CampaignLeadRepository,
  CampaignListRepository,
  DispositionRepository,
  Campaign,
  DialerMode,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import { DispositionService } from "./disposition.service";
import { LeadQueueService } from "./lead-queue.service";

export interface CreateCampaignFullDto {
  name: string;
  description?: string;
  dialerMode?: DialerMode;
  callerIdId?: string;
  maxAttempts?: number;
  timezone?: string;
  workStartMin?: number;
  workEndMin?: number;
  workDays?: number[];
  wrapUpTimeSec?: number;
  retryDelayMin?: number;
}

export interface UpdateCampaignSettingsDto {
  name?: string;
  description?: string;
  dialerMode?: DialerMode;
  callerIdId?: string;
  maxAttempts?: number;
  timezone?: string;
  workStartMin?: number;
  workEndMin?: number;
  workDays?: number[];
  wrapUpTimeSec?: number;
  retryDelayMin?: number;
}

@Injectable()
export class CampaignConfigService {
  constructor(
    private readonly campaignRepo: CampaignRepository,
    private readonly campaignLeadRepo: CampaignLeadRepository,
    private readonly campaignListRepo: CampaignListRepository,
    private readonly dispositionRepo: DispositionRepository,
    private readonly dispositionService: DispositionService,
    private readonly leadQueueService: LeadQueueService
  ) {}

  private ensureOrganization(ctx: OwnershipContext): void {
    if (!ctx.organizationId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
  }

  private async getCampaignWithAuth(ctx: OwnershipContext, id: string) {
    const campaign = await this.campaignRepo.findById(id);
    if (!campaign) throw new NotFoundException("Campaign not found");
    if (campaign.organizationId !== ctx.organizationId) {
      throw new ForbiddenException("Access denied");
    }
    return campaign;
  }

  async createCampaign(
    ctx: OwnershipContext,
    dto: CreateCampaignFullDto
  ): Promise<Campaign> {
    this.ensureOrganization(ctx);

    const campaign = await this.campaignRepo.create(
      ctx.userId,
      ctx.organizationId!,
      { name: dto.name, description: dto.description }
    );

    // Apply additional settings if provided
    if (
      dto.dialerMode ||
      dto.callerIdId ||
      dto.maxAttempts ||
      dto.timezone ||
      dto.workStartMin !== undefined ||
      dto.workEndMin !== undefined ||
      dto.workDays ||
      dto.wrapUpTimeSec !== undefined ||
      dto.retryDelayMin !== undefined
    ) {
      const { name: _n, description: _d, ...settings } = dto;
      await this.campaignRepo.update(campaign.id, settings);
    }

    // Seed default dispositions
    await this.dispositionService.seedDefaults(campaign.id);

    return (await this.campaignRepo.findById(campaign.id))!;
  }

  async updateSettings(
    ctx: OwnershipContext,
    campaignId: string,
    dto: UpdateCampaignSettingsDto
  ): Promise<Campaign> {
    this.ensureOrganization(ctx);
    const campaign = await this.getCampaignWithAuth(ctx, campaignId);

    if (campaign.status !== "draft" && campaign.status !== "paused") {
      // Only allow limited changes on active campaigns
      const allowedWhileActive = [
        "name",
        "description",
        "callerIdId",
        "wrapUpTimeSec",
        "maxAttempts",
        "timezone",
        "workStartMin",
        "workEndMin",
        "workDays",
        "retryDelayMin",
      ];
      const attemptedChanges = Object.keys(dto);
      const disallowed = attemptedChanges.filter(
        (k) => !allowedWhileActive.includes(k) && (dto as any)[k] !== undefined
      );
      if (disallowed.length > 0) {
        throw new BadRequestException(
          `Cannot change ${disallowed.join(", ")} while campaign is active`
        );
      }
    }

    return this.campaignRepo.update(campaignId, dto);
  }

  /**
   * Transition campaign status with validation.
   */
  async transitionStatus(
    ctx: OwnershipContext,
    campaignId: string,
    newStatus: string
  ): Promise<Campaign> {
    this.ensureOrganization(ctx);
    const campaign = await this.getCampaignWithAuth(ctx, campaignId);

    // Validate transition
    const validTransitions: Record<string, string[]> = {
      draft: ["active"],
      active: ["paused", "completed"],
      paused: ["active", "completed"],
      completed: [],
    };

    const allowed = validTransitions[campaign.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${campaign.status} to ${newStatus}`
      );
    }

    // Validation for activating
    if (newStatus === "active") {
      const leadCount = campaign._count?.leads ?? 0;
      if (leadCount === 0) {
        throw new BadRequestException(
          "Campaign must have at least 1 lead to activate"
        );
      }

      const dispositions = await this.dispositionRepo.findByCampaign(
        campaignId
      );
      if (dispositions.length === 0) {
        throw new BadRequestException(
          "Campaign must have at least 1 disposition configured"
        );
      }

      if (!campaign.callerIdId) {
        throw new BadRequestException(
          "Campaign must have a caller ID assigned"
        );
      }

      // Queue all pending leads
      await this.leadQueueService.queueAllPending(campaignId);
    }

    return this.campaignRepo.updateStatus(campaignId, newStatus);
  }

  async deleteCampaign(ctx: OwnershipContext, campaignId: string) {
    this.ensureOrganization(ctx);
    const campaign = await this.getCampaignWithAuth(ctx, campaignId);

    if (campaign.status !== "draft") {
      throw new BadRequestException("Can only delete draft campaigns");
    }

    return this.campaignRepo.delete(campaignId);
  }

  // List management
  async createList(
    ctx: OwnershipContext,
    campaignId: string,
    data: { name: string; description?: string; source?: string }
  ) {
    this.ensureOrganization(ctx);
    await this.getCampaignWithAuth(ctx, campaignId);
    return this.campaignListRepo.create({ campaignId, ...data });
  }

  async listLists(ctx: OwnershipContext, campaignId: string) {
    this.ensureOrganization(ctx);
    await this.getCampaignWithAuth(ctx, campaignId);
    return this.campaignListRepo.findByCampaignWithCounts(campaignId);
  }

  async deleteList(ctx: OwnershipContext, campaignId: string, listId: string) {
    this.ensureOrganization(ctx);
    await this.getCampaignWithAuth(ctx, campaignId);
    return this.campaignListRepo.delete(listId);
  }
}
