import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import {
  CampaignRepository,
  CallerIdRepository,
  AgentSessionStatus,
  CampaignLeadStatus,
} from "@ringee/database";
import { TelephonyService } from "@ringee/platform";
import { LeadQueueService } from "./lead-queue.service";
import { AgentSessionService } from "./agent-session.service";
import { CallAttemptService } from "./call-attempt.service";
import { ComplianceService } from "./compliance.service";
import { SSEBridgeService } from "./sse-bridge.service";
import { DispositionService } from "./disposition.service";

const DIALER_POLL_INTERVAL_MS = 500;

@Injectable()
export class DialerOrchestrationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DialerOrchestrationService.name);
  private pollingTimer: NodeJS.Timeout | null = null;
  private lastWindowLog: number | null = null;

  constructor(
    private readonly campaignRepo: CampaignRepository,
    private readonly callerIdRepo: CallerIdRepository,
    private readonly leadQueueService: LeadQueueService,
    private readonly agentSessionService: AgentSessionService,
    private readonly callAttemptService: CallAttemptService,
    private readonly complianceService: ComplianceService,
    private readonly telephonyService: TelephonyService,
    private readonly sseBridge: SSEBridgeService,
    private readonly dispositionService: DispositionService,
  ) {}

  onModuleInit(): void {
    this.startPolling();
  }

  onModuleDestroy(): void {
    this.stopPolling();
  }

  startPolling(): void {
    if (this.pollingTimer) return;
    this.pollingTimer = setInterval(
      () => this.tick().catch((err) => this.logger.error("Dialer tick error", err)),
      DIALER_POLL_INTERVAL_MS
    );
    this.logger.log("Dialer orchestration polling started");
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
    const activeCampaigns = await this.campaignRepo.findAllActive();

    for (const campaign of activeCampaigns) {
      try {
        await this.processCampaign(campaign);
      } catch (err) {
        this.logger.error(`Error processing campaign ${campaign.id}:`, err);
      }
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
    if (!campaign.organizationId) return;

    // Check calling window — log but don't silently skip
    if (
      !this.complianceService.isWithinCallingWindow({
        timezone: campaign.timezone,
        workStartMin: campaign.workStartMin,
        workEndMin: campaign.workEndMin,
        workDays: campaign.workDays,
      })
    ) {
      // Only log once per minute to avoid spam (use a simple throttle)
      const now = Date.now();
      if (!this.lastWindowLog || now - this.lastWindowLog > 60_000) {
        this.lastWindowLog = now;
        this.logger.warn(
          `Campaign ${campaign.id} outside calling window (${campaign.timezone} ${campaign.workStartMin}-${campaign.workEndMin})`
        );
      }
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

    if (!lead) {
      this.logger.debug(`No eligible leads for agent ${agent.userId} in campaign ${campaign.id}`);
      return;
    }

    this.logger.log(
      `Assigning lead ${lead.id} (${lead.contact?.phoneNumber}) to agent ${agent.userId}`
    );

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

    // Get attempt history for this lead
    const history = await this.callAttemptService.getAttemptHistory(lead.id);

    // Load dispositions for the campaign (for the disposition panel)
    const dispositions = await this.dispositionService.listByCampaign(campaign.id);

    // Emit lead.assigned event via SSE bridge
    this.sseBridge.emit(`agent:${agent.id}`, "lead.assigned", {
      id: lead.id,
      campaignLeadId: lead.id,
      contact: lead.contact,
      attempts: lead.attempts,
      priority: lead.priority,
      attemptId: attempt.id,
      history: history.map((h: any) => ({
        attemptNumber: h.attemptNumber,
        dispositionCode: h.dispositionCode,
        endedAt: h.endedAt,
        durationSec: h.durationSec,
      })),
      dispositions: dispositions.map((d: any) => ({
        id: d.id,
        code: d.code,
        label: d.label,
        category: d.category,
        color: d.color,
        triggersCallback: d.triggersCallback,
      })),
    });

    // In progressive mode, auto-dial immediately
    if (campaign.dialerMode === "progressive") {
      await this.initiateCall(campaign, agent, lead, attempt.id);
    } else {
      // Preview mode — emit session state so frontend shows the lead + Dial button
      this.sseBridge.emit(`agent:${agent.id}`, "session.state", {
        status: "reserved",
      });
    }
  }

  /**
   * Initiate a call via Telnyx WebRTC.
   * Resolves the campaign caller ID and tells the frontend to place the call.
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
    // Resolve caller ID phone number
    let callerIdNumber: string | null = null;
    if (campaign.callerIdId) {
      const callerId = await this.callerIdRepo.findById(campaign.callerIdId);
      callerIdNumber = callerId?.phoneNumber ?? null;
    }

    // Transition states
    await this.agentSessionService.transitionTo(
      agent.id,
      AgentSessionStatus.dialing
    );

    // Emit call.initiate event — frontend uses this to place the WebRTC call
    this.sseBridge.emit(`agent:${agent.id}`, "call.initiate", {
      attemptId,
      phoneNumber: lead.contact.phoneNumber,
      callerIdNumber,
    });

    this.logger.log(
      `Call initiated for lead ${lead.id} → ${lead.contact.phoneNumber} (attempt: ${attemptId}, callerId: ${callerIdNumber})`
    );
  }

  /**
   * Manual dial trigger for preview mode.
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

    const campaign = await this.campaignRepo.findById(campaignId);
    if (!campaign) throw new Error("Campaign not found");

    // Resolve caller ID
    let callerIdNumber: string | null = null;
    if (campaign.callerIdId) {
      const callerId = await this.callerIdRepo.findById(campaign.callerIdId);
      callerIdNumber = callerId?.phoneNumber ?? null;
    }

    // Get the lead's phone number
    const lead = await this.leadQueueService.getLeadById(session.currentLeadId);

    // Find the current attempt for this lead
    const attempts = await this.callAttemptService.getAttemptHistory(session.currentLeadId);
    const latestAttempt = attempts[0];

    await this.agentSessionService.transitionTo(
      sessionId,
      AgentSessionStatus.dialing
    );

    this.sseBridge.emit(`agent:${sessionId}`, "call.initiate", {
      attemptId: latestAttempt?.id,
      phoneNumber: lead?.contact?.phoneNumber,
      callerIdNumber,
    });
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

    this.sseBridge.emit(`agent:${sessionId}`, "session.state", {
      status: "ready",
    });
  }
}
