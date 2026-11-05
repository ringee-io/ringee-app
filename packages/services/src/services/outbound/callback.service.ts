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
  CallRepository,
  AiVoiceAgentCall,
  AiVoiceAgentCallRepository,
  AiVoiceAgentCallStatus,
  CallbackAgentKind,
  CallbackTask,
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
import type { OwnershipContext } from "@ringee/platform";
import {
  VoiceAgentCallService,
  VoiceAgentCallStartError,
  VoiceAgentCallStartOutcome,
} from "../voice-agents/voice-agent-call.service";
import {
  HandoffDialRefused,
  VoiceAgentHandoffService,
} from "../voice-agents/automations/voice-agent-handoff.service";

import { PendingActionService } from "../ai-pipeline/pending-action.service";

const MAX_AUTOMATED_CALLBACK_ATTEMPTS = 3;
/** How long a worker owns a claimed agent callback before another may take it. */
const AGENT_CALLBACK_LEASE_MS = 5 * 60_000;
const AGENT_CALLBACK_BATCH = 20;
/** Dial tries inside one agent callback, only for failures before placement. */
const MAX_AGENT_CALLBACK_DIAL_TRIES = 3;
/**
 * How long a reclaimed try that wrote its call row but never learned whether
 * the provider took the leg is waited on. Longer than an agent call can last,
 * so the status callback — which writes the control id when the leg exists —
 * has had every chance to arrive.
 */
