import {
  forwardRef,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  CallbackTaskRepository,
  AiVoiceAgentCallRepository,
  CampaignLeadRepository,
  CampaignRepository,
  CallbackStatus,
  CampaignLeadStatus,
  ReminderSubjectType,
} from "@ringee/database";
import { ReminderService } from "../reminders/reminder.service";
import { ContactRepository } from "@ringee/database";
import { CustomIntegrationOutboundService } from "../custom-integrations/custom-integration-outbound.service";
import { buildCallbackEventData } from "../custom-integrations/custom-integration-event-builders";
import { VoiceAgentCallService } from "../voice-agents/voice-agent-call.service";

@Injectable()
export class CallbackService {
  private readonly logger = new Logger(CallbackService.name);

  constructor(
    private readonly callbackRepo: CallbackTaskRepository,
    private readonly campaignLeadRepo: CampaignLeadRepository,
    private readonly campaignRepo: CampaignRepository,
    @Inject(forwardRef(() => ReminderService))
    private readonly reminderService: ReminderService,
    private readonly contactRepo: ContactRepository,
    private readonly customIntegrationOutbound: CustomIntegrationOutboundService,
    private readonly agentCalls: AiVoiceAgentCallRepository,
    private readonly voiceAgentCalls: VoiceAgentCallService,
  ) {}

  private async enqueueCallbackCreated(callback: {
    id: string;
    userId: string;
    organizationId: string | null;
    contactId: string;
    scheduledAt: Date;
    status: CallbackStatus;
    createdAt: Date;
    note: string | null;
  }) {
    const contact = await this.contactRepo
      .findById(callback.contactId)
      .catch(() => null);
    void this.customIntegrationOutbound.enqueue({
      ctx: { userId: callback.userId, organizationId: callback.organizationId },
      eventEnum: "callback_created",
      subjectId: callback.id,
      data: buildCallbackEventData(callback as any, contact),
    });
  }

