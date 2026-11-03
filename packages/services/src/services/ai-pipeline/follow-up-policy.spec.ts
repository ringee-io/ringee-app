import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Meeting } from "@ringee/database";
import { planFollowUp, type FollowUpSnapshot } from "./follow-up-policy";

const now = new Date("2026-11-03T12:00:00Z");
const meeting = {
  id: "meeting",
  contactId: "contact",
  organizationId: "org",
  scheduleVersion: 2,
  scheduledAt: new Date(now.getTime() - 60_000),
  status: "scheduled",
} as Meeting;
const objective = {
  state: "waiting",
  mode: "automatic",
  sourceRevision: 2,
  meetingScheduledAt: meeting.scheduledAt,
  expiresAt: new Date(now.getTime() + 7 * 86_400_000),
  attemptCount: 0,
  maxAttempts: 3,
  recoveryCount: 0,
  maxRecoveries: 1,
  action: { organizationId: "org", contactId: "contact" },
  callbacks: [],
  handoff: {
    status: "completed",
    requestStatus: "pending",
    offeredAt: null,
    reviewAt: now,
    agentCall: { call: { status: "completed", endedAt: now } },
  },
} as unknown as FollowUpSnapshot;

describe("persistent follow-up business results", () => {
  it("a successful handoff, ended call and past original meeting resolve nothing", () => {
    assert.equal(planFollowUp(objective, meeting, now)?.state, "recovering");
  });
  it("availability is progress requiring a decision, never a moved meeting", () => {
    const plan = planFollowUp(
      { ...objective, handoff: { ...objective.handoff!, offeredAt: now } },
      meeting,
      now,
    );
    assert.equal(plan?.state, "blocked");
    assert.equal(plan?.reason, "reschedule_commit_pending");
  });
  it("only a newer active meeting at a different time proves rescheduling, even while paused", () => {
    const changed = {
      ...meeting,
      scheduleVersion: 3,
      scheduledAt: new Date(now.getTime() + 86_400_000),
    };
    const plan = planFollowUp({ ...objective, state: "paused" }, changed, now);
    assert.equal(plan?.state, "resolved");
    assert.equal(
      (plan?.evidence as { attribution: string }).attribution,
      "authoritative_meeting_record",
    );
    assert.notEqual(
      planFollowUp(objective, { ...changed, status: "cancelled" }, now)?.state,
      "resolved",
    );
    assert.notEqual(
      planFollowUp(objective, { ...meeting, scheduleVersion: 3 }, now)?.state,
      "resolved",
    );
  });
  it("no response closes without success only when the persisted policy is exhausted", () => {
    const plan = planFollowUp({ ...objective, recoveryCount: 1 }, meeting, now);
    assert.equal(plan?.state, "closed");
    assert.equal(plan?.closureReason, "attempts_exhausted");
  });
  it("expiration is distinct from refusal or exhausted attempts", () => {
    const plan = planFollowUp({ ...objective, expiresAt: now }, meeting, now);
    assert.equal(plan?.closureReason, "expired");
  });
  it("a projected placement exception keeps reconciling the original call", () => {
    const pending = {
      ...objective,
      state: "blocked",
      handoff: {
        ...objective.handoff!,
        requestStatus: "needs_attention",
        resolution: "placement_pending_reconciliation",
      },
      callbacks: [
        {
          id: "callback",
          status: "missed",
          reason: "placement_unconfirmed",
          dispatchCommittedAt: now,
          agentCall: { status: "created", providerCallControlId: null },
        },
      ],
    } as unknown as FollowUpSnapshot;
    const plan = planFollowUp(pending, meeting, now);
    assert.equal(plan?.state, "blocked");
    assert.equal(plan?.nextAction, "reconcile_placement");
    assert.equal(plan?.activeCallbackId, "callback");
  });
  it("manual takeover cannot silently resume from a routine reconciliation", () => {
    assert.equal(
      planFollowUp(
        { ...objective, mode: "manual", state: "paused" },
        meeting,
        now,
      ),
      null,
    );
  });
});
