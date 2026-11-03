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
  if (
    !meeting ||
    meeting.organizationId !== row.action.organizationId ||
    meeting.contactId !== row.action.contactId
  ) {
    return end("source_meeting_unavailable", "cancelled");
  }
  if (
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
  if (!handoff) return blocked("handoff_unavailable");
  if (handoff.offeredAt) return blocked("reschedule_commit_pending");
  if (
    handoff.requestStatus === "needs_attention" &&
    handoff.resolution !== "placement_pending_reconciliation"
  ) {
    const reason = handoff.resolution ?? "exceptional_decision_required";
    if (
      [
        "no_response",
        "handoff_not_completed",
        "person_prefers_callback",
      ].includes(reason)
    )
      return end(reason, "attempts_exhausted");
    return blocked(reason);
  }
  const live = (
    call: { status: string; endedAt: Date | null } | null | undefined,
  ) => call && !call.endedAt && !["completed", "failed"].includes(call.status);
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
  if (live(handoff.agentCall.call)) {
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
    nextActionAt: handoff.reviewAt,
    activeCallbackId: null,
  };
}
