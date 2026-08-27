import { Injectable, Logger } from "@nestjs/common";
import {
  CampaignLeadRepository,
  CampaignLeadWithFullContact,
} from "@ringee/database";

@Injectable()
export class LeadQueueService {
  private readonly logger = new Logger(LeadQueueService.name);

  constructor(private readonly campaignLeadRepo: CampaignLeadRepository) {}

  /**
   * Select and atomically lock the next eligible lead for a campaign.
   * Uses SELECT FOR UPDATE SKIP LOCKED to prevent double-assignment.
   */
  async selectAndLockNext(
    campaignId: string,
    agentSessionId: string,
    maxAttempts: number,
    organizationId: string,
  ): Promise<CampaignLeadWithFullContact | null> {
    const lead = await this.campaignLeadRepo.lockNextLead(
      campaignId,
      agentSessionId,
      maxAttempts,
      organizationId,
    );

    if (lead) {
      this.logger.debug(
        `Locked lead ${lead.id} (contact: ${lead.contact.phoneNumber}) for session ${agentSessionId}`,
      );
    }

    return lead;
  }

  /**
   * Get a lead by ID with contact info.
   */
  async getLeadById(id: string) {
    return this.campaignLeadRepo.findByIdWithContact(id);
  }

  /**
   * Release a locked lead back to the queue.
   */
  async releaseLead(leadId: string): Promise<void> {
    await this.campaignLeadRepo.releaseLock(leadId);
    this.logger.debug(`Released lead ${leadId} back to queue`);
  }

  /**
   * Queue all pending leads when a campaign starts.
   */
  async queueAllPending(campaignId: string): Promise<number> {
    const count = await this.campaignLeadRepo.queueAllPending(campaignId);
    this.logger.log(`Queued ${count} leads for campaign ${campaignId}`);
    return count;
  }
}
