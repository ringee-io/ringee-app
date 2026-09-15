import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from "@nestjs/common";
import {
  AgentSessionStatus,
  CallAttemptStatus,
  CampaignRepository,
  NumberPurchasedRepository,
} from "@ringee/database";
import { TelephonyService, type OwnershipContext } from "@ringee/platform";
import { LeadQueueService } from "./lead-queue.service";
import { AgentSessionService } from "./agent-session.service";
import {
  CallAttemptService,
  campaignDialDeviceId,
  type UndialedOutcome,
} from "./call-attempt.service";
import { ComplianceService } from "./compliance.service";
import { SSEBridgeService } from "./sse-bridge.service";
import { DispositionService } from "./disposition.service";
import {
  CallerIdRotationService,
  RotationReason,
  type RotationReasonValue,
} from "../caller-id-rotation/caller-id-rotation.service";
import { ConcurrentCallGuardService } from "../security";
import { UserService } from "../user.service";
import { CreditService } from "../credit.service";

const DIALER_POLL_INTERVAL_MS = 500;

/**
 * After a dial is refused and the agent is returned to `ready`, the poller
 * leaves that agent alone this long. The condition that refused them is almost
 * always still true on the next tick, 500ms later, and each spin used to lock a
 * lead, create an attempt and raise the same alert again.
 */
const REFUSED_DIAL_COOLDOWN_MS = 5_000;

/**
 * A lead that cannot be dialed for want of a caller ID goes back behind the
 * rest of the queue for this long. Released as it was, it is the very lead the
 * next tick picks again.
 */
const UNDIALABLE_LEAD_DEFER_MS = 15 * 60_000;

/**
 * How long a dial the browser was told to place may go without the provider
 * reporting its leg. Generous on purpose — a first call can wait on the
 * microphone permission prompt — because it only has to catch a dial that is
 * never going to happen: an event lost while the browser was reconnecting, a
 * tab that died mid-dial, a client that could not report its own failure.
 */
const STALLED_DIAL_MS = 90_000;
const STALLED_DIAL_SWEEP_EVERY_MS = 10_000;

/** What the agent is told when their browser could not place the call. */
const ABANDONED_DIAL_MESSAGES: Record<string, string> = {
  line_not_connected:
    "Your phone line isn't connected, so the call wasn't placed. Dialing is paused — resume once the line is back.",
  already_on_call:
    "A call is still up in this tab, so the next lead wasn't dialed. Dialing is paused.",
  microphone_unavailable:
    "The microphone isn't available, so the call wasn't placed. Allow microphone access, then resume.",
  cancelled:
    "The call was cancelled before it connected. Dialing is paused — resume when you're ready.",
  dial_failed:
    "The call couldn't be placed. Dialing is paused — resume to try again.",
};

type RefusalReason =
  | "CALLING_DISABLED"
  | "NO_CREDIT"
  | "CONCURRENT_CALL"
  | "NO_CALLER_ID"
  | "CALLER_ID_UNAVAILABLE";

interface DialRefusal {
  reason: RefusalReason;
  message: string;
  /** Where the agent goes. */
  to: UndialedOutcome;
  /** The lead itself is what cannot be dialed — push it back in the queue. */
  deferLead?: boolean;
}

type DialGate =
  | { allowed: true; callerIdNumber: string }
  | { allowed: false; refusal: DialRefusal };

interface DialerCampaign {
  id: string;
  organizationId: string | null;
  callerIdId: string | null;
  numberPurchasedId: string | null;
  rotationNumberIds?: string[] | null;
  maxAttempts: number;
  dialerMode: string;
}

interface DialerAgent {
  id: string;
  userId: string;
  organizationId: string;
}

interface DialerLead {
  id: string;
  attempts: number;
  priority: number;
  metadata?: unknown;
  contact: { phoneNumber: string };
}