const PLACEMENT_CONFIRMATION_WINDOW_MS = 60 * 60_000;
/** How often such a try is looked at again while it waits. */
const PLACEMENT_RECHECK_MS = 5 * 60_000;
const CALLBACK_NOTE_MAX = 2000;

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
    private readonly callRepo: CallRepository,
    private readonly handoffs: VoiceAgentHandoffService,
    private readonly pendingActions: PendingActionService,
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
    await this.customIntegrationOutbound.enqueue({
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
    // The callback is shown with its contact and call, so both must be the
    // workspace's own — and the call, when there is one, that contact's.
    const owner: OwnershipContext = {
      userId: data.userId,
      organizationId: data.organizationId ?? null,
    };
    const contact = await this.contactRepo.findByIdForOwner(
      owner,
      data.contactId,
    );
    if (!contact) throw new NotFoundException("Contact not found");
    if (data.callId) {
      const call = await this.callRepo.findByIdForOwner(owner, data.callId);
      if (!call || (call.contactId && call.contactId !== contact.id)) {
        throw new NotFoundException("Call not found");
      }
    }

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
  async scheduleFromVoiceAgent(
    ctx: OwnershipContext,
    data: {
      agentCallId: string;
      contactId: string;
      callId: string;
      scheduledAt: Date;
      note?: string;
    },
  ) {
    const [agentCall, call, contact] = await Promise.all([
      this.agentCalls.findByIdForOwner(ctx, data.agentCallId),
      this.callRepo.findByIdForOwner(ctx, data.callId),
      this.contactRepo.findByIdForOwner(ctx, data.contactId),
    ]);
    if (
      !agentCall ||
      agentCall.userId !== ctx.userId ||
      agentCall.callId !== data.callId ||
      agentCall.contactId !== data.contactId ||
      !call ||
      call.userId !== ctx.userId ||
      (call.contactId && call.contactId !== data.contactId) ||
      !contact
    )
      throw new NotFoundException("Callback source not found");

    const objectiveCallback =
      await this.pendingActions.scheduleHumanObjectiveCallback(
        ctx,
        data.agentCallId,
        data.scheduledAt,
      );
    if (objectiveCallback) {
      if (
        objectiveCallback.userId !== ctx.userId ||
        objectiveCallback.organizationId !== (ctx.organizationId ?? null) ||
        objectiveCallback.contactId !== data.contactId
      )
        throw new ConflictException("Callback source changed");
      // The outbound outbox deduplicates callback_created by callback id,
      // including a replay after scheduling committed but publication failed.
      await this.enqueueCallbackCreated(objectiveCallback);
      return objectiveCallback;
    }
    const { callback, created } = await this.callbackRepo.createOnce({
      id: data.agentCallId,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      contactId: data.contactId,
      callId: data.callId,
      scheduledAt: data.scheduledAt,
      note: data.note,
    });

    // A same-id row can only be accepted as this tool's prior write. This also
    // fails closed if seeded/test data ever reuses an id across the two tables.
    if (
      callback.userId !== ctx.userId ||
      callback.organizationId !== (ctx.organizationId ?? null) ||
      callback.contactId !== data.contactId ||
      callback.callId !== data.callId
    ) {
      throw new ConflictException("Callback id is already in use");
    }

    if (created) {
      await this.scheduleReminders(
        ctx.userId,
        ctx.organizationId ?? null,
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

  /**
   * A callback an AI voice agent places itself to continue a handoff request
   * (AGENT-021): the scheduling agent calling back about a meeting the person
   * could not attend. Created under a key, so a provider replaying the tool
   * call — or a reconciler tick running twice — returns the same callback.
   *
   * It is shown in the workspace's callback list like any other, but never
   * owed by a person: "My day" leaves it out (CALL-013), and no "callback due"
   * reminder goes to a person, who would otherwise call the contact as well.
   */
  async scheduleAgentCallback(data: {
    handoffId: string;
    agentId: string;
    kind: CallbackAgentKind;
    key: string;
    userId: string;
    organizationId: string;
    contactId: string;
    callId: string | null;
    scheduledAt: Date;
    note?: string;
  }): Promise<CallbackTask> {
    await this.handoffs.authorizeCallbackCreation(data);
    const { callback, created } =
      await this.callbackRepo.createAgentCallbackOnce({
        userId: data.userId,
        organizationId: data.organizationId,
        contactId: data.contactId,
        callId: data.callId,
        scheduledAt: data.scheduledAt,
        note: data.note?.slice(0, CALLBACK_NOTE_MAX),
        agentCallbackKind: data.kind,
        agentId: data.agentId,
        handoffId: data.handoffId,
        agentCallbackKey: data.key,
      });
    // The key belongs to this request and agent, or it is not this write.
    if (
      callback.handoffId !== data.handoffId ||
      callback.agentId !== data.agentId ||
      callback.organizationId !== data.organizationId
    ) {
      throw new ConflictException("Callback key is already in use");
    }
    if (created) {
      await this.enqueueCallbackCreated(callback);
      this.logger.log(
        `AI voice-agent ${data.kind} callback ${callback.id} for handoff ${data.handoffId} scheduled at ${data.scheduledAt.toISOString()}`,
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
    this.assertNotBeingPlaced(callback);

    // Conditional in the write itself: a worker may have claimed the row
    // since the read above, and overwriting its claim would let a second
    // call follow the one already ringing.
    const updated = await this.callbackRepo.cancelUnlessBeingPlaced(id);
    if (!updated) throw beingPlaced();
    await this.silentlyCancelReminders(id);
    return updated;
  }

  async rescheduleAgreedAgentCallback(
    id: string,
    scheduledAt: Date,
    handoffId: string,
  ) {
    const callback = await this.callbackRepo.findById(id);
    if (
      !callback ||
      callback.handoffId !== handoffId ||
      callback.status !== CallbackStatus.scheduled ||
      !callback.organizationId ||
      !callback.agentId
    )
      throw beingPlaced();
    await this.handoffs.authorizeCallbackCreation({
      handoffId,
      userId: callback.userId,
      organizationId: callback.organizationId,
      agentId: callback.agentId,
      contactId: callback.contactId,
      callId: callback.callId,
    });
    const moved = await this.callbackRepo.rescheduleAgentCallback(
      id,
      scheduledAt,
      CallbackStatus.scheduled,
    );
    if (!moved) throw beingPlaced();
    return moved;
  }

  async reschedule(id: string, scheduledAt: Date) {
    const callback = await this.callbackRepo.findById(id);
    if (!callback) throw new NotFoundException("Callback not found");
    this.assertNotBeingPlaced(callback);

    if (callback.agentCallbackKind) {
      // Conditional in the write: the row may have been claimed or cancelled
      // since the read above. A new time is a new dial with keys of its own,
      // and there is no reminder for a person to act on.
      const moved = await this.callbackRepo.rescheduleAgentCallback(
        id,
        scheduledAt,
        callback.status,
      );
      if (!moved) throw beingPlaced();
      return moved;
    }

    const updated = await this.callbackRepo.update(id, {
      scheduledAt,
      status: CallbackStatus.scheduled,
      completedAt: null,
      attemptCount: 0,
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
          await this.callbackRepo.updateClaimed(callback.id, {
            status: CallbackStatus.completed,
            completedAt: new Date(),
          });
          count++;
          this.logger.debug(
            `AI voice-agent callback ${callback.id} placed successfully`,
          );
        } catch (error) {
          const startOutcome =
            error instanceof VoiceAgentCallStartError
              ? error.outcome
              : VoiceAgentCallStartOutcome.terminal_rejection;
          const message =
            error instanceof Error ? error.message : String(error);

          let status: CallbackStatus = CallbackStatus.missed;
          let completedAt: Date | undefined;
          if (
            startOutcome ===
            VoiceAgentCallStartOutcome.placed_pending_reconciliation
          ) {
            // A provider leg exists. Completing the claim is the safe
            // reconciliation: status callbacks can repair the call rows, and
            // this callback must never place a second billable leg.
            status = CallbackStatus.completed;
            completedAt = new Date();
          } else if (
            startOutcome ===
              VoiceAgentCallStartOutcome.retryable_before_placement &&
            claimed.attemptCount < MAX_AUTOMATED_CALLBACK_ATTEMPTS
          ) {
            status = CallbackStatus.scheduled;
          }

          await this.callbackRepo.updateClaimed(callback.id, {
            status,
            ...(completedAt ? { completedAt } : {}),
          });
          count++;
          this.logger.warn(
            `AI voice-agent callback ${callback.id} finished with ${startOutcome} (attempt ${claimed.attemptCount}/${MAX_AUTOMATED_CALLBACK_ATTEMPTS}): ${message}`,
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

    // Handoff requests (AGENT-021): settle what finished calls left, plan the
    // recovery calls policy allows, then place the agent callbacks that are
    // due. Isolated, so a failure here never holds up the callbacks above.
    try {
      await this.pendingActions.reconcileFollowUps();
      count += await this.planHandoffRecoveries(new Date());
      await this.pendingActions.reconcileFollowUps();
    } catch (error) {
      this.logger.error(
        `Handoff recovery planning failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    try {
      count += await this.processAgentCallbacks();
      await this.pendingActions.reconcileFollowUps();
    } catch (error) {
      this.logger.error(
        `Agent callbacks failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return count;
  }

  /**
   * Plans the recovery calls the handoff reconciler asks for: the scheduling
   * agent calls once, at the next allowed moment, when a call ended before a
   * new time was found and nothing was agreed. A recovery is never presented
   * as a callback the person agreed to.
   */
  private async planHandoffRecoveries(now: Date): Promise<number> {
    const plans = await this.handoffs.reviewDue(now);
    let planned = 0;
    for (const plan of plans) {
      try {
        await this.scheduleAgentCallback({
          handoffId: plan.handoff.id,
          agentId: plan.agentId,
          kind: CallbackAgentKind.recovery,
          key: `handoff:${plan.handoff.id}:recovery:${plan.attempt}`,
          userId: plan.handoff.userId,
          organizationId: plan.handoff.organizationId,
          contactId: plan.contactId,
          callId: plan.handoff.callId,
          scheduledAt: plan.at,
          note: "Recovery call planned by Ringee: the earlier call ended before a new meeting time was found. Not a time the contact agreed to.",
        });
        if (await this.handoffs.markRecoveryPlanned(plan)) planned++;
      } catch (error) {
        this.logger.error(
          `Could not plan the recovery of handoff ${plan.handoff.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return planned;
  }

  /**
   * Places the agent callbacks that are due, under a lease (AGENT-021).
   *
   * Every callback is claimed atomically, re-decided from its request right
   * before the dial — still pending, meeting not already moved, destination
   * still authorized, nobody on the phone with the person — and dialed
   * through `VoiceAgentCallService.startCall` under a key persisted before the
   * leg exists. A worker that crashed after dialing is recovered by that key:
   * the call is linked, never placed twice. Unlike the legacy agent
   * callbacks, a claim whose worker died is taken over when its lease runs out.
   */
  private async processAgentCallbacks(): Promise<number> {
    const claimAt = new Date();
    const claimed = await this.callbackRepo.claimDueAgentCallbacks(
      claimAt,
      new Date(claimAt.getTime() + AGENT_CALLBACK_LEASE_MS),
      AGENT_CALLBACK_BATCH,
    );
    let placed = 0;
    for (const callback of claimed) {
      try {
        if (await this.runAgentCallback(callback)) placed++;
      } catch (error) {
        // Left claimed on purpose: the lease runs out and the next tick
        // reconciles by the dial key before it would ever dial again.
        this.logger.error(
          `Agent callback ${callback.id} failed unexpectedly: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return placed;
  }

  private async runAgentCallback(callback: CallbackTask): Promise<boolean> {
    const claimToken = callback.claimToken;
    if (!claimToken) return false;
    const finish = (
      status: CallbackStatus,
      data: {
        reason?: string;
        lastError?: string;
        agentCallId?: string;
      } = {},
    ) =>
      this.callbackRepo.finishAgentCallback(callback.id, claimToken, status, {
        ...data,
        now: new Date(),
      });

    // Reclaimed after a worker died: if its last try may have placed a leg,
    // that call is the one — it is linked, never dialed a second time.
    if (callback.dialTries > 0) {
      const earlier = await this.agentCalls.findByIdempotencyKey(
        agentDialKey(callback, callback.dialTries),
      );
      if (earlier?.providerCallControlId) {
        await finish(CallbackStatus.completed, { agentCallId: earlier.id });
        return true;
      }
      if (earlier && !provablyUnplaced(earlier)) {
        // The try wrote its row but never learned whether the provider took
        // the leg, so it is neither completed nor dialed again. Its status
        // callback writes the control id if the leg exists: wait for that,
        // keeping the dial reservation so this key stays the one checked —
        // and only for a while. A leg never confirmed is recorded as such.
        if (
          Date.now() - earlier.createdAt.getTime() <
          PLACEMENT_CONFIRMATION_WINDOW_MS
        ) {
          await this.callbackRepo.deferAgentCallback(
            callback.id,
            claimToken,
            new Date(Date.now() + PLACEMENT_RECHECK_MS),
            "placement_pending",
          );
          return false;
        }
        await finish(CallbackStatus.missed, {
          reason: "placement_unconfirmed",
          agentCallId: earlier.id,
        });
        return false;
      }
    }

    if (callback.dispatchCommittedAt && callback.dialTries > 0) {
      const earlier = await this.agentCalls.findByIdempotencyKey(
        agentDialKey(callback, callback.dialTries),
      );
      if (earlier && provablyUnplaced(earlier)) {
        await this.callbackRepo.deferAgentCallback(
          callback.id,
          claimToken,
          new Date(Date.now() + 60_000),
          "retry_before_placement",
          true,
        );
        return false;
      }
    }
    const decision =
      callback.followUpId && !callback.handoffId
        ? await this.pendingActions.decideHumanCallback(callback, new Date())
        : await this.handoffs.decideCallback(callback, new Date());
    if (decision.action === "skip") {
      await finish(decision.status, { reason: decision.reason });
      return false;
    }
    if (decision.action === "defer") {
      await this.callbackRepo.deferAgentCallback(
        callback.id,
        claimToken,
        decision.until,
        decision.reason,
      );
      return false;
    }

    const reservedAt = new Date();
    const dialing = await this.callbackRepo.beginAgentDial(
      callback.id,
      claimToken,
      reservedAt,
      new Date(reservedAt.getTime() + AGENT_CALLBACK_LEASE_MS),
    );
    if (!dialing) return false;

    let started: { id: string };
    try {
      started = await this.voiceAgentCalls.startCall(
        decision.ctx,
        decision.agentId,
        {
          to: decision.to,
          variables: decision.variables,
          metadata: {},
          idempotencyKey: agentDialKey(dialing, dialing.dialTries),
          responsibleUserId: decision.responsibleUserId ?? undefined,
        },
        async (placement) => {
          // The commit point: re-checked after all provider preparation,
          // immediately before the leg. It also binds the new call's tools to
          // the request before the agent says a word.
          if ("handoff" in decision)
            await this.handoffs.authorizeCallbackDial(
              dialing,
              decision,
              placement,
            );
          else
            await this.pendingActions.authorizeHumanCallbackDial(
              dialing,
              decision,
              placement,
            );
          if (
            !(await this.callbackRepo.holdsAgentClaim(
              callback.id,
              claimToken,
              new Date(),
            ))
          ) {
            throw new HandoffDialRefused(
              CallbackStatus.cancelled,
              "claim_lost",
            );
          }
        },
      );
    } catch (error) {
      const outcome =
        error instanceof VoiceAgentCallStartError
          ? error.outcome
          : VoiceAgentCallStartOutcome.terminal_rejection;
      const message = error instanceof Error ? error.message : String(error);

      if (
        outcome === VoiceAgentCallStartOutcome.placed_pending_reconciliation
      ) {
        // A leg may exist. Link it when the row is known; otherwise the call
        // is recorded as unconfirmed — never dialed again blindly.
        const agentCallId =
          error instanceof VoiceAgentCallStartError ? error.agentCallId : null;
        if (agentCallId) {
          const existing = await this.agentCalls.findByIdempotencyKey(
            agentDialKey(dialing, dialing.dialTries),
          );
          if (existing?.providerCallControlId) {
            await finish(CallbackStatus.completed, { agentCallId });
            return true;
          }
          await this.callbackRepo.deferAgentCallback(
            callback.id,
            claimToken,
            new Date(Date.now() + PLACEMENT_RECHECK_MS),
            "placement_pending",
          );
          return false;
        }
        await finish(CallbackStatus.missed, {
          reason: "placement_unconfirmed",
          lastError: message,
        });
        return false;
      }

      const refusal = dialRefusalOf(error);
      if (refusal) {
        await finish(refusal.callbackStatus, { reason: refusal.reason });
        return false;
      }

      if (
        outcome === VoiceAgentCallStartOutcome.retryable_before_placement &&
        dialing.dialTries < MAX_AGENT_CALLBACK_DIAL_TRIES
      ) {
        await this.callbackRepo.deferAgentCallback(
          callback.id,
          claimToken,
          new Date(Date.now() + 2 ** dialing.dialTries * 60_000),
          "retry_before_placement",
          true,
        );
        return false;
      }

      await finish(CallbackStatus.missed, {
        reason:
          outcome === VoiceAgentCallStartOutcome.terminal_rejection
            ? "rejected"
            : "not_placed",
        lastError: message,
      });
      return false;
    }

    // Outside the dial's own error handling on purpose: the leg exists, so a
    // failure to write that down must not read as a failed dial. It leaves
    // the claim to expire, and the next tick links the call by its key.
    await finish(CallbackStatus.completed, { agentCallId: started.id });
    this.logger.log(
      `AI voice-agent callback ${callback.id} placed (agent call ${started.id})`,
    );
    return true;
  }

  /**
   * A person may not move, cancel or complete an agent callback while the
   * worker is placing it: the call may already be ringing, and changing the
   * row under the claim would let a second call follow the first.
   */
  private assertNotBeingPlaced(callback: CallbackTask): void {
    if (callback.followUpId)
      throw new ConflictException(
        "Use the follow-up objective controls for this automatic step.",
      );
    if (
      callback.agentCallbackKind &&
      callback.status === CallbackStatus.in_progress
    ) {
      throw beingPlaced();
    }
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
    const callback = await this.callbackRepo.findById(id);
    if (callback) this.assertNotBeingPlaced(callback);
    const updated = await this.callbackRepo.completeUnlessBeingPlaced(id);
    if (!updated) throw beingPlaced();
    await this.silentlyCancelReminders(id);
    return updated;
  }
}

/**
 * One key per dial try of an agent callback: `callback:<id>:<time>:d<try>`.
 * The scheduled time is part of it, so a callback a person moves gets new
 * keys instead of finding the call its old time already placed.
 */
function agentDialKey(callback: CallbackTask, tryNumber: number): string {
  return `callback:${callback.id}:${callback.scheduledAt.getTime()}:d${tryNumber}`;
}

/** What a person changing a callback a worker is placing is told. */
function beingPlaced(): ConflictException {
  return new ConflictException(
    "The AI voice agent is placing this callback right now.",
  );
}

/** Only a try that failed before the provider accepted it may be followed. */
function provablyUnplaced(agentCall: AiVoiceAgentCall): boolean {
  return (
    agentCall.status === AiVoiceAgentCallStatus.failed &&
    !agentCall.providerCallControlId
  );
}

/** The commit point's refusal, however `startCall` wrapped it. */
function dialRefusalOf(error: unknown): HandoffDialRefused | null {
  if (error instanceof HandoffDialRefused) return error;
  const cause = (error as { cause?: unknown } | null)?.cause;
  return cause instanceof HandoffDialRefused ? cause : null;
}
