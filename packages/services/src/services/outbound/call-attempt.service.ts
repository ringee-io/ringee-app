import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  CallAttemptRepository,
  CallOutcome,
  CallRepository,
  CampaignLeadRepository,
  CallAttemptStatus,
  CampaignLeadStatus,
  Disposition,
} from "@ringee/database";
import { AgentSessionService } from "./agent-session.service";
import { DispositionService } from "./disposition.service";
import { RetryEngine } from "./retry-engine.service";
import { CallbackService } from "./callback.service";
import { ComplianceService } from "./compliance.service";
import { SSEBridgeService } from "./sse-bridge.service";
import { AgentSessionStatus } from "@ringee/database";
import { CrmCallLogService } from "../crm/crm-call-log.service";
import { PipelineFanoutService } from "../ai-pipeline";

@Injectable()
export class CallAttemptService {
  private readonly logger = new Logger(CallAttemptService.name);

  constructor(
    private readonly attemptRepo: CallAttemptRepository,
    private readonly campaignLeadRepo: CampaignLeadRepository,
    private readonly agentSessionService: AgentSessionService,
    private readonly dispositionService: DispositionService,
    private readonly retryEngine: RetryEngine,
    private readonly callbackService: CallbackService,
    private readonly complianceService: ComplianceService,
    private readonly sseBridge: SSEBridgeService,
    private readonly callRepo: CallRepository,
    private readonly crmCallLog: CrmCallLogService,
    private readonly pipelineFanout: PipelineFanoutService,
  ) {}

  async createAttempt(data: {
    campaignId: string;
    campaignLeadId: string;
    agentSessionId: string;
    agentUserId: string;
    attemptNumber: number;
  }) {
    return this.attemptRepo.create(data);
  }

  async linkCall(attemptId: string, callId: string) {
    return this.attemptRepo.linkCall(attemptId, callId);
  }

  /**
   * Handle webhook events for campaign calls.
   * Called by CallService when it detects a callAttemptId in clientState.
   */
  async handleWebhookEvent(
    callAttemptId: string,
    eventType: string,
    callId: string,
  ): Promise<void> {
    const attempt = await this.attemptRepo.findById(callAttemptId);
    if (!attempt) {
      this.logger.warn(`CallAttempt ${callAttemptId} not found`);
      return;
    }

    // Once an attempt has been dispositioned (or already ended), it is final.
    // Ignore late or duplicate lifecycle webhooks so they can't double-count
    // stats or knock a finished lead back into wrap_up.
    const isFinalized =
      attempt.status === CallAttemptStatus.dispositioned ||
      attempt.status === CallAttemptStatus.ended;

    switch (eventType) {
      case "call.initiated":
        if (!attempt.callId) {
          await this.attemptRepo.linkCall(callAttemptId, callId);
        }
        break;

      case "call.answered":
        if (isFinalized || attempt.status === CallAttemptStatus.answered) {
          break;
        }
        await this.attemptRepo.updateStatus(
          callAttemptId,
          CallAttemptStatus.answered,
          { answeredAt: new Date() },
        );
        await this.campaignLeadRepo.updateStatus(
          attempt.campaignLeadId,
          CampaignLeadStatus.in_call,
        );
        if (attempt.agentSessionId) {
          await this.agentSessionService.transitionTo(
            attempt.agentSessionId,
            AgentSessionStatus.in_call,
          );
          await this.agentSessionService.incrementStats(
            attempt.agentSessionId,
            { callsConnected: 1 },
          );
          this.sseBridge.emit(`agent:${attempt.agentSessionId}`, "call.state", {
            status: "in_call",
            attemptId: callAttemptId,
          });
        }
        break;

      case "call.hangup":
        if (isFinalized) {
          break;
        }
        await this.attemptRepo.updateStatus(
          callAttemptId,
          CallAttemptStatus.ended,
          { endedAt: new Date() },
        );

        // Increment lead attempts
        await this.campaignLeadRepo.incrementAttempt(attempt.campaignLeadId);
        await this.campaignLeadRepo.updateStatus(
          attempt.campaignLeadId,
          CampaignLeadStatus.wrap_up,
        );

        if (attempt.agentSessionId) {
          await this.agentSessionService.transitionTo(
            attempt.agentSessionId,
            AgentSessionStatus.wrap_up,
          );
          await this.agentSessionService.incrementStats(
            attempt.agentSessionId,
            { callsAttempted: 1 },
          );

          // Load dispositions and emit disposition.required via SSE
          const dispositions = await this.dispositionService.listByCampaign(
            attempt.campaignId,
          );
          this.sseBridge.emit(`agent:${attempt.agentSessionId}`, "call.state", {
            status: "ended",
            attemptId: callAttemptId,
          });
          this.sseBridge.emit(
            `agent:${attempt.agentSessionId}`,
            "disposition.required",
            {
              callAttemptId,
              dispositions: dispositions.map((d) => ({
                id: d.id,
                code: d.code,
                label: d.label,
                category: d.category,
                color: d.color,
                triggersCallback: d.triggersCallback,
              })),
            },
          );
          this.sseBridge.emit(
            `agent:${attempt.agentSessionId}`,
            "session.state",
            {
              status: "wrap_up",
            },
          );
        }
        break;
    }
  }

