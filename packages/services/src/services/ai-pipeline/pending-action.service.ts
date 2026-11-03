import {
  BadRequestException,
  ConflictException,
  Logger,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AiPipelineActivationRepository,
  AiVoiceAgentAutomationRepository,
  AiVoiceAgentRepository,
  AiVoiceAgentHandoffInput,
  CalendarRepository,
  ContactRepository,
  CallRepository,
  MeetingRepository,
  MeetingReminderPolicyRepository,
  OrganizationRepository,
  NewFollowUpObjective,
  FollowUpClosureReason,
  FollowUpState,
  FollowUpPlan,
  AiPipelineType,
  PendingAction,
  PendingActionFilterKey,
  PendingActionRepository,
  PendingActionStatus,
  Prisma,
} from "@ringee/database";
import { OwnershipContext, normalizePhoneE164 } from "@ringee/platform";
import { ComplianceService } from "../outbound/compliance.service";
import {
  assertVoiceAgentAutomations,
  voiceAgentAutomationsEnabled,
} from "../voice-agents/automations/automation-access";
import {
  DEFAULT_CALLING_WINDOW,
  nextCallingWindowMoment,
  readCallingWindow,
} from "../reminders/reminder-call-schedule";
import { planFollowUp, type FollowUpSnapshot } from "./follow-up-policy";
import { PendingActionDraft } from "./ai-pipeline.types";
import {
  PipelineContext,
  contextKey,
  contextOwnerColumns,
  toContextTypeEnum,
} from "./pipeline-context";

export interface DraftWithOwner {
  draft: PendingActionDraft;
  ownerUserId: string;
}

/**
 * Owns PendingAction persistence and the user's execution-center reads. Drafts
 * from any pipeline (rule or AI) are stamped with their (pipeline, context) here
 * — this is the only place actions are created, so isolation is guaranteed.
 */
@Injectable()
export class PendingActionService {
  private readonly logger = new Logger(PendingActionService.name);
  constructor(
    private readonly repo: PendingActionRepository,
    private readonly activationRepo: AiPipelineActivationRepository,
    private readonly contacts: ContactRepository,
    private readonly calls: CallRepository,
    private readonly meetings: MeetingRepository,
    private readonly organizations: OrganizationRepository,
    private readonly automations: AiVoiceAgentAutomationRepository,
    private readonly agents: AiVoiceAgentRepository,
    private readonly calendars: CalendarRepository,
    private readonly reminderPolicies: MeetingReminderPolicyRepository,
    private readonly compliance: ComplianceService,
  ) {}

  /**
   * Persist drafts for an enabled (pipeline, context). Grouped drafts are
   * upserted by groupKey so re-firing never duplicates. Returns how many new
   * actions were created.
   */
  async persistDrafts(
    ctx: PipelineContext,
    pipelineEnum: AiPipelineType,
    items: DraftWithOwner[],
  ): Promise<{ created: number; updated: number }> {
    if (items.length === 0) return { created: 0, updated: 0 };

    const owner = contextOwnerColumns(ctx);
    const ctxType = toContextTypeEnum(ctx);
    const key = contextKey(ctx);

    let created = 0;
    let updated = 0;

    for (const { draft, ownerUserId } of items) {
      const data: Prisma.PendingActionUncheckedCreateInput = {
        type: draft.type,
        status: PendingActionStatus.pending,
        priority: draft.priority,
        source: draft.source,
        title: draft.title,
        reason: draft.reason ?? null,
        suggestedMessage: draft.suggestedMessage ?? null,
        nextBestAction: draft.nextBestAction ?? null,
        dueAt: draft.dueAt ?? null,
        expiresAt: draft.expiresAt ?? null,
        countsTowardBadge: draft.countsTowardBadge ?? true,
        pipelineType: pipelineEnum,
        contextType: ctxType,
        contextKey: key,
        campaignId: owner.campaignId,
        organizationId: owner.organizationId,
        userId: ownerUserId,
        contactId: draft.contactId ?? null,
        callId: draft.callId ?? null,
        groupKey: draft.groupKey ?? null,
      };

      if (draft.groupKey) {
        const res = await this.repo.upsertByGroupKey(draft.groupKey, data);
        if (res.created) created++;
        else updated++;
      } else {
        await this.repo.create(data);
        created++;
      }
    }

    if (created > 0) {
      await this.activationRepo.adjustPendingActionCount(
        pipelineEnum,
        key,
        created,
      );
    }
    return { created, updated };
  }

