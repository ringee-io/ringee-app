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
  NumberPurchasedRepository,
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
  numberPurchasedId?: string;
  /** Owned numbers this campaign rotates among (when rotation is enabled). */
  rotationNumberIds?: string[];
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
  numberPurchasedId?: string | null;
  /** Owned numbers this campaign rotates among (when rotation is enabled). */
  rotationNumberIds?: string[];
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
    private readonly numberPurchasedRepo: NumberPurchasedRepository,
    private readonly dispositionService: DispositionService,
    private readonly leadQueueService: LeadQueueService,
  ) {}

  private ensureOrganization(ctx: OwnershipContext): void {
    if (!ctx.organizationId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
  }

  /**
   * Ensure the purchased number being assigned to a campaign exists and belongs
   * to the caller's organization. Returns silently when no id is provided.
   */
  private async ensureNumberPurchasedOwnership(
    ctx: OwnershipContext,
    numberPurchasedId?: string | null,
  ): Promise<void> {
    if (!numberPurchasedId) return;
    const number = await this.numberPurchasedRepo.findById(numberPurchasedId);
    if (!number) {
      throw new NotFoundException("Phone number not found");
    }
    if (number.organizationId !== ctx.organizationId) {
      throw new ForbiddenException(
        "Phone number does not belong to your organization",
      );
    }
  }

  /**
   * Ensure every number chosen for a campaign's rotation subset belongs to the
   * caller's organization. Verified caller IDs and purchased DIDs both qualify.
   */
  private async ensureNumbersOwnership(
    ctx: OwnershipContext,
    ids?: string[],
  ): Promise<void> {
    if (!ids || ids.length === 0) return;
    for (const id of ids) {
      const number = await this.numberPurchasedRepo.findById(id);
      if (!number || number.organizationId !== ctx.organizationId) {
        throw new ForbiddenException(
          "A selected number does not belong to your organization",
        );
      }
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
    dto: CreateCampaignFullDto,
  ): Promise<Campaign> {
    this.ensureOrganization(ctx);
    await this.ensureNumberPurchasedOwnership(ctx, dto.numberPurchasedId);
    await this.ensureNumbersOwnership(ctx, dto.rotationNumberIds);

    const campaign = await this.campaignRepo.create(
      ctx.userId,
      ctx.organizationId!,
      { name: dto.name, description: dto.description },
    );

    // Apply additional settings if provided
    if (
      dto.dialerMode ||
      dto.callerIdId ||
      dto.numberPurchasedId ||
      dto.rotationNumberIds ||
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
    dto: UpdateCampaignSettingsDto,
  ): Promise<Campaign> {
    this.ensureOrganization(ctx);
    const campaign = await this.getCampaignWithAuth(ctx, campaignId);
    await this.ensureNumberPurchasedOwnership(ctx, dto.numberPurchasedId);
    await this.ensureNumbersOwnership(ctx, dto.rotationNumberIds);

    if (campaign.status !== "draft" && campaign.status !== "paused") {
      // Only allow limited changes on active campaigns
      const allowedWhileActive = [
        "name",
        "description",
        "callerIdId",
        "numberPurchasedId",
        "rotationNumberIds",
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
        (k) => !allowedWhileActive.includes(k) && (dto as any)[k] !== undefined,
      );
      if (disallowed.length > 0) {
        throw new BadRequestException(
          `Cannot change ${disallowed.join(", ")} while campaign is active`,
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
    newStatus: string,
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
        `Cannot transition from ${campaign.status} to ${newStatus}`,
      );
    }

    // Validation for activating
    if (newStatus === "active") {
      const leadCount = campaign._count?.leads ?? 0;
      if (leadCount === 0) {
        throw new BadRequestException(
          "Campaign must have at least 1 lead to activate",
        );
      }

      const dispositions =
        await this.dispositionRepo.findByCampaign(campaignId);
      if (dispositions.length === 0) {
        throw new BadRequestException(
          "Campaign must have at least 1 disposition configured",
        );
      }

      // A caller ID is optional: the campaign can dial from an explicitly
      // assigned purchased number, a caller ID, or — failing those — any of the
      // organization's purchased numbers. Activation only requires that *some*
      // number can be resolved.
      if (!campaign.numberPurchasedId && !campaign.callerIdId) {
        const purchasedNumber = await this.numberPurchasedRepo.findOne({
          organizationId: ctx.organizationId,
          status: { in: ["active", "assigned"] },
        });
        if (!purchasedNumber) {
          throw new BadRequestException(
            "Campaign must have a phone number or caller ID to dial from",
          );
        }
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
    data: { name: string; description?: string; source?: string },
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