  /**
   * Submit a disposition for a call attempt.
   * Triggers the appropriate workflow based on disposition flags.
   */
  async submitDisposition(data: {
    callAttemptId: string;
    dispositionId: string;
    note?: string;
    callback?: { scheduledAt: Date; note?: string };
    campaignDefaults: { maxAttempts: number; retryDelayMin: number };
    organizationId: string;
  }): Promise<{ action: string }> {
    const disposition = await this.dispositionService.getById(
      data.dispositionId,
    );

    // WebRTC calls are placed from the frontend, so the backend never receives
    // Telnyx webhooks that would transition the attempt through its lifecycle.
    // Ensure the attempt is in 'ended' state before applying the disposition.
    const current = await this.attemptRepo.findById(data.callAttemptId);
    if (!current) {
      throw new NotFoundException("Call attempt not found");
    }
    if (
      current.status !== CallAttemptStatus.ended &&
      current.status !== CallAttemptStatus.dispositioned
    ) {
      await this.attemptRepo.updateStatus(
        data.callAttemptId,
        CallAttemptStatus.ended,
        { endedAt: new Date() },
      );
      // Also ensure the lead is in wrap_up
      await this.campaignLeadRepo.updateStatus(
        current.campaignLeadId,
        CampaignLeadStatus.wrap_up,
      );
      // Increment lead attempts if not yet done
      await this.campaignLeadRepo.incrementAttempt(current.campaignLeadId);
    }

    const attempt = await this.attemptRepo.setDisposition(data.callAttemptId, {
      dispositionId: data.dispositionId,
      dispositionCode: disposition.code,
      dispositionNote: data.note,
    });

    if (!attempt) {
      throw new NotFoundException(
        "Call attempt not in valid state for disposition",
      );
    }

    // Mark lead as dispositioned first
    await this.campaignLeadRepo.updateStatus(
      attempt.campaignLeadId,
      CampaignLeadStatus.dispositioned,
    );

    let action = "dispositioned";

    // Process disposition workflow triggers
    if (disposition.triggersCompletion) {
      await this.campaignLeadRepo.updateStatus(
        attempt.campaignLeadId,
        CampaignLeadStatus.completed,
      );
      action = "completed";
    } else if (disposition.triggersDnc) {
      await this.campaignLeadRepo.updateStatus(
        attempt.campaignLeadId,
        CampaignLeadStatus.dnc,
      );
      // Add to DNC list
      const leadData = await this.attemptRepo.findByIdWithRelations(
        data.callAttemptId,
      );
      if (leadData) {
        await this.complianceService.addToDNC({
          phoneNumber: leadData.campaignLead.contact.phoneNumber,
          userId: attempt.agentUserId,
          organizationId: data.organizationId,
          reason: `Disposition: ${disposition.label}`,
          source: "disposition",
          addedByUserId: attempt.agentUserId,
        });
      }
      action = "dnc";
    } else if (disposition.triggersCallback && data.callback?.scheduledAt) {
      await this.callbackService.scheduleFromCampaign({
        campaignLeadId: attempt.campaignLeadId,
        userId: attempt.agentUserId,
        scheduledAt: data.callback.scheduledAt,
        note: data.callback.note,
      });
      action = "callback_scheduled";
    } else if (disposition.triggersRetry) {
      const retryResult = await this.retryEngine.evaluateRetry(
        attempt.campaignId,
        attempt.campaignLeadId,
        disposition.category,
        attempt.attemptNumber,
        data.campaignDefaults,
      );
      action = retryResult;
    } else {
      // No workflow trigger (e.g. the default "Not Interested"): the agent
      // handled the lead and it should not be dialed again. Mark it terminal so
      // it leaves the queue and the campaign can auto-complete — exhausted if no
      // attempts remain, otherwise completed. (Previously such leads were left
      // stuck in `dispositioned`, never re-queued nor terminal, which blocked
      // campaign auto-completion indefinitely.)
      if (attempt.attemptNumber >= data.campaignDefaults.maxAttempts) {
        await this.campaignLeadRepo.markAsDead(attempt.campaignLeadId);
        action = "exhausted";
      } else {
        await this.campaignLeadRepo.updateStatus(
          attempt.campaignLeadId,
          CampaignLeadStatus.completed,
        );
        action = "completed";
      }
    }

    // Transition agent back to ready and clear the finished lead reference.
    if (attempt.agentSessionId) {
      await this.agentSessionService.transitionTo(
        attempt.agentSessionId,
        AgentSessionStatus.ready,
        null,
      );
    }

    // Persist the disposition on the linked Call and push the CRM call-log
    // note immediately — this request is the only thing that fires the note
    // for campaign calls; without it the notes never left the attempt row.
    const callId = attempt.callId ?? current.callId;
    if (callId) {
      await this.applyDispositionToCall(callId, disposition, data.note);
    }

    this.logger.log(
      `Disposition '${disposition.code}' submitted for attempt ${data.callAttemptId}, action: ${action}`,
    );

    return { action };
  }

