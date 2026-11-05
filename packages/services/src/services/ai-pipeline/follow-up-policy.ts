import {
  type FollowUpPlan,
  type Meeting,
  type PendingActionRepository,
} from "@ringee/database";

export type FollowUpSnapshot = NonNullable<
  Awaited<ReturnType<PendingActionRepository["followUpSnapshot"]>>
>;

/** The business result is read from the stored meeting, never a call outcome,
 * a transcript inference, a handoff acknowledgement or a list of slots. */
export function planFollowUp(
  row: FollowUpSnapshot,
  meeting: Meeting | null,
  now: Date,
): FollowUpPlan | null {
  if (["resolved", "closed"].includes(row.state)) return null;
  const handoff = row.handoff;
  const end = (
    reason: string,
    closureReason: "cancelled" | "expired" | "attempts_exhausted",
  ): FollowUpPlan => ({
    state: "closed",
    reason,
    closureReason,
    nextAction: null,
    nextActionAt: null,
    evidence: { reason, sourceRevision: row.sourceRevision },
  });
  const human = row.sourceType === "human_call_outcome";
  if (
    !human &&
    (!meeting ||
      meeting.organizationId !== row.action.organizationId ||
      meeting.contactId !== row.action.contactId)
  ) {
    return end("source_meeting_unavailable", "cancelled");
  }
  if (
    !human &&
    meeting &&
    meeting.scheduleVersion > row.sourceRevision &&
    ["scheduled", "rescheduled"].includes(meeting.status) &&
    row.meetingScheduledAt &&
    meeting.scheduledAt.getTime() !== row.meetingScheduledAt.getTime()
  ) {
    return {
      state: "resolved",
      reason: "meeting_moved",
      nextAction: null,
      nextActionAt: null,
      evidence: {
        kind: "stored_meeting_schedule_change",
        meetingId: meeting.id,
        fromRevision: row.sourceRevision,
        toRevision: meeting.scheduleVersion,
        from: row.meetingScheduledAt.toISOString(),
        to: meeting.scheduledAt.toISOString(),
        attribution: "authoritative_meeting_record",
      },
    };
  }
  if (now >= row.expiresAt) return end("objective_expired", "expired");
  if (row.state === "paused" || row.mode === "manual") return null;
  const blocked = (reason: string): FollowUpPlan => ({
    state: "blocked",
    reason,
    nextAction: "exceptional_decision",
    nextActionAt: null,
  });
  if (!human && !handoff) return blocked("handoff_unavailable");
  const live = (
    call: { status: string; endedAt: Date | null } | null | undefined,
  ) => call && !call.endedAt && !["completed", "failed"].includes(call.status);
  // Offered times wait for a person only once nobody is on the phone and no
  // callback is still to come: while the call that offered them is live, the
  // specialist may still move the meeting; a callback the person agreed to is
  // the next step, as the handoff's own review has it. Blocking would settle
  // the request under either, and withdraw a callback already promised.
  if (
    handoff?.offeredAt &&
    !live(handoff.agentCall.call) &&
    !row.callbacks.some(
      (step) =>
        live(step.agentCall?.call) ||
        ["scheduled", "due", "in_progress"].includes(step.status),
    )
  )
    return blocked("reschedule_commit_pending");

  if (
    handoff?.requestStatus === "needs_attention" &&
    handoff.resolution !== "placement_pending_reconciliation"
  ) {
    const reason = handoff.resolution ?? "exceptional_decision_required";
    // A person who chose a later call has used no attempt up: what follows
    // is a person's decision (the handoff settles it for review), never a
    // closure as exhausted, whatever the counters say.
    if (["no_response", "handoff_not_completed"].includes(reason))
      return end(reason, "attempts_exhausted");
    return blocked(reason);
  }
  const latest =
    row.callbacks.find(
      (step) =>
        step.dispatchCommittedAt &&
        step.agentCall &&
        ((!step.agentCall.providerCallControlId &&
          step.agentCall.status !== "failed") ||
          live(step.agentCall.call)),
    ) ?? row.callbacks[0];
  // A committed but uncertain placement remains owned by its original step.
  // No new callback or timeout can authorize a second billable leg.
  if (
    latest?.dispatchCommittedAt &&
    latest.agentCall &&
    !latest.agentCall.providerCallControlId &&
    latest.agentCall.status !== "failed"
  ) {
    return {
      state:
        latest.reason === "placement_unconfirmed" ? "blocked" : "recovering",
      reason: "placement_pending_reconciliation",
      nextAction: "reconcile_placement",
      nextActionAt: new Date(now.getTime() + 5 * 60_000),
      activeCallbackId: latest.id,
    };
  }
  if (latest?.dispatchCommittedAt && live(latest.agentCall?.call)) {
    return {
      state: "in_progress",
      reason: "callback_call_active",
      nextAction: "reconcile_call",
      nextActionAt: new Date(now.getTime() + 5 * 60_000),
      activeCallbackId: latest.id,
    };
  }
  const open = row.callbacks.find((step) =>
    ["scheduled", "due", "in_progress"].includes(step.status),
  );
  if (open) {
    return {
      state:
        open.reason === "retry_before_placement" ||
        open.agentCallbackKind === "recovery"
          ? "recovering"
          : "scheduled",
      reason: open.reason ?? "specialist_callback_scheduled",
      nextAction: "specialist_callback",
      nextActionAt: new Date(
        Math.max(open.scheduledAt.getTime(), open.notBefore?.getTime() ?? 0),
      ),
      timingBasis: open.agentCallbackKind === "agreed" ? "agreed" : "policy",
      activeCallbackId: null,
    };
  }
  if (handoff && live(handoff.agentCall.call)) {
    return {
      state: handoff.status === "completed" ? "waiting" : "in_progress",
      reason:
        handoff.status === "completed"
          ? "awaiting_specialist_result"
          : "source_call_active",
      nextAction: "reconcile_handoff",
      nextActionAt: new Date(now.getTime() + 2 * 60_000),
      activeCallbackId: null,
    };
  }
  if (human && row.state === "blocked") return null;
  if (
    human &&
    latest &&
    ["missed", "cancelled"].includes(latest.status) &&
    !["not_placed", "retry_before_placement"].includes(latest.reason ?? "")
  )
    return blocked(latest.reason ?? "callback_execution_unavailable");
  if (
    row.attemptCount >= row.maxAttempts ||
    row.recoveryCount >= row.maxRecoveries
  ) {
    return end("contact_attempts_exhausted", "attempts_exhausted");
  }
  // The existing handoff reconciler owns recovery planning. This is its next
  // action, not another scheduler. Passing the original meeting time is inert.
  return {
    state: "recovering",
    reason: "recovery_review_pending",
    nextAction: "review_recovery",
    nextActionAt: handoff?.reviewAt ?? new Date(now.getTime() + 60 * 60_000),
    activeCallbackId: null,
  };
}
