import {
  FollowUpClosureReason,
  FollowUpExecutionMode,
  FollowUpState,
  PendingActionFollowUp,
  Prisma,
  Call,
} from "@prisma/client";

/** Transaction helpers of PendingActionRepository, shared with the handoff and
 * callback repositories so their observations cannot be lost between writes. */
export interface NewFollowUpObjective {
  userId: string;
  organizationId: string;
  contextKey: string;
  configuredByUserId: string;
  contactId: string;
  callId: string | null;
  sourceKey: string;
  sourceType: string;
  /** Defaults to the handoff id allocated by the enrollment transaction. */
  sourceId?: string;
  sourceRevision: number;
  objectiveType: string;
  desiredResult: string;
  agentId: string | null;
  meetingId?: string | null;
  meetingScheduledAt?: Date | null;
  automationId?: string | null;
  calendarId?: string | null;
  commitment?: Prisma.InputJsonValue;
  timingBasis?: string;
  expiresAt: Date;
  state: FollowUpState;
  reason: string;
  nextAction: string | null;
  nextActionAt: Date | null;
}

export interface FollowUpPlan {
  state: FollowUpState;
  reason: string | null;
  nextAction: string | null;
  nextActionAt: Date | null;
  timingBasis?: string;
  activeCallbackId?: string | null;
  mode?: FollowUpExecutionMode;
  closureReason?: FollowUpClosureReason;
  evidence?: Prisma.InputJsonValue;
}

export const FOLLOW_UP_TERMINAL: FollowUpState[] = ["resolved", "closed"];

/** Authorized by PendingActionService; persisted alongside the human outcome. */
export interface HumanOutcomeAssignment {
  organizationId: string;
  userId: string;
  actorUserId: string;
  commitment: Prisma.InputJsonValue;
  hasNewCommitment: boolean;
  objective: NewFollowUpObjective | null;
  closeReason: FollowUpClosureReason;
  closeContact: boolean;
  scheduledAt: Date;
  campaignLeadId?: string;
}