/** Copy for a caller-ID refusal, and whether it is the lead's fault. */
function callerIdRefusal(reason: RotationReasonValue): DialRefusal {
  switch (reason) {
    case RotationReason.ALL_OVER_CAP:
      return {
        reason: "NO_CALLER_ID",
        message:
          "Every caller ID for this destination reached today's cap. The lead was moved back in the queue.",
        to: AgentSessionStatus.ready,
        deferLead: true,
      };
    case RotationReason.DISABLED:
      // Rotation is off and the campaign's number is not one this agent may
      // present. Nothing about the next lead changes that.
      return {
        reason: "NO_CALLER_ID",
        message:
          "No caller ID is available to you for this campaign. Ask an admin to assign you a number, then resume.",
        to: AgentSessionStatus.paused,
      };
    default:
      return {
        reason: "NO_CALLER_ID",
        message:
          "No caller ID is available for this destination's country. Add a number for it.",
        to: AgentSessionStatus.ready,
        deferLead: true,
      };
  }
}

@Injectable()
export class DialerOrchestrationService implements OnModuleDestroy {
  private readonly logger = new Logger(DialerOrchestrationService.name);
  private pollingTimer: NodeJS.Timeout | null = null;
  private lastWindowLog: number | null = null;
  private tickInFlight = false;
  private lastStalledDialSweepAt = 0;
  /** Agent session id → epoch ms until which the poller skips that agent. */
  private readonly cooldownUntil = new Map<string, number>();

  constructor(
    private readonly campaignRepo: CampaignRepository,
    private readonly numberPurchasedRepo: NumberPurchasedRepository,
    private readonly leadQueueService: LeadQueueService,
    private readonly agentSessionService: AgentSessionService,
    private readonly callAttemptService: CallAttemptService,
    private readonly complianceService: ComplianceService,
    private readonly telephonyService: TelephonyService,
    private readonly sseBridge: SSEBridgeService,
    private readonly dispositionService: DispositionService,
    private readonly callerIdRotationService: CallerIdRotationService,
    private readonly concurrentCallGuard: ConcurrentCallGuardService,
    private readonly userService: UserService,
    private readonly creditService: CreditService,
  ) {}

  onModuleDestroy(): void {
    this.stopPolling();
  }

  /**
   * Start the dialer poll loop.
   *
   * IMPORTANT: this must run in the same process that serves the SSE endpoint
   * (the backend HTTP app), because lead assignments are pushed to agents via
   * the in-process {@link SSEBridgeService}. It is therefore started explicitly
   * from the backend's bootstrap (AppModule.onApplicationBootstrap) and NOT
   * from onModuleInit — otherwise the worker process (which also imports
   * ServicesModule) would poll and emit events that never reach SSE clients,
   * leaving the agent UI stuck on "Waiting for lead".
   */
  startPolling(): void {
    if (this.pollingTimer) return;
    this.pollingTimer = setInterval(
      () => void this.runTick(),
      DIALER_POLL_INTERVAL_MS,
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
   * One poll, never two at once.
   *
   * A tick routinely outlasts the 500ms interval — a liveness check against
   * the provider alone can take that long — and overlapping ticks both read
   * the same agent as `ready`. Each then locked a different lead and told the
   * browser to dial it: two legs at once, and the one-call-at-a-time backstop
   * hung one up the moment it rang. The atomic claim in
   * {@link assignLeadToAgent} is what holds that across API instances; this
   * guard is what stops one instance from racing itself.
   */
  private async runTick(): Promise<void> {
    if (this.tickInFlight) return;
    this.tickInFlight = true;
    try {
      await this.tick();
    } catch (err) {
      this.logger.error("Dialer tick error", err);
    } finally {
      this.tickInFlight = false;
    }
  }

  /**
   * Main dialer tick. For each active campaign, check for ready agents
   * and assign them the next eligible lead.
   */
  async tick(): Promise<void> {
    const activeCampaigns = await this.campaignRepo.findActiveForDialer();

    for (const campaign of activeCampaigns) {
      try {
        await this.processCampaign(campaign);
      } catch (err) {
        this.logger.error(`Error processing campaign ${campaign.id}:`, err);
      }
    }

    await this.sweepStalledDials().catch((err) =>
      this.logger.error("Stalled dial sweep failed", err),
    );
  }

  /**
   * Process a single campaign: find ready agents, assign leads, initiate calls.
   */
  async processCampaign(
    campaign: DialerCampaign & {
      timezone: string;
      workStartMin: number;
      workEndMin: number;
      workDays: number[];
    },
  ): Promise<void> {
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
          `Campaign ${campaign.id} outside calling window (${campaign.timezone} ${campaign.workStartMin}-${campaign.workEndMin})`,
        );
      }
      return;
    }

