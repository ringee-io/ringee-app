import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  Call,
  CallAttemptRepository,
  CallOutcome,
  CallRepository,
  CampaignLeadRepository,
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
import { ConcurrentCallGuardService } from "../security";

/**
 * The device a campaign session dials from, as the one-call-at-a-time lease
 * knows it. One definition, because the lease taken when a dial is approved
 * has to be given back under the same name wherever that dial is abandoned.
 */
export function campaignDialDeviceId(agentSessionId: string): string {
  return `campaign-agent:${agentSessionId}`;
}

/** The fields of a `Call` row the campaign lifecycle reads. */
export type CampaignLegCall = Pick<
  Call,
  "id" | "userId" | "answeredAt" | "endedAt" | "hangupCause"
>;

/** Where an assignment that never became a call leaves the agent. */
export type UndialedOutcome =
  | typeof AgentSessionStatus.ready
  | typeof AgentSessionStatus.paused
  | typeof AgentSessionStatus.offline;

export interface DialBlocked {
  reason: string;
  message: string;
}

/** Seconds the agent actually talked: from answer to hangup. */
function talkSeconds(call: CampaignLegCall): number {
  if (!call.answeredAt) return 0;
  const end = call.endedAt ? new Date(call.endedAt) : new Date();
  const seconds = Math.round(
    (end.getTime() - new Date(call.answeredAt).getTime()) / 1000,
  );
  return Math.max(0, seconds);
}

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
    private readonly concurrentCallGuard: ConcurrentCallGuardService,
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

  /** The browser is being told to place this attempt's call. */
  async markDialing(attemptId: string): Promise<boolean> {
    return this.attemptRepo.markDialing(attemptId);
  }

  async findUndialedForSession(agentSessionId: string, campaignLeadId: string) {
    return this.attemptRepo.findUndialedForSession(
      agentSessionId,
      campaignLeadId,
    );
  }

  /** Remove an attempt that never produced a provider leg. */
  async discardUndialed(attemptId: string): Promise<boolean> {
    return this.attemptRepo.deleteUndialed(attemptId);
  }

  /**
   * The organization a campaign leg belongs to — when the attempt named in its
   * `client_state` really was handed to this user. Null otherwise.
   *
   * A campaign call is the campaign's, whichever organization the agent's
   * browser happens to have active: attributing it by the browser's header
   * checked credit and billed the call against the wrong workspace, and the
   * `call.initiated` backstop could then hang up every leg the dialer placed.
   */
  async resolveCampaignLeg(
    callAttemptId: string,
    userId: string,
  ): Promise<{ organizationId: string | null } | null> {
    const attempt =
      await this.attemptRepo.findByIdWithCampaignOrganization(callAttemptId);
    if (!attempt || attempt.agentUserId !== userId) return null;
    return { organizationId: attempt.campaign.organizationId };
  }

  /**
   * Handle webhook events for campaign calls.
   * Called by CallService when it detects a callAttemptId in clientState.
   *
   * Every transition is compare-and-set. The hangup webhook races the agent's
   * disposition, and Telnyx redelivers and reorders events; a write that lost
   * must not count the attempt twice or move a lead or agent backwards.
   */
  async handleWebhookEvent(
    callAttemptId: string,
    eventType: string,
    call: CampaignLegCall,
  ): Promise<void> {
    const attempt = await this.attemptRepo.findById(callAttemptId);
    if (!attempt) {
      this.logger.warn(`CallAttempt ${callAttemptId} not found`);
      return;
    }

    // `client_state` is written by the browser, so the attempt id in it is a
    // claim. Only the agent the attempt was handed to can drive it — otherwise
    // any leg could answer, end or re-link somebody else's lead.
    if (!call.userId || attempt.agentUserId !== call.userId) {
      this.logger.warn(
        `Ignoring ${eventType} for attempt ${callAttemptId}: call ${call.id} belongs to user ${call.userId ?? "none"}, the attempt to ${attempt.agentUserId}`,
      );
      return;
    }

    const sessionChannel = attempt.agentSessionId
      ? `agent:${attempt.agentSessionId}`
      : null;

    switch (eventType) {
      case "call.initiated": {
        const linked = await this.attemptRepo.linkCallIfUnlinked(
          attempt.id,
          call.id,
        );
        if (!linked && attempt.callId !== call.id) {
          this.logger.warn(
            `Attempt ${attempt.id} already has a leg (${attempt.callId ?? "released"}); not linking call ${call.id}`,
          );
        }
        return;
      }

      case "call.answered": {
        if (!(await this.attemptRepo.markAnsweredIf(attempt.id, call.id))) {
          return;
        }
        if (!attempt.agentSessionId || !sessionChannel) return;

        await this.campaignLeadRepo.advanceIfHeldBy(
          attempt.campaignLeadId,
          attempt.agentSessionId,
          CampaignLeadStatus.in_call,
        );
        const session = await this.agentSessionService.incrementStats(
          attempt.agentSessionId,
          { callsConnected: 1 },
        );
        const moved = await this.agentSessionService.transitionIf(
          attempt.agentSessionId,
          {
            from: [AgentSessionStatus.dialing, AgentSessionStatus.reserved],
            currentLeadId: attempt.campaignLeadId,
          },
          AgentSessionStatus.in_call,
        );
        if (moved) {
          this.sseBridge.emit(sessionChannel, "call.state", {
            status: "in_call",
            attemptId: callAttemptId,
          });
          this.sseBridge.emit(sessionChannel, "session.state", {
            status: AgentSessionStatus.in_call,
            attemptId: callAttemptId,
            stats: this.statsOf(session),
          });
        }
        return;
      }

      case "call.hangup": {
        const talkSec = talkSeconds(call);
        const endedHere = await this.attemptRepo.markEndedIf(attempt.id, {
          callId: call.id,
        });
        // Duration and cause come from this webhook alone, so they are written
        // even when the agent's disposition ended the attempt first.
        const firstMetrics = await this.attemptRepo.recordCallMetricsOnce(
          attempt.id,
          call.id,
          { durationSec: talkSec, hangupCause: call.hangupCause ?? null },
        );
        const talkToAdd = firstMetrics ? talkSec : 0;

        if (!endedHere) {
          if (talkToAdd > 0 && attempt.agentSessionId) {
            await this.agentSessionService.incrementStats(
              attempt.agentSessionId,
              { totalTalkSec: talkToAdd },
            );
          }
          return;
        }

        await this.campaignLeadRepo.incrementAttempt(attempt.campaignLeadId);
        if (!attempt.agentSessionId || !sessionChannel) return;

        await this.campaignLeadRepo.advanceIfHeldBy(
          attempt.campaignLeadId,
          attempt.agentSessionId,
          CampaignLeadStatus.wrap_up,
        );
        const session = await this.agentSessionService.incrementStats(
          attempt.agentSessionId,
          { callsAttempted: 1, totalTalkSec: talkToAdd },
        );
        const moved = await this.agentSessionService.transitionIf(
          attempt.agentSessionId,
          {
            from: [
              AgentSessionStatus.dialing,
              AgentSessionStatus.in_call,
              AgentSessionStatus.reserved,
            ],
            currentLeadId: attempt.campaignLeadId,
          },
          AgentSessionStatus.wrap_up,
        );
        if (!moved) return;

        // Load dispositions and emit disposition.required via SSE
        const dispositions = await this.dispositionService.listByCampaign(
          attempt.campaignId,
        );
        this.sseBridge.emit(sessionChannel, "call.state", {
          status: "ended",
          attemptId: callAttemptId,
        });
        this.sseBridge.emit(sessionChannel, "disposition.required", {
          callAttemptId,
          dispositions: dispositions.map((d) => ({
            id: d.id,
            code: d.code,
            label: d.label,
            category: d.category,
            color: d.color,
            triggersCallback: d.triggersCallback,
          })),
        });
        this.sseBridge.emit(sessionChannel, "session.state", {
          status: AgentSessionStatus.wrap_up,
          attemptId: callAttemptId,
          stats: this.statsOf(session),
        });
        return;
      }
    }
  }

  /**
   * The `call.initiated` backstop hung up this attempt's leg before it became a
   * call — the agent turned out to be on another call, or the workspace could
   * not pay for it.
   *
   * Without this the attempt was never linked and the leg's hangup was parked
   * forever, so the agent sat in `dialing` until they recorded an outcome for a
   * call that never happened — burning one of the lead's attempts. The session
   * is paused rather than returned to `ready`: a leg was already placed and torn
   * down, and ringing the next lead straight away would repeat exactly that.
   */
  async handleDialRefused(
    callAttemptId: string,
    userId: string,
    blocked: DialBlocked,
  ): Promise<void> {
    const attempt = await this.attemptRepo.findById(callAttemptId);
    if (!attempt || attempt.agentUserId !== userId) return;
    // Bound to a leg of its own: this was a second leg, and the first one
    // still owns the attempt's lifecycle.
    if (attempt.callId || !attempt.agentSessionId) return;

    // Not bound yet, but the agent is already on the line with this very
    // prospect: the first leg's own `call.initiated` simply has not linked it
    // yet. Releasing now would put a lead back in the queue mid-conversation.
    const lead = await this.campaignLeadRepo.findByIdWithContact(
      attempt.campaignLeadId,
    );
    const prospect = lead?.contact.phoneNumber;
    if (prospect) {
      const live = await this.callRepo
        .findActiveByUserId(userId)
        .catch(() => []);
      if (live.some((call) => call.toNumber === prospect)) return;
    }

    await this.releaseUndialed({
      agentSessionId: attempt.agentSessionId,
      agentUserId: attempt.agentUserId,
      campaignLeadId: attempt.campaignLeadId,
      attemptId: attempt.id,
      from: [AgentSessionStatus.dialing],
      to: AgentSessionStatus.paused,
      releaseLease: true,
      blocked,
    });
  }

  /**
   * Undo an assignment that never became a call: the dial was refused, the
   * browser could not place it, the agent skipped the lead, or it stalled.
   *
   * Compare-and-set on the session holding this lead, and every side effect
   * belongs to the writer that wins it. A writer that lost found the session
   * already moved on, and whoever moved it has already cleaned up the lead and
   * its attempt — releasing the lead again could return one that has since
   * been claimed anew.
   *
   * `session.state` is emitted as soon as the session moves, before any other
   * awaited work, so it reaches the browser ahead of whatever the next poll
   * tick assigns.
   */
  async releaseUndialed(input: {
    agentSessionId: string;
    agentUserId: string;
    campaignLeadId: string;
    attemptId?: string | null;
    from: AgentSessionStatus[];
    to: UndialedOutcome;
    /** Keep the lead out of the queue until then. */
    deferLeadUntil?: Date;
    /** Give back the one-call-at-a-time lease the approved dial took. */
    releaseLease?: boolean;
    /** Tell the agent why (`call.blocked`). */
    blocked?: DialBlocked;
    /** `session.state` reason when the session goes offline. */
    offlineReason?: string;
  }): Promise<boolean> {
    const channel = `agent:${input.agentSessionId}`;
    const moved = await this.agentSessionService.transitionIf(
      input.agentSessionId,
      { from: input.from, currentLeadId: input.campaignLeadId },
      input.to,
      {
        currentLeadId: null,
        ...(input.to === AgentSessionStatus.offline
          ? { endedAt: new Date() }
          : {}),
      },
    );

    if (!moved) return false;

    if (input.blocked) {
      this.sseBridge.emit(channel, "call.blocked", {
        attemptId: input.attemptId ?? null,
        ...input.blocked,
      });
    }
    this.sseBridge.emit(channel, "session.state", {
      status: input.to,
      attemptId: input.attemptId ?? null,
      ...(input.offlineReason ? { reason: input.offlineReason } : {}),
    });

    if (input.attemptId) {
      await this.attemptRepo
        .deleteUndialed(input.attemptId)
        .catch((err: Error) =>
          this.logger.warn(
            `Could not discard undialed attempt ${input.attemptId}: ${err.message}`,
          ),
        );
    }
    if (input.releaseLease) {
      await this.concurrentCallGuard
        .releasePending(
          input.agentUserId,
          campaignDialDeviceId(input.agentSessionId),
        )
        .catch((err: Error) =>
          this.logger.warn(
            `Could not release the dial lease of session ${input.agentSessionId}: ${err.message}`,
          ),
        );
    }
    await this.campaignLeadRepo
      .releaseLock(input.campaignLeadId, {
        lockedBy: input.agentSessionId,
        nextCallAt: input.deferLeadUntil,
      })
      .catch((err: Error) =>
        this.logger.warn(
          `Could not release lead ${input.campaignLeadId}: ${err.message}`,
        ),
      );
    return true;
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
    /** The agent asked to stop dialing once this lead was wrapped up. */
    closeSession?: boolean;
  }): Promise<{ action: string; sessionClosed: boolean }> {
    const disposition = await this.dispositionService.getById(
      data.dispositionId,
    );

    const current = await this.attemptRepo.findById(data.callAttemptId);
    if (!current) {
      throw new NotFoundException("Call attempt not found");
    }

    // An outcome recorded for an older attempt must not rewrite a lead that
    // has been dialed again since — it could put a lead back in the queue
    // while another agent is on the phone with them.
    const [latest] = await this.attemptRepo.findByCampaignLead(
      current.campaignLeadId,
    );
    if (latest && latest.id !== current.id) {
      throw new ConflictException(
        "This lead has been dialed again since that call, so its outcome can no longer be changed from it.",
      );
    }

    // The browser saves the outcome the moment its call ends, which usually
    // beats the provider's hangup webhook. Whichever of the two ends the
    // attempt is the one that counts it; the other finds it already ended.
    if (await this.attemptRepo.markEndedIf(current.id)) {
      await this.campaignLeadRepo.incrementAttempt(current.campaignLeadId);
      if (current.agentSessionId) {
        await this.agentSessionService.incrementStats(current.agentSessionId, {
          callsAttempted: 1,
        });
      }
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

    // Return the agent to `ready` — clearing the finished lead reference — so
    // the poller can hand them another one. Unless they asked to stop after
    // this lead, in which case the session ends right here.
    //
    // That decision has to be taken server-side, inside this request: a
    // progressive campaign polls every 500ms, so an agent whose browser sent
    // "end session" a moment after the disposition would already be ringing
    // the next lead by the time it arrived.
    //
    // Only a session still on this lead moves, and the browser hears about it
    // before anything else is awaited — the next tick may already be assigning
    // a lead, and a `ready` that arrived after it would wipe that lead off the
    // agent's screen mid-dial.
    let sessionClosed = false;
    if (attempt.agentSessionId) {
      const channel = `agent:${attempt.agentSessionId}`;
      const onThisLead = {
        from: [
          AgentSessionStatus.wrap_up,
          AgentSessionStatus.in_call,
          AgentSessionStatus.dialing,
          AgentSessionStatus.reserved,
        ],
        currentLeadId: attempt.campaignLeadId,
      };
      if (data.closeSession) {
        // The lead was just settled above, so there is no lock left to hand
        // back — the session only has to go offline. One that already let go
        // of the lead (paused by a stalled dial, say) still honours the
        // request, as long as nothing has been assigned to it since.
        const offline = { currentLeadId: null, endedAt: new Date() };
        sessionClosed =
          (await this.agentSessionService.transitionIf(
            attempt.agentSessionId,
            onThisLead,
            AgentSessionStatus.offline,
            offline,
          )) ||
          (await this.agentSessionService.transitionIf(
            attempt.agentSessionId,
            {
              from: [AgentSessionStatus.ready, AgentSessionStatus.paused],
              currentLeadId: null,
            },
            AgentSessionStatus.offline,
            offline,
          ));
        if (sessionClosed) {
          this.sseBridge.emit(channel, "session.state", {
            status: AgentSessionStatus.offline,
            reason: "closed_after_lead",
            attemptId: attempt.id,
          });
        }
      } else if (
        await this.agentSessionService.transitionIf(
          attempt.agentSessionId,
          onThisLead,
          AgentSessionStatus.ready,
          { currentLeadId: null },
        )
      ) {
        this.sseBridge.emit(channel, "session.state", {
          status: AgentSessionStatus.ready,
          attemptId: attempt.id,
        });
      }
    }

    // Persist the disposition on the linked Call and push the CRM call-log
    // note immediately — this request is the only thing that fires the note
    // for campaign calls; without it the notes never left the attempt row.
    const callId = attempt.callId ?? current.callId;
    if (callId) {
      await this.applyDispositionToCall(callId, disposition, data.note);
    }

    this.logger.log(
      `Disposition '${disposition.code}' submitted for attempt ${data.callAttemptId}, action: ${action}` +
        (sessionClosed ? " (session closed at the agent's request)" : ""),
    );

    return { action, sessionClosed };
  }

  private statsOf(session: {
    callsAttempted: number;
    callsConnected: number;
    totalTalkSec: number;
  }) {
    return {
      callsAttempted: session.callsAttempted,
      callsConnected: session.callsConnected,
      totalTalkSec: session.totalTalkSec,
    };
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
