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

  constructor(
    private readonly retryRuleRepo: RetryRuleRepository,
    private readonly campaignLeadRepo: CampaignLeadRepository
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
    campaignDefaults: { maxAttempts: number; retryDelayMin: number }
  ): Promise<"retried" | "exhausted" | "no_rule"> {
    const rule = await this.retryRuleRepo.findByCampaignAndCategory(
      campaignId,
      dispositionCategory
    );

    const maxAttempts = rule?.maxAttempts ?? campaignDefaults.maxAttempts;
    const delayMinutes = rule?.delayMinutes ?? campaignDefaults.retryDelayMin;
    const delayMultiplier = rule?.delayMultiplier ?? 1.0;

    if (currentAttempts >= maxAttempts) {
      await this.campaignLeadRepo.markAsDead(campaignLeadId);
      this.logger.debug(
        `Lead ${campaignLeadId} exhausted after ${currentAttempts} attempts`
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
      { nextCallAt, lockedBy: null, lockedAt: null }
    );

    this.logger.debug(
      `Lead ${campaignLeadId} scheduled for retry at ${nextCallAt.toISOString()} (delay: ${Math.round(backoffDelay)}min)`
    );
    return "retried";
  }

  /**
   * Process leads that are due for retry.
   * Called by the RetryScheduler background job.
   */
  async processRetryQueue(): Promise<number> {
    const dueLeads = await this.campaignLeadRepo.findDueForRetry();
    let count = 0;
    for (const lead of dueLeads) {
      await this.campaignLeadRepo.updateStatus(
        lead.id,
        CampaignLeadStatus.queued,
        { lockedBy: null, lockedAt: null }
      );
      count++;
    }
    return count;
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