    // Find ready agents
    const readyAgents = await this.agentSessionService.findReadyByCampaign(
      campaign.id,
    );

    for (const agent of readyAgents) {
      if (this.isCoolingDown(agent.id)) continue;
      try {
        await this.assignLeadToAgent(campaign, agent);
      } catch (err) {
        this.logger.error(
          `Error assigning lead to agent ${agent.userId}: ${err}`,
        );
      }
    }
  }

  /**
   * Assign the next eligible lead to a ready agent and initiate the call.
   */
  private async assignLeadToAgent(
    campaign: DialerCampaign,
    agent: DialerAgent,
  ): Promise<void> {
    const progressive = campaign.dialerMode === "progressive";

    // Cheap pre-check BEFORE anything is locked or created: an agent who is
    // already on a call elsewhere cannot take a lead, and burning an attempt +
    // a lead lock on every poll tick while they talk would poison campaign
    // analytics. The authoritative (lease-acquiring) check still happens in
    // the dial gates.
    if (progressive) {
      const busy = await this.concurrentCallGuard
        .findOccupyingCall(agent.userId)
        .catch(() => null);
      if (busy) {
        this.logger.debug(
          `Agent ${agent.userId} is on call ${busy.id} — not assigning a lead this tick`,
        );
        return;
      }
    }

    // Select and lock next lead
    const lead = await this.leadQueueService.selectAndLockNext(
      campaign.id,
      agent.id,
      campaign.maxAttempts,
      agent.organizationId,
    );

    if (!lead) {
      this.logger.debug(
        `No eligible leads for agent ${agent.userId} in campaign ${campaign.id}`,
      );
      return;
    }

    // Claim the agent. Reading them as `ready` above proves nothing by now —
    // another tick or another API instance may have claimed them since — so
    // the move to `reserved` is the decision, and it is compare-and-set.
    if (!(await this.agentSessionService.claimForLead(agent.id, lead.id))) {
      this.logger.debug(
        `Agent ${agent.id} was claimed elsewhere — handing lead ${lead.id} back`,
      );
      await this.leadQueueService
        .releaseLead(lead.id, { lockedBy: agent.id })
        .catch((err) =>
          this.logger.warn(`Could not release lead ${lead.id}: ${err}`),
        );
      return;
    }

    this.logger.log(
      `Assigning lead ${lead.id} (${lead.contact?.phoneNumber}) to agent ${agent.userId}`,
    );

    // From the claim on, any failure has to hand the assignment back: nothing
    // times a `reserved` session out, so an error here used to leave the agent
    // waiting on a lead that would never be shown or dialed.
    let attemptId: string | null = null;
    let leaseHeld = false;
    try {
      if (!progressive) {
        // Preview mode — the agent reads the lead and presses Dial.
        attemptId = (await this.createAttempt(campaign, agent, lead)).id;
        await this.emitLeadAssigned(campaign, agent, lead, attemptId);
        this.sseBridge.emit(`agent:${agent.id}`, "session.state", {
          status: "reserved",
          attemptId,
        });
        return;
      }

      // Progressive: every gate runs BEFORE the attempt exists, so a refused
      // dial leaves nothing behind to count against the campaign.
      const gate = await this.checkDialGates(campaign, agent, lead);
      if (!gate.allowed) {
        await this.refuseDial(agent, lead, gate.refusal, null);
        return;
      }
      leaseHeld = true;

      attemptId = (await this.createAttempt(campaign, agent, lead)).id;
      await this.emitLeadAssigned(campaign, agent, lead, attemptId);
      await this.startDial(agent, lead, attemptId, gate.callerIdNumber);
    } catch (err) {
      this.logger.error(
        `Could not assign lead ${lead.id} to agent ${agent.id} — handing it back: ${err}`,
      );
      await this.callAttemptService
        .releaseUndialed({
          agentSessionId: agent.id,
          agentUserId: agent.userId,
          campaignLeadId: lead.id,
          attemptId,
          from: [AgentSessionStatus.reserved],
          to: AgentSessionStatus.ready,
          releaseLease: leaseHeld,
        })
        .catch((releaseErr) =>
          this.logger.error(
            `Could not hand lead ${lead.id} back from agent ${agent.id}: ${releaseErr}`,
          ),
        );
      this.startCooldown(agent.id);
    }
  }

  private async createAttempt(
    campaign: DialerCampaign,
    agent: DialerAgent,
    lead: DialerLead,
  ): Promise<{ id: string }> {
    return this.callAttemptService.createAttempt({
      campaignId: campaign.id,
      campaignLeadId: lead.id,
      agentSessionId: agent.id,
      agentUserId: agent.userId,
      attemptNumber: lead.attempts + 1,
    });
  }

  private async emitLeadAssigned(
    campaign: DialerCampaign,
    agent: DialerAgent,
    lead: DialerLead,
    attemptId: string,
  ): Promise<void> {
    // Get attempt history for this lead
    const history = await this.callAttemptService.getAttemptHistory(lead.id);

    // Load dispositions for the campaign (for the disposition panel)
    const dispositions = await this.dispositionService.listByCampaign(
      campaign.id,
    );

    // Emit lead.assigned event via SSE bridge. `contact` carries the full
    // briefing (CampaignLeadContact) and `metadata` whatever the import or the
    // list attached to this lead — the agent panel renders both, so a rep opens
    // a call already knowing who they are talking to.
    this.sseBridge.emit(`agent:${agent.id}`, "lead.assigned", {
      id: lead.id,
      campaignLeadId: lead.id,
      contact: lead.contact,
      metadata: lead.metadata ?? null,
      attempts: lead.attempts,
      priority: lead.priority,
      attemptId,
      history: history
        .filter((h: any) => h.id !== attemptId)
        .map((h: any) => ({
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
  }

  /**
   * Resolve the phone number to present as caller ID for a campaign.
   *
   * Priority: the campaign's explicitly assigned purchased number → a verified
   * caller ID → as a last resort, any of the organization's purchased numbers.
   * This keeps outbound dialing working even when no separate caller ID exists.
   */
  private async resolveCallerIdNumber(campaign: {
    callerIdId: string | null;
    numberPurchasedId: string | null;
    organizationId: string | null;
  }): Promise<string | null> {
    // 1. Number explicitly assigned to the campaign.
    if (campaign.numberPurchasedId) {
      const assigned = await this.numberPurchasedRepo.findById(
        campaign.numberPurchasedId,
      );
      if (assigned?.phoneNumber) return assigned.phoneNumber;
    }

    // 2. Verified caller ID (now stored in the NumberPurchased table).
    if (campaign.callerIdId) {
      const callerId = await this.numberPurchasedRepo.findById(
        campaign.callerIdId,
      );
      if (callerId?.phoneNumber) return callerId.phoneNumber;
    }

    // 3. Fall back to any of the organization's purchased numbers.
    if (campaign.organizationId) {
      const purchased = await this.numberPurchasedRepo.findOne({
        organizationId: campaign.organizationId,
        kind: "purchased",
        status: { in: ["active", "assigned"] },
      });
      if (purchased?.phoneNumber) return purchased.phoneNumber;
    }

    return null;
  }

  /**
   * Resolve the caller ID to present for one campaign dial, applying caller-ID
   * rotation when the workspace has it enabled. The campaign's fixed caller ID
   * (see {@link resolveCallerIdNumber}) is passed as the fallback so behavior is
   * unchanged when rotation is off. Caps and number health are respected across
   * the whole campaign because every lead flows through here.
   */
  private async resolveDialCallerId(
    campaign: {
      callerIdId: string | null;
      numberPurchasedId: string | null;
      organizationId: string | null;
      rotationNumberIds?: string[] | null;
    },
    agentUserId: string,
    destination: string,
  ): Promise<{ phoneNumber: string | null; reason: RotationReasonValue }> {
    const fixed = await this.resolveCallerIdNumber(campaign);
    const ctx = {
      userId: agentUserId,
      organizationId: campaign.organizationId,
    };
    const result = await this.callerIdRotationService.selectForDial(
      ctx,
      destination,
      { phoneNumber: fixed },
      { restrictToNumberIds: campaign.rotationNumberIds ?? undefined },
    );
    return { phoneNumber: result.phoneNumber, reason: result.reason };
  }

  /**
   * Every check a campaign dial has to pass, run before the browser is told to
   * place anything (CMP-008). Refusing here is what keeps a leg from being
   * placed only for the `call.initiated` backstop to tear it down.
   *
   * On success the caller holds the one-call-at-a-time lease and must give it
   * back if the dial does not go ahead.
   */
  private async checkDialGates(
    campaign: DialerCampaign,
    agent: DialerAgent,
    lead: DialerLead,
  ): Promise<DialGate> {
    const refuse = (refusal: DialRefusal): DialGate => ({
      allowed: false,
      refusal,
    });

    // Same enablement and credit rule as the backstop on `call.initiated`.
    const user = await this.userService.getCachedUserById(agent.userId);
    if (user?.canCall === false) {
      return refuse({
        reason: "CALLING_DISABLED",
        message: "Outbound calling is disabled for this user.",
        to: AgentSessionStatus.offline,
      });
    }
    if (!user?.freeCallTrial) {
      const balance = await this.creditService
        .getBalance({
          userId: agent.userId,
          organizationId: campaign.organizationId,
        })
        .catch(() => 0);
      if (balance <= 0) {
        return refuse({
          reason: "NO_CREDIT",
          message:
            "Your workspace is out of credit. Dialing is paused — top up, then resume.",
          to: AgentSessionStatus.paused,
        });
      }
    }

    // One call at a time per user, across every device. The agent may be on a
    // manual call from the web dialer, the extension or a desk phone — don't
    // push a campaign lead on top of it.
    const decision = await this.concurrentCallGuard.requestDial(agent.userId, {
      deviceId: campaignDialDeviceId(agent.id),
      deviceLabel: "a campaign session",
      source: "campaign",
    });
    if (!decision.allowed) {
      return refuse({
        reason: "CONCURRENT_CALL",
        message: decision.message,
        to: AgentSessionStatus.ready,
      });
    }

    // Resolve caller ID phone number (rotation-aware; falls back to the
    // campaign's fixed caller ID / purchased number when rotation is off).
    // No caller ID means the dialer refuses to place a call with a fabricated
    // CLI, so the dial is over — the slot goes straight back.
    let selection: { phoneNumber: string | null; reason: RotationReasonValue };
    try {
      selection = await this.resolveDialCallerId(
        campaign,
        agent.userId,
        lead.contact.phoneNumber,
      );
    } catch (err) {
      await this.releaseLease(agent);
      this.logger.warn(
        `Could not resolve a caller ID for agent ${agent.id} (lead ${lead.id}): ${err}`,
      );
      return refuse({
        reason: "CALLER_ID_UNAVAILABLE",
        message: "A caller ID could not be picked right now. Retrying shortly.",
        to: AgentSessionStatus.ready,
      });
    }
    if (!selection.phoneNumber) {
      await this.releaseLease(agent);
      return refuse(callerIdRefusal(selection.reason));
    }

    return { allowed: true, callerIdNumber: selection.phoneNumber };
  }

  /**
   * Undo an assignment the gates refused. The agent is told why, and ends up
   * where that reason puts them: straight back to `ready` (after a cooldown)
   * when the next lead may well be dialable, `paused` when nothing will change
   * until someone acts, `offline` when the account cannot call at all.
   */
  private async refuseDial(
    agent: DialerAgent,
    lead: DialerLead,
    refusal: DialRefusal,
    attemptId: string | null,
  ): Promise<void> {
    this.logger.warn(
      `Not dialing lead ${lead.id} for agent ${agent.id}: ${refusal.reason} — ${refusal.message}`,
    );
    await this.callAttemptService.releaseUndialed({
      agentSessionId: agent.id,
      agentUserId: agent.userId,
      campaignLeadId: lead.id,
      attemptId,
      from: [AgentSessionStatus.reserved],
      to: refusal.to,
      deferLeadUntil: refusal.deferLead
        ? new Date(Date.now() + UNDIALABLE_LEAD_DEFER_MS)
        : undefined,
      blocked: { reason: refusal.reason, message: refusal.message },
      offlineReason:
        refusal.to === AgentSessionStatus.offline
          ? "account_disabled"
          : undefined,
    });
    if (refusal.to === AgentSessionStatus.ready) {
      this.startCooldown(agent.id);
    }
  }

  /**
   * Tell the browser to place the call — if the agent is still reserved for
   * this very lead. Anything that moved them in the meantime (the session was
   * ended, or started again in another tab) means this dial must not happen.
   */
  private async startDial(
    agent: DialerAgent,
    lead: DialerLead,
    attemptId: string,
    callerIdNumber: string,
  ): Promise<void> {
    const marked = await this.callAttemptService
      .markDialing(attemptId)
      .catch((err) => {
        this.logger.error(
          `Could not mark attempt ${attemptId} dialing: ${err}`,
        );
        return false;
      });
    const moved =
      marked &&
      (await this.agentSessionService.transitionIf(
        agent.id,
        { from: [AgentSessionStatus.reserved], currentLeadId: lead.id },
        AgentSessionStatus.dialing,
      ));

    if (!moved) {
      this.logger.warn(
        `Agent ${agent.id} is no longer reserved for lead ${lead.id} — not placing the call`,
      );
      const released = await this.callAttemptService.releaseUndialed({
        agentSessionId: agent.id,
        agentUserId: agent.userId,
        campaignLeadId: lead.id,
        attemptId,
        from: [AgentSessionStatus.reserved],
        to: AgentSessionStatus.ready,
        releaseLease: true,
      });
      if (!released) {
        // The session left on its own; the lease this dial took and the
        // attempt nobody will dial are still ours to clean up.
        await this.releaseLease(agent);
        await this.callAttemptService
          .discardUndialed(attemptId)
          .catch(() => false);
      }
      this.startCooldown(agent.id);
      return;
    }

    this.sseBridge.emit(`agent:${agent.id}`, "session.state", {
      status: "dialing",
      attemptId,
    });
    // Emit call.initiate event — frontend uses this to place the WebRTC call
    this.sseBridge.emit(`agent:${agent.id}`, "call.initiate", {
      attemptId,
      phoneNumber: lead.contact.phoneNumber,
      callerIdNumber,
    });

    this.logger.log(
      `Call initiated for lead ${lead.id} → ${lead.contact.phoneNumber} (attempt: ${attemptId}, callerId: ${callerIdNumber})`,
    );
  }

  /**
   * Initiate a call via Telnyx WebRTC for an assignment that already has its
   * attempt — the preview Dial button. Runs the same gates as a progressive
   * dial before telling the frontend to place the call.
   */
  async initiateCall(
    campaign: DialerCampaign,
    agent: DialerAgent,
    lead: DialerLead,
    attemptId: string,
  ): Promise<void> {
    const gate = await this.checkDialGates(campaign, agent, lead);
    if (!gate.allowed) {
      await this.refuseDial(agent, lead, gate.refusal, attemptId);
      return;
    }
    await this.startDial(agent, lead, attemptId, gate.callerIdNumber);
  }

  /**
   * Manual dial trigger for preview mode.
   */
  async manualDial(
    ctx: OwnershipContext,
    sessionId: string,
    campaignId: string,
  ): Promise<void> {
    const session = await this.agentSessionService.getById(sessionId);

    if (
      session.userId !== ctx.userId ||
      session.organizationId !== ctx.organizationId
    ) {
      throw new ForbiddenException(
        "Agent session does not belong to this workspace",
      );
    }

    if (session.status !== AgentSessionStatus.reserved) {
      throw new Error("Agent is not in reserved state");
    }

    if (!session.currentLeadId) {
      throw new Error("No lead assigned to session");
    }
    if (session.campaignId !== campaignId) {
      throw new Error("Campaign does not match the agent session");
    }

    const campaign = await this.campaignRepo.findById(campaignId);
    if (!campaign) throw new Error("Campaign not found");

    // Get the lead's phone number
    const lead = await this.leadQueueService.getLeadById(session.currentLeadId);
    if (!lead?.contact?.phoneNumber || lead.campaignId !== campaignId) {
      throw new Error("No dialable lead in this campaign");
    }

    const attempt = await this.callAttemptService.findUndialedForSession(
      session.id,
      lead.id,
    );

    // A preview lead can sit on screen long enough for the orphaned-lock sweep
    // to hand it back to the queue — and to another agent. Dialing it now would
    // put two agents on the same prospect (CMP-003).
    if (lead.lockedBy !== session.id || !attempt) {
      await this.callAttemptService.releaseUndialed({
        agentSessionId: session.id,
        agentUserId: session.userId,
        campaignLeadId: lead.id,
        attemptId: attempt?.id ?? null,
        from: [AgentSessionStatus.reserved],
        to: AgentSessionStatus.ready,
      });
      throw new ConflictException(
        "This lead is no longer assigned to you. The next one is on its way.",
      );
    }

    // Preview and progressive modes share the same concurrency reservation,
    // rotation refusal, and assignment cleanup before emitting a dial.
    await this.initiateCall(campaign, session, lead, attempt.id);
  }

  /**
   * Skip the current lead and move to the next one.
   */
  async skipLead(sessionId: string): Promise<void> {
    const session = await this.agentSessionService.getById(sessionId);

    // Nothing is assigned yet — there is nothing to skip.
    if (session.status === AgentSessionStatus.ready) return;

    if (session.status !== AgentSessionStatus.reserved) {
      throw new Error("Cannot skip lead in current state");
    }
    if (!session.currentLeadId) return;

    const attempt = await this.callAttemptService.findUndialedForSession(
      session.id,
      session.currentLeadId,
    );
    await this.callAttemptService.releaseUndialed({
      agentSessionId: session.id,
      agentUserId: session.userId,
      campaignLeadId: session.currentLeadId,
      attemptId: attempt?.id ?? null,
      from: [AgentSessionStatus.reserved],
      to: AgentSessionStatus.ready,
      // Behind the leads not tried yet. Released as it was, the skipped lead is
      // the first one the next tick would hand straight back.
      deferLeadUntil: new Date(),
    });
  }

  /**
   * The browser could not place the call it was told to — its phone line was
   * not connected, the microphone was refused, the leg failed before the
   * provider acknowledged it. Before this existed nothing ever told the server,
   * and the agent sat in `dialing` for good.
   *
   * The session is paused, not returned to `ready`: whatever broke this dial
   * breaks the next one too, and the agent should see why before resuming.
   */
  async abandonDial(
    ctx: OwnershipContext,
    sessionId: string,
    attemptId: string,
    reason?: string,
  ): Promise<{ released: boolean }> {
    const session = await this.agentSessionService.getById(sessionId);
    if (
      session.userId !== ctx.userId ||
      session.organizationId !== ctx.organizationId
    ) {
      throw new ForbiddenException(
        "Agent session does not belong to this workspace",
      );
    }

    const attempt = await this.callAttemptService.getAttemptById(attemptId);
    if (!attempt || attempt.agentSessionId !== sessionId) {
      throw new NotFoundException("Call attempt not found");
    }
    // Once the provider reported a leg, its webhooks settle the attempt.
    if (attempt.callId || attempt.status !== CallAttemptStatus.dialing) {
      return { released: false };
    }

    const known =
      reason &&
      Object.prototype.hasOwnProperty.call(ABANDONED_DIAL_MESSAGES, reason)
        ? reason
        : null;
    const released = await this.callAttemptService.releaseUndialed({
      agentSessionId: sessionId,
      agentUserId: session.userId,
      campaignLeadId: attempt.campaignLeadId,
      attemptId,
      from: [AgentSessionStatus.dialing],
      to: AgentSessionStatus.paused,
      releaseLease: true,
      blocked: {
        reason: "DIAL_FAILED",
        message: ABANDONED_DIAL_MESSAGES[known ?? "dial_failed"],
      },
    });
    if (released) {
      this.logger.warn(
        `Browser abandoned dial for attempt ${attemptId} (session ${sessionId}, ${known ?? "dial_failed"}) — session paused`,
      );
    }
    return { released };
  }

  /**
   * Safety net for dials that will never happen: a session still `dialing` a
   * lead whose attempt has had no provider leg for {@link STALLED_DIAL_MS}.
   * Without it one lost `call.initiate` — the browser was reconnecting at that
   * instant — left the agent in `dialing` for good, with the lead locked.
   */
  private async sweepStalledDials(now = Date.now()): Promise<void> {
    if (now - this.lastStalledDialSweepAt < STALLED_DIAL_SWEEP_EVERY_MS) {
      return;
    }
    this.lastStalledDialSweepAt = now;
    this.pruneCooldowns(now);

    const sessions = await this.agentSessionService.findDialing();
    for (const session of sessions) {
      if (!session.currentLeadId) continue;
      const attempt = await this.callAttemptService.findUndialedForSession(
        session.id,
        session.currentLeadId,
      );
      if (
        !attempt ||
        now - new Date(attempt.initiatedAt).getTime() < STALLED_DIAL_MS
      ) {
        continue;
      }

      this.logger.warn(
        `Dial for attempt ${attempt.id} (session ${session.id}) never reached the provider — pausing the session`,
      );
      await this.callAttemptService.releaseUndialed({
        agentSessionId: session.id,
        agentUserId: session.userId,
        campaignLeadId: session.currentLeadId,
        attemptId: attempt.id,
        from: [AgentSessionStatus.dialing],
        to: AgentSessionStatus.paused,
        releaseLease: true,
        blocked: {
          reason: "DIAL_TIMEOUT",
          message:
            "The call never connected. Dialing is paused — resume when you're ready.",
        },
      });
    }
  }

  private async releaseLease(agent: DialerAgent): Promise<void> {
    await this.concurrentCallGuard
      .releasePending(agent.userId, campaignDialDeviceId(agent.id))
      .catch((err) =>
        this.logger.warn(
          `Could not release the dial lease of agent ${agent.id}: ${err}`,
        ),
      );
  }

  private startCooldown(agentSessionId: string): void {
    this.cooldownUntil.set(
      agentSessionId,
      Date.now() + REFUSED_DIAL_COOLDOWN_MS,
    );
  }

  private isCoolingDown(agentSessionId: string): boolean {
    const until = this.cooldownUntil.get(agentSessionId);
    if (until === undefined) return false;
    if (Date.now() < until) return true;
    this.cooldownUntil.delete(agentSessionId);
    return false;
  }

  private pruneCooldowns(now: number): void {
    for (const [id, until] of this.cooldownUntil) {
      if (until <= now) this.cooldownUntil.delete(id);
    }
  }
}