  // ── Reads / mutations for the execution center ──

  list(
    ctx: OwnershipContext,
    options?: {
      filter?: PendingActionFilterKey;
      status?: PendingActionStatus;
      contextKey?: string;
      /** Narrow org-wide results to a single member (admin filter / member self). */
      memberUserId?: string;
      page?: number;
      limit?: number;
    },
  ) {
    return this.repo.list(
      { userId: ctx.userId, organizationId: ctx.organizationId ?? null },
      options,
    );
  }

  /** The sidebar badge always reflects the caller's own actionable items. */
  badgeCount(ctx: OwnershipContext): Promise<number> {
    return this.repo.badgeCount(
      { userId: ctx.userId, organizationId: ctx.organizationId ?? null },
      ctx.userId,
    );
  }

  /**
   * `memberUserId` is the member scoping `resolveMemberFilter` gives: an
   * organization member acts on their own actions only, as the list shows them.
   */
  async complete(
    ctx: OwnershipContext,
    id: string,
    access: { memberUserId?: string } = {},
  ): Promise<PendingAction> {
    const action = await this.requireOwned(ctx, id, access);
    await this.assertRecommendation(ctx, id);
    const updated = await this.repo.updateStatus(
      id,
      PendingActionStatus.completed,
      { completedAt: new Date() },
    );
    await this.decrementIfWasPending(action);
    return updated;
  }

  async dismiss(
    ctx: OwnershipContext,
    id: string,
    access: { memberUserId?: string } = {},
  ): Promise<PendingAction> {
    const action = await this.requireOwned(ctx, id, access);
    await this.assertRecommendation(ctx, id);
    const updated = await this.repo.updateStatus(
      id,
      PendingActionStatus.dismissed,
      { completedAt: new Date() },
    );
    await this.decrementIfWasPending(action);
    return updated;
  }

  async snooze(
    ctx: OwnershipContext,
    id: string,
    snoozedUntil: Date,
    access: { memberUserId?: string } = {},
  ): Promise<PendingAction> {
    await this.requireOwned(ctx, id, access);
    await this.assertRecommendation(ctx, id);
    return this.repo.updateStatus(id, PendingActionStatus.snoozed, {
      snoozedUntil,
    });
  }

