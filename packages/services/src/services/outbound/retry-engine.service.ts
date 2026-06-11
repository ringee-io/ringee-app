import { Injectable, Logger } from "@nestjs/common";
import {
  RetryRuleRepository,
  CampaignLeadRepository,
  CampaignLeadStatus,
  DispositionCategory,
} from "@ringee/database";

@Injectable()
export class RetryEngine {
  private readonly logger = new Logger(RetryEngine.name);

  /** A lead locked longer than this is treated as an orphaned lock. */
  private static readonly STALE_LOCK_MS = 5 * 60_000; // 5 minutes

  constructor(
    private readonly retryRuleRepo: RetryRuleRepository,
    private readonly campaignLeadRepo: CampaignLeadRepository,
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

  async listRules(campaignId: string) {
    return this.retryRuleRepo.findByCampaign(campaignId);
  }

  async upsertRule(data: {
    campaignId: string;
    dispositionCategory: DispositionCategory;
    maxAttempts: number;
    delayMinutes: number;
    delayMultiplier?: number;
  }) {
    return this.retryRuleRepo.upsert(data);
  }

  async deleteRule(id: string) {
    return this.retryRuleRepo.delete(id);
  }
}
