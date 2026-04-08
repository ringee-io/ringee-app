import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  CallAttemptRepository,
  CampaignLeadRepository,
  CallAttemptStatus,
  CampaignLeadStatus,
} from "@ringee/database";
import { AgentSessionService } from "./agent-session.service";
import { DispositionService } from "./disposition.service";
import { RetryEngine } from "./retry-engine.service";
import { CallbackService } from "./callback.service";
import { ComplianceService } from "./compliance.service";
import { SSEBridgeService } from "./sse-bridge.service";
import { AgentSessionStatus } from "@ringee/database";

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
    callId: string
  ): Promise<void> {
    const attempt = await this.attemptRepo.findById(callAttemptId);
    if (!attempt) {
      this.logger.warn(`CallAttempt ${callAttemptId} not found`);
      return;
    }

    switch (eventType) {
      case "call.initiated":
        if (!attempt.callId) {
          await this.attemptRepo.linkCall(callAttemptId, callId);
        }
        break;

      case "call.answered":
        await this.attemptRepo.updateStatus(
          callAttemptId,
          CallAttemptStatus.answered,
          { answeredAt: new Date() }
        );
        await this.campaignLeadRepo.updateStatus(
          attempt.campaignLeadId,
          CampaignLeadStatus.in_call
        );
        if (attempt.agentSessionId) {
          await this.agentSessionService.transitionTo(
            attempt.agentSessionId,
            AgentSessionStatus.in_call
          );
          await this.agentSessionService.incrementStats(
            attempt.agentSessionId,
            { callsConnected: 1 }
          );
          this.sseBridge.emit(`agent:${attempt.agentSessionId}`, "call.state", {
            status: "in_call",
            attemptId: callAttemptId,
          });
        }
        break;

      case "call.hangup":
        await this.attemptRepo.updateStatus(
          callAttemptId,
          CallAttemptStatus.ended,
          { endedAt: new Date() }
        );

        // Increment lead attempts
        await this.campaignLeadRepo.incrementAttempt(attempt.campaignLeadId);
        await this.campaignLeadRepo.updateStatus(
          attempt.campaignLeadId,
          CampaignLeadStatus.wrap_up
        );

        if (attempt.agentSessionId) {
          await this.agentSessionService.transitionTo(
            attempt.agentSessionId,
            AgentSessionStatus.wrap_up
          );
          await this.agentSessionService.incrementStats(
            attempt.agentSessionId,
            { callsAttempted: 1 }
          );

          // Load dispositions and emit disposition.required via SSE
          const dispositions = await this.dispositionService.listByCampaign(
            attempt.campaignId
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
            }
          );
          this.sseBridge.emit(`agent:${attempt.agentSessionId}`, "session.state", {
            status: "wrap_up",
          });
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
      data.dispositionId
    );

    // WebRTC calls are placed from the frontend, so the backend never receives
    // Telnyx webhooks that would transition the attempt through its lifecycle.
    // Ensure the attempt is in 'ended' state before applying the disposition.
    const current = await this.attemptRepo.findById(data.callAttemptId);
    if (!current) {
      throw new NotFoundException("Call attempt not found");
    }
    if (current.status !== CallAttemptStatus.ended && current.status !== CallAttemptStatus.dispositioned) {
      await this.attemptRepo.updateStatus(
        data.callAttemptId,
        CallAttemptStatus.ended,
        { endedAt: new Date() }
      );
      // Also ensure the lead is in wrap_up
      await this.campaignLeadRepo.updateStatus(
        current.campaignLeadId,
        CampaignLeadStatus.wrap_up
      );
      // Increment lead attempts if not yet done
      await this.campaignLeadRepo.incrementAttempt(current.campaignLeadId);
    }

    const attempt = await this.attemptRepo.setDisposition(
      data.callAttemptId,
      {
        dispositionId: data.dispositionId,
        dispositionCode: disposition.code,
        dispositionNote: data.note,
      }
    );

    if (!attempt) {
      throw new NotFoundException(
        "Call attempt not in valid state for disposition"
      );
    }

    const lead = await this.campaignLeadRepo.findByCampaign(
      attempt.campaignId,
      { limit: 1 }
    );

    // Mark lead as dispositioned first
    await this.campaignLeadRepo.updateStatus(
      attempt.campaignLeadId,
      CampaignLeadStatus.dispositioned
    );

    let action = "dispositioned";

    // Process disposition workflow triggers
    if (disposition.triggersCompletion) {
      await this.campaignLeadRepo.updateStatus(
        attempt.campaignLeadId,
        CampaignLeadStatus.completed
      );
      action = "completed";
    } else if (disposition.triggersDnc) {
      await this.campaignLeadRepo.updateStatus(
        attempt.campaignLeadId,
        CampaignLeadStatus.dnc
      );
      // Add to DNC list
      const leadData = await this.attemptRepo.findByIdWithRelations(
        data.callAttemptId
      );
      if (leadData) {
        await this.complianceService.addToDNC({
          phoneNumber: leadData.campaignLead.contact.phoneNumber,
          organizationId: data.organizationId,
          reason: `Disposition: ${disposition.label}`,
          source: "disposition",
        });
      }
      action = "dnc";
    } else if (
      disposition.triggersCallback &&
      data.callback?.scheduledAt
    ) {
      await this.callbackService.schedule({
        campaignLeadId: attempt.campaignLeadId,
        agentUserId: attempt.agentUserId,
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
        data.campaignDefaults
      );
      action = retryResult;
    } else {
      // No trigger — check if max attempts reached
      if (attempt.attemptNumber >= data.campaignDefaults.maxAttempts) {
        await this.campaignLeadRepo.markAsDead(attempt.campaignLeadId);
        action = "exhausted";
      }
    }

    // Transition agent back to ready
    if (attempt.agentSessionId) {
      await this.agentSessionService.transitionTo(
        attempt.agentSessionId,
        AgentSessionStatus.ready,
        undefined
      );
    }

    this.logger.log(
      `Disposition '${disposition.code}' submitted for attempt ${data.callAttemptId}, action: ${action}`
    );

    return { action };
  }

  async getAttemptById(attemptId: string) {
    return this.attemptRepo.findById(attemptId);
  }

  async getAttemptHistory(campaignLeadId: string) {
    return this.attemptRepo.findByCampaignLead(campaignLeadId);
  }
}