  /** Stage 2 uses this same enrollment contract after authorizing its source.
   * Step 1 binds it to a rescheduling handoff, persisted in that transaction.
   * It neither enables a recommendation pipeline nor enrolls old actions. */
  async prepareFollowUpObjective(
    ctx: OwnershipContext,
    source: AiVoiceAgentHandoffInput,
    now: Date,
  ): Promise<NewFollowUpObjective> {
    assertVoiceAgentAutomations(ctx);
    if (
      source.organizationId !== ctx.organizationId ||
      source.userId !== ctx.userId
    )
      throw new NotFoundException("Follow-up source not found");
    const responsibleUserId = source.responsibleUserId ?? source.userId;
    const [contact, meeting, member, configuredBy] = await Promise.all([
      source.contactId
        ? this.contacts.findByIdForOwner(ctx, source.contactId)
        : null,
      this.meetings.findByIdForOwner(ctx, source.meetingId),
      this.organizations.isMember(responsibleUserId, ctx.organizationId),
      this.organizations.isMember(source.userId, ctx.organizationId),
    ]);
    if (
      !contact ||
      !meeting ||
      meeting.contactId !== contact.id ||
      meeting.scheduleVersion !== source.meetingScheduleVersion ||
      !member ||
      !configuredBy
    )
      throw new NotFoundException("Follow-up source not found");
    if (source.callId) {
      const call = await this.calls.findByIdForOwner(ctx, source.callId);
      if (
        !call ||
        call.userId !== source.userId ||
        (call.contactId && call.contactId !== contact.id)
      )
        throw new NotFoundException("Follow-up call not found");
    }
    if (
      source.destinationAgentId &&
      !(await this.agents.findByIdForOwner(ctx, source.destinationAgentId))
    )
      throw new NotFoundException("Follow-up specialist not found");
    const blocked = source.requestStatus === "needs_attention";
    return {
      userId: responsibleUserId,
      organizationId: ctx.organizationId,
      contextKey: contextKey({
        type: "organization_outside_campaign",
        organizationId: ctx.organizationId,
      }),
      configuredByUserId: source.userId,
      contactId: contact.id,
      callId: source.callId,
      sourceKey: `${ctx.organizationId}:${source.idempotencyKey}:v${source.meetingScheduleVersion}`,
      sourceType: "reschedule_handoff",
      sourceRevision: source.meetingScheduleVersion,
      objectiveType: "reschedule_meeting",
      desiredResult: "Move the existing meeting to an agreed time",
      agentId: source.destinationAgentId,
      meetingId: meeting.id,
      meetingScheduledAt: source.meetingScheduledAt,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60_000),
      state: blocked ? "blocked" : "in_progress",
      reason: blocked
        ? (source.resolution ?? "destination_unavailable")
        : "handoff_prepared",
      nextAction: blocked ? "exceptional_decision" : "reconcile_handoff",
      nextActionAt: blocked ? null : source.reviewAt,
    };
  }

  /** Existing callback scheduler calls this; paused/blocked cases also keep
   * reconciling authoritative meeting changes. No calls are placed here. */
  async reconcileFollowUps(now = new Date()): Promise<void> {
    const due = await this.repo.listFollowUpsForReview(now, 100);
    for (const { id } of due) {
      try {
        await this.reconcileFollowUp(id, now);
      } catch {
        this.logger.warn(`Follow-up ${id} reconciliation deferred`);
        const row = await this.repo.followUpSnapshot(id);
        if (row)
          await this.repo.deferFollowUpReview(
            id,
            row.revision,
            new Date(now.getTime() + 60_000),
          );
      }
    }
  }

  async reconcileFollowUp(id: string, now = new Date()) {
    const row = await this.repo.followUpSnapshot(id);
    if (!row || ["resolved", "closed"].includes(row.state)) return row;
    const ctx = {
      userId: row.configuredByUserId,
      organizationId: row.action.organizationId,
    };
    const meeting = row.meetingId
      ? await this.meetings.findByIdForOwner(ctx, row.meetingId)
      : null;
    let plan = planFollowUp(row, meeting, now);
    if (
      plan &&
      !["resolved", "closed"].includes(plan.state) &&
      !voiceAgentAutomationsEnabled(ctx.organizationId)
    ) {
      plan = {
        state: "blocked",
        reason: "automations_disabled",
        nextAction: "exceptional_decision",
        nextActionAt: null,
      };
    }
    if (!plan || samePlan(row, plan)) {
      await this.repo.deferFollowUpReview(
        id,
        row.revision,
        new Date(now.getTime() + 60_000),
        plan && isObservationAction(plan.nextAction)
          ? (plan.nextActionAt ?? undefined)
          : undefined,
      );
      return row;
    }
    return this.repo.applyFollowUpTransition({
      id,
      expectedRevision: row.revision,
      plan,
      ...(plan.state === "resolved" && meeting && ctx.organizationId
        ? {
            meetingEvidence: {
              id: meeting.id,
              revision: meeting.scheduleVersion,
              scheduledAt: meeting.scheduledAt,
              organizationId: ctx.organizationId,
              contactId: meeting.contactId,
            },
          }
        : {}),
      key: `reconcile:${row.revision}:${plan.state}:${plan.reason}`,
      kind:
        plan.state === "resolved"
          ? "objective_resolved"
          : plan.state === "closed"
            ? "objective_closed"
            : "progress_reconciled",
      now,
    });
  }

  async followUpForHandoff(handoffId: string) {
    return this.repo.findFollowUpForHandoff(handoffId);
  }

  async listFollowUps(
    ctx: OwnershipContext,
    options: {
      state?: FollowUpState;
      page?: number;
      limit?: number;
      memberUserId?: string;
    } = {},
  ) {
    const memberUserId = await this.followUpMemberScope(
      ctx,
      options.memberUserId,
    );
    const page = Number.isSafeInteger(options.page)
      ? Math.max(1, Math.min(100_000, options.page!))
      : 1;
    const limit = Number.isSafeInteger(options.limit)
      ? Math.max(1, Math.min(100, options.limit!))
      : 50;
    const [rows, total] = await this.repo.listFollowUps(ctx, {
      ...options,
      memberUserId,
      page,
      limit,
    });
    const data = await Promise.all(
      rows.map(async (row) => ({
        ...followUpSummary(row),
        contact: row.action.contactId
          ? await this.contactView(ctx, row.action.contactId)
          : null,
        lastAction: row.events[0]
          ? { kind: row.events[0].kind, at: row.events[0].occurredAt }
          : null,
      })),
    );
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getFollowUp(ctx: OwnershipContext, actionId: string, after?: string) {
    const memberUserId = await this.followUpMemberScope(ctx);
    const owned = await this.repo.findFollowUpForAction(
      ctx,
      actionId,
      memberUserId,
    );
    if (!owned) throw new NotFoundException("Follow-up not found");
    const row = await this.repo.followUpSnapshot(owned.id);
    if (!row) throw new NotFoundException("Follow-up not found");
    if (after && !(await this.repo.ownsFollowUpEvent(row.id, after)))
      throw new NotFoundException("Follow-up event not found");
    const events = await this.repo.followUpEvents(row.id, after);
    const linkedCalls = [
      row.handoff?.agentCall,
      ...row.callbacks.map((step) => step.agentCall),
    ].filter((call): call is NonNullable<typeof call> => Boolean(call));
    const uniqueCalls = [
      ...new Map(linkedCalls.map((call) => [call.id, call])).values(),
    ];
    // An objective owner can see its progress, but not another member's call
    // metadata, transcript, notes or recording. Billing reads follow that rule.
    const calls = uniqueCalls
      .filter(
        (call) =>
          call.organizationId === ctx.organizationId &&
          (!memberUserId || call.userId === memberUserId) &&
          (!call.call ||
            (call.call.organizationId === ctx.organizationId &&
              (!memberUserId || call.call.userId === memberUserId))),
      )
      .map((call) => ({
        id: call.callId,
        agentCallId: call.id,
        status: call.call?.status ?? call.status,
        duration: call.call?.durationSeconds ?? null,
        callCost: call.call?.totalCost ?? null,
        aiCost: call.aiCostDebitedAt ? call.aiChargedCredits : null,
        settled: call.call?.totalCost != null && call.aiCostDebitedAt != null,
      }));
    return {
      ...followUpSummary(row),
      contact: row.action.contactId
        ? await this.contactView(ctx, row.action.contactId)
        : null,
      source: { type: row.sourceType, revision: row.sourceRevision },
      history: events.map(
        ({
          id,
          actionKey,
          revision,
          kind,
          actorType,
          actorId,
          evidence,
          occurredAt,
        }) => ({
          id,
          actionKey,
          revision,
          kind,
          actorType,
          actorId,
          evidence,
          occurredAt,
        }),
      ),
      nextHistoryCursor: events.length === 100 ? events[99].id : null,
      steps: row.callbacks.map((step) => ({
        id: step.id,
        kind: step.agentCallbackKind,
        scheduledAt: step.scheduledAt,
        notBefore: step.notBefore,
        status: step.status,
        reason: step.reason,
        dispatchCommittedAt: step.dispatchCommittedAt,
      })),
      calls,
      costsRestricted: calls.length !== uniqueCalls.length,
    };
  }

  async controlFollowUp(
    ctx: OwnershipContext,
    actionId: string,
    input: {
      operation:
        | "pause"
        | "resume"
        | "close"
        | "take_over"
        | "return_automatic";
      expectedRevision: number;
      reason?: string;
      closureReason?: FollowUpClosureReason;
    },
    now = new Date(),
  ) {
    const memberUserId = await this.followUpMemberScope(ctx);
    const row = await this.repo.findFollowUpForAction(
      ctx,
      actionId,
      memberUserId,
    );
    if (!row) throw new NotFoundException("Follow-up not found");
    if (
      row.revision !== input.expectedRevision ||
      ["resolved", "closed"].includes(row.state)
    )
      throw new ConflictException("Follow-up changed; reload before acting");
    const reason = input.reason?.trim().slice(0, 1000);
    let plan: FollowUpPlan;
    let resumeAt: Date | undefined;
    switch (input.operation) {
      case "pause":
      case "take_over":
        if (!reason) throw new BadRequestException("A reason is required");
        plan = {
          state: "paused",
          reason,
          nextAction: null,
          nextActionAt: null,
          ...(input.operation === "take_over"
            ? { mode: "manual" as const }
            : {}),
          evidence: { reason, intervention: input.operation },
        };
        break;
      case "close":
        if (
          !reason ||
          !input.closureReason ||
          !Object.values(FollowUpClosureReason).includes(input.closureReason)
        )
          throw new BadRequestException(
            "A closure reason and explanation are required",
          );
        plan = {
          state: "closed",
          reason,
          closureReason: input.closureReason,
          nextAction: null,
          nextActionAt: null,
          evidence: { reason, attribution: "human", actorId: ctx.userId },
        };
        break;
      case "resume":
      case "return_automatic": {
        assertVoiceAgentAutomations(ctx);
        if (input.operation === "resume" && row.mode === "manual")
          throw new ConflictException(
            "Return to automatic execution explicitly",
          );
        if (!["paused", "blocked"].includes(row.state))
          throw new ConflictException(
            "Only paused or blocked objectives can resume",
          );
        await this.reconcileFollowUp(row.id, now);
        const current = await this.repo.findFollowUpForAction(
          ctx,
          actionId,
          memberUserId,
        );
        if (!current || current.revision !== row.revision)
          throw new ConflictException(
            "Follow-up changed during validation; reload before acting",
          );
        const snapshot = await this.repo.followUpSnapshot(row.id);
        if (!snapshot?.handoff || snapshot.handoff.offeredAt)
          throw new ConflictException(
            "The meeting change needs an exceptional decision",
          );
        const contact = snapshot.action.contactId
          ? await this.contacts.findByIdForOwner(ctx, snapshot.action.contactId)
          : null;
        const phone = contact ? normalizePhoneE164(contact.phoneNumber) : null;
        if (!phone || (await this.compliance.findOnDNC(ctx, phone)))
          throw new ConflictException(
            "The follow-up contact is unavailable or on the Do-Not-Call list",
          );
        const membership = await Promise.all([
          this.organizations.isMember(
            row.configuredByUserId,
            ctx.organizationId,
          ),
          this.organizations.isMember(
            row.responsibleUserId,
            ctx.organizationId,
          ),
        ]);
        const automation = await this.automations.findForOwner(
          ctx,
          "appointment_booking",
        );
        const agent = automation?.agentId
          ? await this.agents.findByIdForOwner(ctx, automation.agentId)
          : null;
        if (
          membership.some((value) => !value) ||
          !automation?.enabled ||
          !agent ||
          agent.id !== row.agentId ||
          agent.status !== "active" ||
          agent.deletedAt ||
          !agent.providerAssistantId ||
          !agent.toolSecretHash
        )
          throw new ConflictException(
            "The follow-up specialist or ownership is not ready",
          );
        if (
          row.attemptCount >= row.maxAttempts ||
          row.recoveryCount >= row.maxRecoveries ||
          row.expiresAt <= now
        )
          throw new ConflictException("The follow-up policy is exhausted");
        const calendar = snapshot.handoff.calendarId
          ? await this.calendars.findByIdForOwner(
              ctx,
              snapshot.handoff.calendarId,
            )
          : await this.calendars.findDefault(ctx);
        if (!calendar)
          throw new ConflictException("The meeting calendar is unavailable");
        const policy = await this.reminderPolicies.findForCalendar(
          ctx,
          calendar.id,
        );
        const at = nextCallingWindowMoment(
          new Date(now.getTime() + 60 * 60_000),
          policy ? readCallingWindow(policy) : DEFAULT_CALLING_WINDOW,
          calendar.timezone,
        );
        if (!at || at >= row.expiresAt)
          throw new ConflictException("No valid calling window remains");
        resumeAt = at;
        plan = {
          state: "scheduled",
          reason: "explicitly_resumed",
          mode: "automatic",
          nextAction: "review_recovery",
          nextActionAt: at,
          timingBasis: "policy",
          evidence: {
            intervention: input.operation,
            nextActionAt: at.toISOString(),
          },
        };
        break;
      }
      default:
        throw new BadRequestException("Unknown follow-up operation");
    }
    const updated = await this.repo.applyFollowUpTransition({
      id: row.id,
      expectedRevision: row.revision,
      plan,
      key: `control:${row.revision}:${input.operation}`,
      kind:
        input.operation === "close" ? "objective_closed" : "human_intervention",
      actorId: ctx.userId,
      now,
      resumeAt,
    });
    if (!updated)
      throw new ConflictException("Follow-up changed; reload before acting");
    return this.getFollowUp(ctx, actionId);
  }

  private async followUpMemberScope(
    ctx: OwnershipContext,
    requested?: string,
  ): Promise<string | undefined> {
    if (!ctx.organizationId) throw new NotFoundException("Follow-up not found");
    if (!(await this.organizations.isMember(ctx.userId, ctx.organizationId)))
      throw new NotFoundException("Follow-up not found");
    const admins = await this.organizations.listAdminUserIds(
      ctx.organizationId,
      [ctx.userId],
    );
    return admins.includes(ctx.userId) ? requested : ctx.userId;
  }

  private async contactView(ctx: OwnershipContext, id: string) {
    const contact = await this.contacts.findByIdForOwner(ctx, id);
    return contact
      ? { id: contact.id, name: contact.name, phoneNumber: contact.phoneNumber }
      : null;
  }

  private async assertRecommendation(ctx: OwnershipContext, id: string) {
    if (await this.repo.findFollowUpForAction(ctx, id))
      throw new ConflictException(
        "Use the follow-up lifecycle operations; completing a call is not resolution evidence",
      );
  }

  private async requireOwned(
    ctx: OwnershipContext,
    id: string,
    access: { memberUserId?: string } = {},
  ): Promise<PendingAction> {
    const action = await this.repo.findById(id);
    if (!action) throw new NotFoundException("Pending action not found");
    if (ctx.organizationId) {
      if (action.organizationId !== ctx.organizationId) {
        throw new ForbiddenException("Access denied");
      }
      if (access.memberUserId && action.userId !== access.memberUserId) {
        throw new ForbiddenException("Access denied");
      }
    } else if (action.userId !== ctx.userId || action.organizationId !== null) {
      throw new ForbiddenException("Access denied");
    }
    return action;
  }

  private async decrementIfWasPending(action: PendingAction): Promise<void> {
    if (
      action.status === PendingActionStatus.pending &&
      action.pipelineType &&
      action.contextKey
    ) {
      await this.activationRepo.adjustPendingActionCount(
        action.pipelineType,
        action.contextKey,
        -1,
      );
    }
  }
}