export async function acceptHumanOutcome(
  tx: Prisma.TransactionClient,
  call: Call,
  changed: boolean,
  input: HumanOutcomeAssignment,
) {
  if (
    call.organizationId !== input.organizationId ||
    call.userId !== input.userId ||
    call.source === "ai_voice_agent" ||
    !call.contactId
  )
    throw new Error("Human follow-up source changed");
  if (input.objective) {
    if (input.objective.contactId !== call.contactId)
      throw new Error("Follow-up contact changed");
    const automationId = input.objective.automationId;
    if (automationId)
      await tx.$queryRaw`SELECT "id" FROM "AiVoiceAgentAutomation" WHERE "id" = ${automationId}::uuid FOR UPDATE`;
    const automation = automationId
      ? await tx.aiVoiceAgentAutomation.findFirst({
          where: {
            id: automationId,
            organizationId: input.organizationId,
            capability: "appointment_booking",
          },
        })
      : null;
    const settings = automation?.settings as {
      humanFollowUp?: { enabled?: boolean };
    } | null;
    if (settings?.humanFollowUp?.enabled !== true)
      throw new Error("Follow-up enrollment policy changed");
    if (
      !(await tx.organizationMembership.count({
        where: { organizationId: input.organizationId, userId: call.userId! },
      }))
    )
      throw new Error("Follow-up membership changed");
  }
  const sourceKey = `${input.organizationId}:human_call:${call.id}`;
  let row = await tx.pendingActionFollowUp.findUnique({ where: { sourceKey } });
  // An unchanged old outcome must never enroll when a policy is first enabled.
  if (!changed && !row) return null;
  if (row?.sourceRevision === call.outcomeRevision) return row;
  const now = new Date();
  if (input.closeContact) {
    const others = await tx.pendingActionFollowUp.findMany({
      where: {
        action: {
          organizationId: input.organizationId,
          contactId: call.contactId,
        },
        state: { notIn: FOLLOW_UP_TERMINAL },
      },
      orderBy: { id: "asc" },
    });
    for (const other of others) {
      const locked = await lockFollowUp(tx, other.id);
      if (locked && !FOLLOW_UP_TERMINAL.includes(locked.state))
        await applyFollowUpPlan(
          tx,
          locked,
          {
            state: "closed",
            reason: `human_outcome_${call.outcome}`,
            closureReason: input.closeReason,
            nextAction: null,
            nextActionAt: null,
            evidence: {
              callId: call.id,
              sourceRevision: call.outcomeRevision,
              outcome: call.outcome,
            },
          },
          {
            key: `human:${call.id}:${call.outcomeRevision}:close`,
            kind: "objective_closed",
            actorType: "human",
            actorId: input.actorUserId,
          },
          now,
        );
    }
  }
  if (!input.objective) {
    if (row && !input.closeContact && !FOLLOW_UP_TERMINAL.includes(row.state)) {
      const locked = await lockFollowUp(tx, row.id);
      if (locked)
        await applyFollowUpPlan(
          tx,
          locked,
          {
            state: "closed",
            reason: "source_outcome_corrected",
            closureReason: "cancelled",
            nextAction: null,
            nextActionAt: null,
            evidence: { callId: call.id, sourceRevision: call.outcomeRevision },
          },
          {
            key: `source:${call.outcomeRevision}:withdraw`,
            kind: "objective_closed",
          },
          now,
        );
    }
    return row
      ? tx.pendingActionFollowUp.findUnique({ where: { id: row.id } })
      : null;
  }
  if (!row) {
    // Contact lock is held by recordOutcome: separate human calls cannot each
    // claim the same contact for automatic work.
    const active = await tx.pendingActionFollowUp.findFirst({
      where: {
        action: {
          organizationId: input.organizationId,
          contactId: call.contactId,
        },
        state: { notIn: FOLLOW_UP_TERMINAL },
      },
      include: { action: { select: { userId: true } } },
    });
    // Never expose another member's private objective through an outcome save.
    if (active) return active.action.userId === input.userId ? active : null;
    row = await createFollowUpInTransaction(tx, null, {
      ...input.objective,
      sourceKey,
      sourceId: call.id,
      sourceRevision: call.outcomeRevision,
    });
  } else {
    row = (await lockFollowUp(tx, row.id))!;
    // Corrections invalidate uncommitted work; they never undo explicit controls.
    await tx.callbackTask.updateMany({
      where: {
        followUpId: row.id,
        dispatchCommittedAt: null,
        status: { in: ["scheduled", "due", "in_progress"] },
      },
      data: {
        status: "cancelled",
        reason: "source_outcome_corrected",
        claimToken: null,
        leaseExpiresAt: null,
      },
    });
    const controlled =
      FOLLOW_UP_TERMINAL.includes(row.state) ||
      row.state === "paused" ||
      row.mode === "manual";
    row = await tx.pendingActionFollowUp.update({
      where: { id: row.id },
      data: {
        sourceRevision: call.outcomeRevision,
        commitment: input.commitment,
        agentId: input.objective.agentId,
        automationId: input.objective.automationId,
        calendarId: input.objective.calendarId,
        desiredResult: input.objective.desiredResult,
        objectiveType: input.objective.objectiveType,
        revision: { increment: 1 },
        reviewAt: now,
      },
    });
    await appendFollowUpEvent(tx, row, {
      key: `source:${call.outcomeRevision}`,
      kind: "source_corrected",
      actorType: "human",
      actorId: input.actorUserId,
    });
    if (controlled) return row;
    row = await applyFollowUpPlan(
      tx,
      row,
      {
        state: input.objective.state,
        reason: input.objective.reason,
        nextAction: input.objective.nextAction,
        nextActionAt: input.objective.nextActionAt,
        timingBasis: input.objective.timingBasis,
      },
      {
        key: `source:${call.outcomeRevision}:assigned`,
        kind: "assignment_accepted",
      },
      now,
    );
  }
  await tx.callbackTask.create({
    data: {
      userId: input.userId,
      organizationId: input.organizationId,
      contactId: call.contactId,
      callId: call.id,
      campaignLeadId: input.campaignLeadId,
      followUpId: row.id,
      sourceRevision: call.outcomeRevision,
      agentId: row.agentId,
      agentCallbackKind: row.timingBasis === "agreed" ? "agreed" : "policy",
      agentCallbackKey: `followup:${row.id}:source:${call.outcomeRevision}`,
      scheduledAt: input.scheduledAt,
      note: row.desiredResult,
      status: row.state === "blocked" ? "cancelled" : "scheduled",
      reason: row.state === "blocked" ? "objective_blocked" : null,
    },
  });
  // Only the callback recorded for this source is transferred. Other historical
  // human commitments are not converted to AI by enabling this policy.
  await tx.callbackTask.updateMany({
    where: {
      callId: call.id,
      organizationId: input.organizationId,
      followUpId: null,
      agentCallbackKind: null,
      status: { in: ["scheduled", "due"] },
    },
    data: { status: "cancelled", reason: "assigned_to_follow_up" },
  });
  if (input.campaignLeadId)
    await tx.campaignLead.updateMany({
      where: {
        id: input.campaignLeadId,
        contactId: call.contactId,
        campaign: { organizationId: input.organizationId },
      },
      data: {
        status: "completed",
        lockedBy: null,
        lockedAt: null,
        nextCallAt: null,
      },
    });
  return row;
}

