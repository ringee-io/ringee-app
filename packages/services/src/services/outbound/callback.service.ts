import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  CallbackTaskRepository,
  CampaignLeadRepository,
  CallbackStatus,
  CampaignLeadStatus,
} from "@ringee/database";

@Injectable()
export class CallbackService {
  private readonly logger = new Logger(CallbackService.name);

  constructor(
    private readonly callbackRepo: CallbackTaskRepository,
    private readonly campaignLeadRepo: CampaignLeadRepository
  ) {}

  async schedule(data: {
    campaignLeadId: string;
    agentUserId: string;
    scheduledAt: Date;
    note?: string;
  }) {
    const callback = await this.callbackRepo.create(data);

    // Transition lead to scheduled status
    await this.campaignLeadRepo.updateStatus(
      data.campaignLeadId,
      CampaignLeadStatus.scheduled,
      { lockedBy: null, lockedAt: null }
    );

    this.logger.debug(
      `Callback scheduled for lead ${data.campaignLeadId} at ${data.scheduledAt.toISOString()}`
    );

    return callback;
  }

  async listByAgent(
    agentUserId: string,
    options?: { status?: CallbackStatus; page?: number; limit?: number }
  ) {
    return this.callbackRepo.findByAgent(agentUserId, options);
  }

  async cancel(id: string) {
    const callback = await this.callbackRepo.findById(id);
    if (!callback) throw new NotFoundException("Callback not found");

    return this.callbackRepo.updateStatus(id, CallbackStatus.cancelled);
  }

  async reschedule(id: string, scheduledAt: Date) {
    const callback = await this.callbackRepo.findById(id);
    if (!callback) throw new NotFoundException("Callback not found");

    return this.callbackRepo.update(id, {
      scheduledAt,
      status: CallbackStatus.scheduled,
    });
  }

  /**
   * Process callbacks that are due. Called by the CallbackScheduler background job.
   * Transitions leads to queued with high priority.
   */
  async processDueCallbacks(): Promise<number> {
    const dueCallbacks = await this.callbackRepo.findDue();
    let count = 0;

    for (const callback of dueCallbacks) {
      await this.callbackRepo.updateStatus(callback.id, CallbackStatus.due);

      // Transition lead to queued with high priority
      await this.campaignLeadRepo.updateStatus(
        callback.campaignLeadId,
        CampaignLeadStatus.queued,
        { priority: 10, lockedBy: null, lockedAt: null }
      );

      count++;
      this.logger.debug(`Callback ${callback.id} is now due`);
    }

    return count;
  }

  async markCompleted(id: string) {
    return this.callbackRepo.updateStatus(
      id,
      CallbackStatus.completed,
      new Date()
    );
  }
}