  /**
   * Mirror a campaign disposition onto the Call row (system codes map 1:1 to
   * the CallOutcome enum; custom codes keep the note only) and fold it into
   * the CRM call-log note right away. Best-effort — a CRM/DB hiccup must never
   * fail the disposition submit.
   */
  private async applyDispositionToCall(
    callId: string,
    disposition: Disposition,
    note?: string,
  ): Promise<void> {
    const mappedOutcome = (Object.values(CallOutcome) as string[]).includes(
      disposition.code,
    )
      ? (disposition.code as CallOutcome)
      : null;

    let outcomePersisted = false;
    try {
      if (mappedOutcome) {
        await this.callRepo.updateOutcome(callId, mappedOutcome, note);
        outcomePersisted = true;
      } else if (note) {
        await this.callRepo.updateOutcomeNote(callId, note);
      }
    } catch (err) {
      this.logger.warn(
        `could not persist disposition on call ${callId}: ${(err as Error).message}`,
      );
    }

    // AI Pipeline: campaign dispositions are the campaign dialer's canonical
    // outcome-write path, so feed the finalized call into its campaign context.
    if (outcomePersisted) {
      this.pipelineFanout.handleCallFinalized(callId);
    }

    void this.crmCallLog
      .enqueueOutcomeUpdate(callId, {
        fallbackOutcomeLabel: mappedOutcome ? null : disposition.label,
      })
      .catch((err: Error) =>
        this.logger.warn(
          `crm outcome update failed for call ${callId}: ${err.message}`,
        ),
      );
  }

  async getAttemptById(attemptId: string) {
    return this.attemptRepo.findById(attemptId);
  }

  async getAttemptHistory(campaignLeadId: string) {
    return this.attemptRepo.findByCampaignLead(campaignLeadId);
  }
}