  /**
   * Best-effort reminder scheduling. Never blocks callback creation if
   * the reminder subsystem misbehaves.
   */
  private async scheduleReminders(
    userId: string,
    organizationId: string | null,
    callbackId: string,
    scheduledAt: Date,
  ) {
    try {
      await this.reminderService.scheduleForSubject({
        subjectType: ReminderSubjectType.callback,
        subjectId: callbackId,
        userId,
        organizationId,
        fireAt: scheduledAt,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to schedule reminders for callback ${callbackId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Schedule a callback originating from a campaign lead. Transitions the
   * lead to `scheduled` so the dialer skips it until the callback fires.
   * Use this from CallAttempt disposition handlers.
   */
  async scheduleFromCampaign(data: {
    campaignLeadId: string;
    userId: string;
    scheduledAt: Date;
    note?: string;
  }) {
    const lead = await this.campaignLeadRepo.findByIdWithContact(
      data.campaignLeadId,
    );
    if (!lead) throw new NotFoundException("Campaign lead not found");

    const campaign = await this.campaignRepo.findById(lead.campaignId);

    const callback = await this.callbackRepo.create({
      userId: data.userId,
      organizationId: campaign?.organizationId ?? null,
      contactId: lead.contactId,
      campaignLeadId: data.campaignLeadId,
      scheduledAt: data.scheduledAt,
      note: data.note,
    });

    await this.campaignLeadRepo.updateStatus(
      data.campaignLeadId,
      CampaignLeadStatus.scheduled,
      { lockedBy: null, lockedAt: null },
    );

    await this.scheduleReminders(
      data.userId,
      campaign?.organizationId ?? null,
      callback.id,
      data.scheduledAt,
    );

    this.logger.debug(
      `Campaign callback scheduled for lead ${data.campaignLeadId} at ${data.scheduledAt.toISOString()}`,
    );

    await this.enqueueCallbackCreated(callback);
    return callback;
  }

  /**
   * Schedule a callback directly against a contact, optionally linked to a
   * call (e.g. from the post-call flow). Works in freelancer and org modes.
   * Does NOT touch CampaignLead state — this path is independent of campaigns.
   */
  async scheduleFromContact(data: {
    userId: string;
    organizationId?: string | null;
    contactId: string;
    callId?: string | null;
    scheduledAt: Date;
    note?: string;
  }) {
    const callback = await this.callbackRepo.create({
      userId: data.userId,
      organizationId: data.organizationId ?? null,
      contactId: data.contactId,
      callId: data.callId ?? null,
      scheduledAt: data.scheduledAt,
      note: data.note,
    });

    await this.scheduleReminders(
      data.userId,
      data.organizationId ?? null,
      callback.id,
      data.scheduledAt,
    );

    this.logger.debug(
      `Standalone callback ${callback.id} scheduled for contact ${data.contactId} at ${data.scheduledAt.toISOString()}`,
    );

    await this.enqueueCallbackCreated(callback);
    return callback;
  }

  /**
   * Schedule one replay-safe callback from a live AI voice-agent conversation.
   *
   * The source agent-call UUID is also the callback UUID. They live in separate
   * tables, and the deterministic key gives provider retries a database-backed
   * idempotency marker without adding another public identifier or schema field.
   */
  async scheduleFromVoiceAgent(data: {
    agentCallId: string;
    userId: string;
    organizationId: string | null;
    contactId: string;
    callId: string;
    scheduledAt: Date;
    note?: string;
  }) {
    const { callback, created } = await this.callbackRepo.createOnce({
      id: data.agentCallId,
      userId: data.userId,
      organizationId: data.organizationId,
      contactId: data.contactId,
      callId: data.callId,
      scheduledAt: data.scheduledAt,
      note: data.note,
    });

    // A same-id row can only be accepted as this tool's prior write. This also
    // fails closed if seeded/test data ever reuses an id across the two tables.
    if (
      callback.userId !== data.userId ||
      callback.organizationId !== data.organizationId ||
      callback.contactId !== data.contactId ||
      callback.callId !== data.callId
    ) {
      throw new ConflictException("Callback id is already in use");
    }

    if (created) {
      await this.scheduleReminders(
        data.userId,
        data.organizationId,
        callback.id,
        data.scheduledAt,
      );
      await this.enqueueCallbackCreated(callback);
      this.logger.debug(
        `AI voice-agent callback ${callback.id} scheduled at ${data.scheduledAt.toISOString()}`,
      );
    }

    return callback;
  }

  async listForOwner(
    owner: { userId: string; organizationId?: string | null },
    options?: {
      status?: CallbackStatus;
      page?: number;
      limit?: number;
      userId?: string;
      scheduledFrom?: Date;
      scheduledTo?: Date;
    },
  ) {
    return this.callbackRepo.listForOwner(owner, options);
  }

  /**
   * Find a callback by id but only if it's visible to the given owner.
   * Throws NotFoundException otherwise (used by controllers for authz).
   */
  async findOwnedById(
    id: string,
    owner: { userId: string; organizationId?: string | null },
  ) {
    const callback = await this.callbackRepo.findById(id);
    if (!callback) throw new NotFoundException("Callback not found");

    const visible = owner.organizationId
      ? callback.organizationId === owner.organizationId
      : callback.organizationId === null && callback.userId === owner.userId;

    if (!visible) throw new NotFoundException("Callback not found");
    return callback;
  }

  async cancel(id: string) {
    const callback = await this.callbackRepo.findById(id);
    if (!callback) throw new NotFoundException("Callback not found");

    const updated = await this.callbackRepo.updateStatus(
      id,
      CallbackStatus.cancelled,
    );
    await this.silentlyCancelReminders(id);
    return updated;
  }

  async reschedule(id: string, scheduledAt: Date) {
    const callback = await this.callbackRepo.findById(id);
    if (!callback) throw new NotFoundException("Callback not found");

    const updated = await this.callbackRepo.update(id, {
      scheduledAt,
      status: CallbackStatus.scheduled,
    });

    try {
      await this.reminderService.rescheduleForSubject({
        subjectType: ReminderSubjectType.callback,
        subjectId: id,
        userId: callback.userId,
        organizationId: callback.organizationId,
        fireAt: scheduledAt,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to reschedule reminders for callback ${id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return updated;
  }

  private async silentlyCancelReminders(callbackId: string) {
    try {
      await this.reminderService.cancelForSubject(
        ReminderSubjectType.callback,
        callbackId,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to cancel reminders for callback ${callbackId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Process callbacks that are due. Called by the CallbackScheduler worker.
   * For campaign-bound callbacks, transitions the lead back to queued with
   * high priority so the dialer picks it up. Voice-agent callbacks place the
   * follow-up call after an atomic claim; other standalone callbacks just flip
   * to `due` — the user is notified via reminder.
   */
  async processDueCallbacks(): Promise<number> {
    const dueCallbacks = await this.callbackRepo.findDue();
    let count = 0;

    for (const callback of dueCallbacks) {
      const sourceAgentCall = callback.callId
        ? await this.agentCalls.findByCallId(callback.callId)
        : null;

      // Only callbacks created by the live-agent tool reuse the source call's
      // UUID. A human may also schedule a reminder from an AI call; that remains
      // a human callback and must not unexpectedly place an automated call.
      if (
        sourceAgentCall &&
        callback.id === sourceAgentCall.id &&
        callback.userId === sourceAgentCall.userId &&
        callback.organizationId === sourceAgentCall.organizationId
      ) {
        const claimed = await this.callbackRepo.claimScheduled(callback.id);
        if (!claimed) continue;

        try {
          await this.voiceAgentCalls.startCall(
            {
              userId: sourceAgentCall.userId,
              organizationId: sourceAgentCall.organizationId,
            },
            sourceAgentCall.agentId,
            {
              to: sourceAgentCall.toNumber,
              variables: this.stringRecord(sourceAgentCall.variables),
              metadata: this.objectRecord(sourceAgentCall.metadata),
            },
          );
          await this.callbackRepo.updateStatus(
            callback.id,
            CallbackStatus.completed,
            new Date(),
          );
          count++;
          this.logger.debug(
            `AI voice-agent callback ${callback.id} placed successfully`,
          );
        } catch (error) {
          // The CAS above guarantees at-most-once dialing. A policy failure
          // (DNC, no balance, disabled agent) is terminal for this scheduled
          // callback and must not become a call every minute forever.
          await this.callbackRepo.updateStatus(
            callback.id,
            CallbackStatus.missed,
          );
          count++;
          this.logger.warn(
            `AI voice-agent callback ${callback.id} could not be placed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        continue;
      }

      const due = await this.callbackRepo.markDueIfScheduled(callback.id);
      if (!due) continue;

      if (callback.campaignLeadId) {
        await this.campaignLeadRepo.updateStatus(
          callback.campaignLeadId,
          CampaignLeadStatus.queued,
          { priority: 10, lockedBy: null, lockedAt: null },
        );
      }

      count++;
      this.logger.debug(`Callback ${callback.id} is now due`);
    }

    return count;
  }

  private stringRecord(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  }

  private objectRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  async markCompleted(id: string) {
    const updated = await this.callbackRepo.updateStatus(
      id,
      CallbackStatus.completed,
      new Date(),
    );
    await this.silentlyCancelReminders(id);
    return updated;
  }
}
