import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  RetryRuleRepository,
  CampaignLeadRepository,
  CampaignLeadStatus,
  DispositionCategory,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import { CampaignService } from "../campaign.service";

@Injectable()
export class RetryEngine {
  private readonly logger = new Logger(RetryEngine.name);

  /** A lead locked longer than this is treated as an orphaned lock. */
  private static readonly STALE_LOCK_MS = 5 * 60_000; // 5 minutes

  constructor(
    private readonly retryRuleRepo: RetryRuleRepository,
    private readonly campaignLeadRepo: CampaignLeadRepository,
    private readonly campaigns: CampaignService,
  ) {}

  /**
   * Evaluate whether a lead should be retried based on the disposition category
   * and campaign retry rules. If eligible, compute nextCallAt and transition
   * the lead back to 'queued' status. If max attempts reached, mark 'exhausted'.
   */
  async evaluateRetry(
    campaignId: string,
    campaignLeadId: string,
    dispositionCategory: DispositionCategory,
    currentAttempts: number,
    campaignDefaults: { maxAttempts: number; retryDelayMin: number },
  ): Promise<"retried" | "exhausted" | "no_rule"> {
    const rule = await this.retryRuleRepo.findByCampaignAndCategory(
      campaignId,
      dispositionCategory,
    );

    const maxAttempts = rule?.maxAttempts ?? campaignDefaults.maxAttempts;
    const delayMinutes = rule?.delayMinutes ?? campaignDefaults.retryDelayMin;
    const delayMultiplier = rule?.delayMultiplier ?? 1.0;

    if (currentAttempts >= maxAttempts) {
      await this.campaignLeadRepo.markAsDead(campaignLeadId);
      this.logger.debug(
        `Lead ${campaignLeadId} exhausted after ${currentAttempts} attempts`,
      );
      return "exhausted";
    }

    // Compute retry delay with exponential backoff
    const backoffDelay =
      delayMinutes * Math.pow(delayMultiplier, currentAttempts - 1);
    const nextCallAt = new Date(Date.now() + backoffDelay * 60 * 1000);

    await this.campaignLeadRepo.updateStatus(
      campaignLeadId,
      CampaignLeadStatus.queued,
      { nextCallAt, lockedBy: null, lockedAt: null },
    );

    this.logger.debug(
      `Lead ${campaignLeadId} scheduled for retry at ${nextCallAt.toISOString()} (delay: ${Math.round(backoffDelay)}min)`,
    );
    return "retried";
  }

  /**
   * Recover orphaned locks. Run periodically by the worker's RetryScheduler.
   *
   * Retries are scheduled eagerly by {@link evaluateRetry} (which sets the lead
   * back to `queued` with a future `nextCallAt`, then picked up by
   * `lockNextLead`), so no background promotion is needed for them. This sweep
   * only returns leads that have been stuck in `locked` for longer than
   * STALE_LOCK_MS — e.g. a session that died mid-lock before placing the call —
   * back to the queue so they aren't lost.
   */
  async processRetryQueue(): Promise<number> {
    return this.campaignLeadRepo.requeueStaleLocked(RetryEngine.STALE_LOCK_MS);
  }

  /** The campaign's rules, once the caller may read the campaign. */
  async listRules(
    ctx: OwnershipContext,
    campaignId: string,
    options?: { requireMembershipForUserId?: string },
  ) {
    await this.campaigns.getCampaignById(ctx, campaignId, options);
    return this.retryRuleRepo.findByCampaign(campaignId);
  }

  async upsertRule(
    ctx: OwnershipContext,
    campaignId: string,
    data: {
      dispositionCategory: DispositionCategory;
      maxAttempts: number;
      delayMinutes: number;
      delayMultiplier?: number;
    },
  ) {
    await this.campaigns.getCampaignById(ctx, campaignId);
    return this.retryRuleRepo.upsert({
      campaignId,
      dispositionCategory: data.dispositionCategory,
      maxAttempts: data.maxAttempts,
      delayMinutes: data.delayMinutes,
      delayMultiplier: data.delayMultiplier,
    });
  }

  /** Deletes one of the campaign's rules; another campaign's reads as missing. */
  async deleteRule(ctx: OwnershipContext, campaignId: string, id: string) {
    await this.campaigns.getCampaignById(ctx, campaignId);
    const rule = await this.retryRuleRepo.findForCampaign(campaignId, id);
    if (!rule) throw new NotFoundException("Retry rule not found");
    return this.retryRuleRepo.delete(rule.id);
  }
}
