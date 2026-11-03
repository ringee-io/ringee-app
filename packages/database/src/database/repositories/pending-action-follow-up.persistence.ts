import {
  FollowUpClosureReason,
  FollowUpExecutionMode,
  FollowUpState,
  PendingActionFollowUp,
  Prisma,
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
  meetingId: string;
  meetingScheduledAt: Date;
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

export async function createFollowUpInTransaction(
  tx: Prisma.TransactionClient,
  handoffId: string,
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
      sourceId: input.sourceId ?? handoffId,
      sourceRevision: input.sourceRevision,
      objectiveType: input.objectiveType,
      desiredResult: input.desiredResult,
      configuredByUserId: input.configuredByUserId,
      responsibleUserId: input.userId,
      agentId: input.agentId,
      meetingId: input.meetingId,
      meetingScheduledAt: input.meetingScheduledAt,
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
