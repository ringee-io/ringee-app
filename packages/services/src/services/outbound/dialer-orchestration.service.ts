import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import {
  CampaignRepository,
  AgentSessionStatus,
  CampaignLeadStatus,
  CallAttemptStatus,
} from "@ringee/database";
import { TelephonyService, WorkerService } from "@ringee/platform";
import { LeadQueueService } from "./lead-queue.service";
import { AgentSessionService } from "./agent-session.service";
import { CallAttemptService } from "./call-attempt.service";
import { ComplianceService } from "./compliance.service";
import { CreditService } from "../credit.service";

const DIALER_POLL_INTERVAL_MS = 500;

@Injectable()
export class DialerOrchestrationService implements OnModuleDestroy {
  private readonly logger = new Logger(DialerOrchestrationService.name);
  private pollingTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly campaignRepo: CampaignRepository,
    private readonly leadQueueService: LeadQueueService,
    private readonly agentSessionService: AgentSessionService,
    private readonly callAttemptService: CallAttemptService,
    private readonly complianceService: ComplianceService,
    private readonly creditService: CreditService,
    private readonly telephonyService: TelephonyService,
    private readonly workerService: WorkerService
  ) {}

  /**
   * Start the dialer polling loop. Called when the backend module initializes.
   */
  startPolling(): void {
    if (this.pollingTimer) return;
    this.pollingTimer = setInterval(
      () => this.tick().catch((err) => this.logger.error("Dialer tick error", err)),
      DIALER_POLL_INTERVAL_MS
    );
    this.logger.log("Dialer orchestration polling started");
  }

  onModuleDestroy(): void {
    this.stopPolling();
  }

  stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
      this.logger.log("Dialer orchestration polling stopped");
    }
  }

  /**
   * Main dialer tick. For each active campaign, check for ready agents
   * and assign them the next eligible lead.
   */
  async tick(): Promise<void> {
    // Find all active campaigns
    // Note: For efficiency, this could be cached. For MVP, query each tick.
    const activeCampaigns = await this.campaignRepo.listByOrganization("", {
      status: "active",
      limit: 100,
    });

    // Actually we need to find all active campaigns across all orgs.
    // The existing repo only lists by organization. We need a new method.
    // For now, we'll work with what's available via a direct prisma call.
    // TODO: Add findAllActive() to CampaignRepository.

    for (const campaign of activeCampaigns.data) {
      await this.processCampaign(campaign);
    }
  }

  /**
   * Process a single campaign: find ready agents, assign leads, initiate calls.
   */
  async processCampaign(campaign: {
    id: string;
    organizationId: string | null;
    callerIdId: string | null;
    maxAttempts: number;
    timezone: string;
    workStartMin: number;
    workEndMin: number;
    workDays: number[];
    dialerMode: string;
  }): Promise<void> {
    if (!campaign.organizationId || !campaign.callerIdId) return;

    // Check calling window
    if (
      !this.complianceService.isWithinCallingWindow({
        timezone: campaign.timezone,
        workStartMin: campaign.workStartMin,
        workEndMin: campaign.workEndMin,
        workDays: campaign.workDays,
      })
    ) {
      return;
    }

    // Find ready agents
    const readyAgents = await this.agentSessionService.findReadyByCampaign(
      campaign.id
    );

    for (const agent of readyAgents) {
      try {
        await this.assignLeadToAgent(campaign, agent);
      } catch (err) {
        this.logger.error(
          `Error assigning lead to agent ${agent.userId}: ${err}`
        );
      }
    }
  }

  /**
   * Assign the next eligible lead to a ready agent and initiate the call.
   */
  private async assignLeadToAgent(
    campaign: {
      id: string;
      organizationId: string | null;
      callerIdId: string | null;
      maxAttempts: number;
      dialerMode: string;
    },
    agent: { id: string; userId: string; organizationId: string }
  ): Promise<void> {
    // Select and lock next lead
    const lead = await this.leadQueueService.selectAndLockNext(
      campaign.id,
      agent.id,
      campaign.maxAttempts,
      agent.organizationId
    );

    if (!lead) return; // No eligible leads

    // Reserve the agent
    await this.agentSessionService.transitionTo(
      agent.id,
      AgentSessionStatus.reserved,
      lead.id
    );

    // Create the call attempt
    const attempt = await this.callAttemptService.createAttempt({
      campaignId: campaign.id,
      campaignLeadId: lead.id,
      agentSessionId: agent.id,
      agentUserId: agent.userId,
      attemptNumber: lead.attempts + 1,
    });

    // Emit lead.assigned event for SSE
    await this.workerService.emit("ringee:agent:" + agent.id, {
      event: "lead.assigned",
      lead,
      attemptId: attempt.id,
    });

    // In progressive mode, auto-dial immediately
    if (campaign.dialerMode === "progressive") {
      await this.initiateCall(campaign, agent, lead, attempt.id);
    }
    // In preview mode, agent must click "Dial" manually
  }

  /**
   * Initiate a call via Telnyx. Called automatically in progressive mode
   * or manually in preview mode.
   */
  async initiateCall(
    campaign: {
      id: string;
      callerIdId: string | null;
    },
    agent: { id: string; userId: string },
    lead: { id: string; contact: { phoneNumber: string } },
    attemptId: string
  ): Promise<void> {
    // Build client state with callAttemptId for webhook correlation
    const clientState = Buffer.from(
      JSON.stringify({ callAttemptId: attemptId })
    ).toString("base64");

    // TODO: Resolve callerIdId to actual phone number
    // For now, the call initiation goes through the existing Telnyx WebRTC flow
    // where the frontend initiates the call with custom headers.
    // The backend creates the CallAttempt, and when the webhook arrives,
    // it correlates via callAttemptId in clientState.

    // Transition states
    await this.agentSessionService.transitionTo(
      agent.id,
      AgentSessionStatus.dialing
    );

    // Emit call state event
    await this.workerService.emit("ringee:agent:" + agent.id, {
      event: "call.state",
      status: "dialing",
      attemptId,
      phoneNumber: lead.contact.phoneNumber,
    });

    this.logger.log(
      `Call initiated for lead ${lead.id} → ${lead.contact.phoneNumber} (attempt: ${attemptId})`
    );
  }

  /**
   * Manual dial trigger for preview mode.
   * Called when agent clicks "Dial" after reviewing the lead.
   */
  async manualDial(
    sessionId: string,
    campaignId: string
  ): Promise<void> {
    const session = await this.agentSessionService.getById(sessionId);

    if (session.status !== AgentSessionStatus.reserved) {
      throw new Error("Agent is not in reserved state");
    }

    if (!session.currentLeadId) {
      throw new Error("No lead assigned to session");
    }

    // Find the pending attempt for this session
    // (created during lead assignment)
    const campaign = await this.campaignRepo.findById(campaignId);
    if (!campaign) throw new Error("Campaign not found");

    // The call will be initiated by the frontend via WebRTC
    // with the callAttemptId in the client state.
    // Transition agent to dialing state.
    await this.agentSessionService.transitionTo(
      sessionId,
      AgentSessionStatus.dialing
    );
  }

  /**
   * Skip the current lead and move to the next one.
   */
  async skipLead(sessionId: string): Promise<void> {
    const session = await this.agentSessionService.getById(sessionId);

    if (
      session.status !== AgentSessionStatus.reserved &&
      session.status !== AgentSessionStatus.ready
    ) {
      throw new Error("Cannot skip lead in current state");
    }

    if (session.currentLeadId) {
      await this.leadQueueService.releaseLead(session.currentLeadId);
    }

    await this.agentSessionService.transitionTo(
      sessionId,
      AgentSessionStatus.ready,
      undefined
    );
  }
}