function samePlan(row: FollowUpSnapshot, plan: FollowUpPlan): boolean {
  return (
    row.state === plan.state &&
    row.reason === plan.reason &&
    row.nextAction === plan.nextAction &&
    (isObservationAction(plan.nextAction) ||
      row.nextActionAt?.getTime() === plan.nextActionAt?.getTime()) &&
    row.timingBasis === (plan.timingBasis ?? "none") &&
    (plan.activeCallbackId === undefined ||
      row.activeCallbackId === plan.activeCallbackId)
  );
}

// Polling an unchanged call is housekeeping, not new business progress. Keep
// its next review current without inflating action history or invalidating controls.
function isObservationAction(action: string | null): boolean {
  return [
    "reconcile_placement",
    "reconcile_call",
    "reconcile_handoff",
  ].includes(action ?? "");
}

function followUpSummary(
  row: Pick<
    FollowUpSnapshot,
    | "id"
    | "pendingActionId"
    | "objectiveType"
    | "desiredResult"
    | "state"
    | "mode"
    | "revision"
    | "responsibleUserId"
    | "configuredByUserId"
    | "agentId"
    | "lastActionAt"
    | "nextAction"
    | "nextActionAt"
    | "timingBasis"
    | "reason"
    | "attemptCount"
    | "maxAttempts"
    | "recoveryCount"
    | "maxRecoveries"
    | "expiresAt"
    | "createdAt"
    | "updatedAt"
    | "resolvedAt"
    | "closedAt"
    | "resolutionEvidence"
    | "closureReason"
    | "closureEvidence"
  >,
) {
  return {
    id: row.id,
    pendingActionId: row.pendingActionId,
    objectiveType: row.objectiveType,
    desiredResult: row.desiredResult,
    state: row.state,
    mode: row.mode,
    revision: row.revision,
    responsibleUserId: row.responsibleUserId,
    configuredByUserId: row.configuredByUserId,
    executorAgentId: row.agentId,
    lastActionAt: row.lastActionAt,
    nextAction: row.nextAction,
    nextActionAt: row.nextActionAt,
    timingBasis: row.timingBasis,
    reason: row.reason,
    attempts: {
      used: row.attemptCount,
      limit: row.maxAttempts,
      recoveries: row.recoveryCount,
      recoveryLimit: row.maxRecoveries,
    },
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    resolvedAt: row.resolvedAt,
    closedAt: row.closedAt,
    resolutionEvidence: row.resolutionEvidence,
    closureReason: row.closureReason,
    closureEvidence: row.closureEvidence,
  };
}