export async function createFollowUpInTransaction(
  tx: Prisma.TransactionClient,
  handoffId: string | null,
  input: NewFollowUpObjective,
) {
  const existing = await tx.pendingActionFollowUp.findUnique({
    where: { sourceKey: input.sourceKey },
  });
  if (existing) return existing;
  const action = await tx.pendingAction.create({
    data: {
      userId: input.userId,
      organizationId: input.organizationId,
      contactId: input.contactId,
      // Calls belong to their executor, not to the commercial member. The
      // objective detail exposes only calls the reader is authorized to see.
      callId: input.callId,
      type: "book_meeting",
      source: "rule",
      priority: "high",
      title: input.desiredResult,
      contextType: "organization_outside_campaign",
      contextKey: input.contextKey,
      countsTowardBadge: input.state === "blocked",
    },
  });
  const objective = await tx.pendingActionFollowUp.create({
    data: {
      pendingActionId: action.id,
      handoffId,
      sourceKey: input.sourceKey,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? handoffId!,
      sourceRevision: input.sourceRevision,
      objectiveType: input.objectiveType,
      desiredResult: input.desiredResult,
      configuredByUserId: input.configuredByUserId,
      responsibleUserId: input.userId,
      agentId: input.agentId,
      meetingId: input.meetingId,
      meetingScheduledAt: input.meetingScheduledAt,
      automationId: input.automationId,
      calendarId: input.calendarId,
      commitment: input.commitment,
      timingBasis: input.timingBasis,
      expiresAt: input.expiresAt,
      state: input.state,
      reason: input.reason,
      nextAction: input.nextAction,
      nextActionAt: input.nextActionAt,
    },
  });
  await appendFollowUpEvent(tx, objective, {
    key: `source:${input.sourceKey}`,
    kind: "objective_initiated",
    evidence: {
      sourceType: input.sourceType,
      sourceRevision: input.sourceRevision,
    },
  });
  if (handoffId)
    await appendFollowUpEvent(tx, objective, {
      key: `handoff:${handoffId}:prepared`,
      kind:
        input.state === "blocked"
          ? "handoff_preparation_blocked"
          : "handoff_prepared",
      evidence: { reason: input.reason },
    });
  return objective;
}

/** Lock order everywhere: handoff -> objective -> callback. Dispatch also locks
 * the meeting and automation first, like reminder dispatch. */
export async function lockFollowUp(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<PendingActionFollowUp | null> {
  const seed = await tx.pendingActionFollowUp.findUnique({ where: { id } });
  if (!seed) return null;
  if (seed.handoffId) {
    await tx.$queryRaw`SELECT "id" FROM "AiVoiceAgentHandoff" WHERE "id" = ${seed.handoffId}::uuid FOR UPDATE`;
  }
  await tx.$queryRaw`SELECT "id" FROM "PendingActionFollowUp" WHERE "id" = ${id}::uuid FOR UPDATE`;
  return tx.pendingActionFollowUp.findUnique({ where: { id } });
}

export async function appendFollowUpEvent(
  tx: Prisma.TransactionClient,
  objective: Pick<PendingActionFollowUp, "id" | "revision">,
  event: {
    key: string;
    kind: string;
    actorType?: string;
    actorId?: string;
    evidence?: Prisma.InputJsonValue;
    at?: Date;
  },
): Promise<boolean> {
  const { count } = await tx.pendingActionFollowUpEvent.createMany({
    data: [
      {
        followUpId: objective.id,
        actionKey: event.key,
        revision: objective.revision,
        kind: event.kind,
        actorType: event.actorType ?? "system",
        actorId: event.actorId,
        evidence: event.evidence,
        occurredAt: event.at ?? new Date(),
      },
    ],
    skipDuplicates: true,
  });
  return count === 1;
}

/** An observation changes no business result. It invalidates stale plans and
 * gives the existing callback tick a durable reason to reconcile. */
export async function observeFollowUp(
  tx: Prisma.TransactionClient,
  handoffId: string,
  event: Parameters<typeof appendFollowUpEvent>[2],
): Promise<void> {
  const seed = await tx.pendingActionFollowUp.findUnique({
    where: { handoffId },
  });
  if (!seed) return;
  const objective = await lockFollowUp(tx, seed.id);
  if (!objective) return;
  if (await appendFollowUpEvent(tx, objective, event)) {
    await tx.pendingActionFollowUp.update({
      where: { id: objective.id },
      data: {
        revision: { increment: 1 },
        lastActionAt: event.at ?? new Date(),
        reviewAt: new Date(),
      },
    });
  }
}

export async function applyFollowUpPlan(
  tx: Prisma.TransactionClient,
  objective: PendingActionFollowUp,
  plan: FollowUpPlan,
  event: Parameters<typeof appendFollowUpEvent>[2],
  now: Date,
) {
  const terminal = FOLLOW_UP_TERMINAL.includes(plan.state);
  const suspended =
    terminal ||
    ["paused", "blocked"].includes(plan.state) ||
    plan.mode === "manual";
  const updated = await tx.pendingActionFollowUp.update({
    where: { id: objective.id },
    data: {
      state: plan.state,
      reason: plan.reason,
      nextAction: plan.nextAction,
      nextActionAt: plan.nextActionAt,
      timingBasis: plan.timingBasis ?? "none",
      mode: plan.mode,
      activeCallbackId: plan.activeCallbackId,
      revision: { increment: 1 },
      reviewAt: new Date(now.getTime() + 60_000),
      lastActionAt: now,
      ...(plan.state === "resolved"
        ? { resolvedAt: now, resolutionEvidence: plan.evidence }
        : {}),
      ...(plan.state === "closed"
        ? {
            closedAt: now,
            closureReason: plan.closureReason,
            closureEvidence: plan.evidence,
          }
        : {}),
    },
  });
  await appendFollowUpEvent(tx, updated, event);
  await tx.pendingAction.update({
    where: { id: objective.pendingActionId },
    data: {
      status:
        plan.state === "resolved"
          ? "completed"
          : plan.state === "closed"
            ? "dismissed"
            : "pending",
      completedAt: terminal ? now : null,
      countsTowardBadge: plan.state === "blocked",
      dueAt: plan.nextActionAt,
      reason: plan.reason,
      nextBestAction: plan.nextAction,
    },
  });
  if (objective.handoffId) {
    await tx.aiVoiceAgentHandoff.update({
      where: { id: objective.handoffId },
      data: {
        requestStatus:
          plan.state === "resolved"
            ? "resolved"
            : plan.state === "closed"
              ? "closed"
              : suspended
                ? "needs_attention"
                : "pending",
        resolution: suspended ? plan.reason : null,
        ...(terminal ? { resolvedAt: now } : {}),
        reviewAt: plan.nextActionAt ?? new Date(now.getTime() + 60_000),
      },
    });
  }
  if (suspended) {
    // Once dispatched, a call may finish and settle. Everything before that
    // point is invalidated, including a claimed worker in provider preparation.
    await tx.callbackTask.updateMany({
      where: {
        followUpId: objective.id,
        status: { in: ["scheduled", "due", "in_progress"] },
        dispatchCommittedAt: null,
      },
      data: {
        status: "cancelled",
        reason: `objective_${plan.state}`,
        claimToken: null,
        leaseExpiresAt: null,
      },
    });
  }
  return updated;
}
