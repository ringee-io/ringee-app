/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { apiConfiguration } from "@ringee/configuration";
import {
  VoiceAgentCallStartError,
  VoiceAgentCallStartOutcome,
} from "../voice-agent-call.service";
import { MeetingReminderCallService } from "./meeting-reminder-call.service";

/**
 * The reminder call worker (AGENT-019). What is pinned here is what keeps it
 * safe with real money and real people: a call is re-validated right before
 * the dial, a crashed worker is recovered by the dial key instead of dialing
 * again, and nothing rings outside the window or about a time that moved.
 */

const config = apiConfiguration as unknown as Record<string, unknown>;
config.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS = ["org-1"];

// Tuesday 2026-10-13 15:00 New York — inside the default 09:00–20:00 window.
const NOW = new Date("2026-10-13T19:00:00Z");
// Wednesday 15:00 New York.
const MEETING_AT = new Date("2026-10-14T19:00:00Z");

type Row = Record<string, any>;

function build(
  over: {
    execution?: Row;
    meeting?: Row | null;
    policy?: Row | null;
    agent?: Row | null;
    /** Agent calls already persisted, by idempotency key. */
    agentCallsByKey?: Record<string, Row>;
    liveCallToNumber?: boolean;
    otherActiveForMeeting?: boolean;
    startError?: Error;
  } = {},
) {
  const execution: Row = {
    id: "exec-1",
    userId: "admin-1",
    organizationId: "org-1",
    meetingId: "meeting-1",
    policyId: "policy-1",
    agentId: "agent-1",
    trigger: "policy",
    scheduleVersion: 2,
    policyVersion: 5,
    offsetMinutes: 1440,
    attempt: 1,
    idempotencyKey: "meeting:meeting-1:v2:policy:policy-1:p5:T-1440m:a1",
    fireAt: NOW,
    status: "claimed",
    dialTries: 0,
    agentCallId: null,
    ...over.execution,
  };
  const events: Array<Record<string, unknown>> = [];
  const starts: Array<Record<string, unknown>> = [];

  const service = new MeetingReminderCallService(
    {
      claimDue: async () => [execution],
      claimScheduled: async () => execution,
      beginDial: async () => {
        execution.dialTries += 1;
        events.push({ beginDial: execution.dialTries });
        return { ...execution };
      },
      markPlaced: async (_id: string, agentCallId: string) => {
        events.push({ placed: agentCallId });
        return true;
      },
      finish: async (
        _id: string,
        status: string,
        _from: string[],
        data?: Row,
      ) => {
        events.push({ finish: status, reason: data?.reason });
        return true;
      },
      defer: async (_id: string, fireAt: Date, reason: string) => {
        events.push({ defer: fireAt.toISOString(), reason });
        return true;
      },
      finishByAgentCall: async (agentCallId: string, status: string) => {
        events.push({ settled: agentCallId, status });
        return true;
      },
      listPlacedBefore: async () => [],
      hasActiveForMeeting: async () => over.otherActiveForMeeting ?? false,
      countForMeetingVersion: async () => 0,
      createMany: async () => 1,
      findByIdempotencyKey: async () => execution,
      findById: async () => execution,
    } as never,
    {
      findById: async () =>
        over.policy === undefined
          ? {
              id: "policy-1",
              enabled: true,
              version: 5,
              windowStartMinute: 540,
              windowEndMinute: 1200,
              windowDays: [0, 1, 2, 3, 4, 5, 6],
            }
          : over.policy,
      findForCalendar: async () => null,
    } as never,
    {
      findById: async () =>
        over.meeting === undefined
          ? {
              id: "meeting-1",
              organizationId: "org-1",
              userId: "owner-1",
              status: "scheduled",
              scheduleVersion: 2,
              scheduledAt: MEETING_AT,
              attendanceStatus: "pending",
              calendarId: "calendar-1",
              contactId: "contact-1",
              callId: null,
              title: "Demo",
              location: null,
              leadEmail: "elena@acme.test",
              responsibleUserId: "member-1",
              contact: {
                id: "contact-1",
                firstName: "Elena",
                lastName: "Ruiz",
                name: "Elena Ruiz",
                phoneNumber: "+13055550123",
                email: null,
              },
            }
          : over.meeting,
    } as never,
    {
      findByIdForOwner: async () => ({
        id: "calendar-1",
        timezone: "America/New_York",
      }),
      findDefault: async () => null,
    } as never,
    {
      findByIdForOwner: async () =>
        over.agent === undefined
          ? {
              id: "agent-1",
              type: "reminders_notifications",
              status: "active",
              voiceLanguage: "es",
            }
          : over.agent,
    } as never,
    {
      findByIdempotencyKey: async (key: string) =>
        over.agentCallsByKey?.[key] ?? null,
      hasLiveCallToNumber: async () => over.liveCallToNumber ?? false,
      findById: async () => null,
    } as never,
    { findForOwner: async () => null } as never,
    {
      findById: async () => ({ firstName: "Carlos", lastName: "Pérez" }),
    } as never,
    {
      startCall: async (
        ctx: Record<string, unknown>,
        agentId: string,
        input: Record<string, unknown>,
      ) => {
        starts.push({ ctx, agentId, ...input });
        if (over.startError) throw over.startError;
        return { id: "agent-call-9", status: "initiating" };
      },
    } as never,
    { previousInteractions: async () => "" } as never,
  );
  return { service, execution, events, starts };
}

describe("MeetingReminderCallService.processDue", () => {
  it("dials through the one execution path under a key persisted before the leg", async () => {
    const { service, events, starts } = build();

    const placed = await service.processDue(NOW);

    assert.equal(placed, 1);
    assert.equal(starts.length, 1);
    assert.deepEqual(starts[0]!.ctx, {
      userId: "admin-1",
      organizationId: "org-1",
    });
    assert.equal(starts[0]!.to, "+13055550123");
    assert.equal(
      starts[0]!.idempotencyKey,
      "meeting:meeting-1:v2:policy:policy-1:p5:T-1440m:a1:d1",
    );
    const variables = starts[0]!.variables as Record<string, string>;
    assert.equal(variables.first_name, "Elena");
    // The greeting only says "your upcoming meeting"; details wait for the
    // identity check.
    assert.equal(variables.notification, "su próxima reunión");
    assert.match(variables.additional_context!, /with Carlos Pérez/);
    assert.match(variables.additional_context!, /elena@acme\.test/);
    assert.deepEqual(events.at(-1), { placed: "agent-call-9" });
  });

  it("never dials about a meeting that moved since the call was planned", async () => {
    const { service, events, starts } = build({
      meeting: {
        id: "meeting-1",
        organizationId: "org-1",
        status: "scheduled",
        scheduleVersion: 3,
        scheduledAt: MEETING_AT,
        attendanceStatus: "pending",
      },
    });
    await service.processDue(NOW);
    assert.equal(starts.length, 0);
    assert.deepEqual(events.at(-1), {
      finish: "cancelled",
      reason: "meeting_changed",
    });
  });

  it("never dials a cancelled meeting", async () => {
    const { service, events, starts } = build({
      meeting: {
        id: "meeting-1",
        organizationId: "org-1",
        status: "cancelled",
        scheduleVersion: 2,
        scheduledAt: MEETING_AT,
        attendanceStatus: "pending",
      },
    });
    await service.processDue(NOW);
    assert.equal(starts.length, 0);
    assert.equal(events.at(-1)!.reason, "meeting_cancelled");
  });

  it("does not call a lead who already answered", async () => {
    const { service, starts, events } = build({
      meeting: {
        id: "meeting-1",
        organizationId: "org-1",
        status: "scheduled",
        scheduleVersion: 2,
        scheduledAt: MEETING_AT,
        attendanceStatus: "confirmed",
      },
    });
    await service.processDue(NOW);
    assert.equal(starts.length, 0);
    assert.equal(events.at(-1)!.reason, "already_answered");
  });

  it("skips, rather than rings, outside the calling window after downtime", async () => {
    const { service, starts, events } = build();
    // 23:30 New York.
    await service.processDue(new Date("2026-10-14T03:30:00Z"));
    assert.equal(starts.length, 0);
    assert.equal(events.at(-1)!.reason, "outside_window");
  });

  it("drops an execution planned under a policy version that has moved on", async () => {
    const { service, starts, events } = build({
      policy: { id: "policy-1", enabled: true, version: 6 },
    });
    await service.processDue(NOW);
    assert.equal(starts.length, 0);
    assert.equal(events.at(-1)!.reason, "policy_changed");
  });

  it("waits while the lead is already on a call with an agent", async () => {
    const { service, starts, events } = build({ liveCallToNumber: true });
    await service.processDue(NOW);
    assert.equal(starts.length, 0);
    assert.deepEqual(events.at(-1), {
      defer: "2026-10-13T19:10:00.000Z",
      reason: "lead_on_a_call",
    });
  });

  it("recovers a crashed worker by the dial key instead of dialing again", async () => {
    const key = "meeting:meeting-1:v2:policy:policy-1:p5:T-1440m:a1:d1";
    const { service, starts, events } = build({
      execution: { dialTries: 1 },
      agentCallsByKey: {
        [key]: {
          id: "agent-call-earlier",
          status: "initiating",
          providerCallControlId: "cc-earlier",
        },
      },
    });
    await service.processDue(NOW);
    assert.equal(starts.length, 0);
    assert.deepEqual(events[0], { placed: "agent-call-earlier" });
  });

  it("dials a new try when the earlier one provably placed nothing", async () => {
    const key = "meeting:meeting-1:v2:policy:policy-1:p5:T-1440m:a1:d1";
    const { service, starts } = build({
      execution: { dialTries: 1 },
      agentCallsByKey: {
        [key]: { id: "agent-call-earlier", status: "failed" },
      },
    });
    await service.processDue(NOW);
    assert.equal(starts.length, 1);
    assert.equal(
      starts[0]!.idempotencyKey,
      "meeting:meeting-1:v2:policy:policy-1:p5:T-1440m:a1:d2",
    );
  });

  it("retries a failure before placement later, inside the window", async () => {
    const { service, events } = build({
      startError: new VoiceAgentCallStartError(
        VoiceAgentCallStartOutcome.retryable_before_placement,
        new Error("provider timeout"),
      ),
    });
    await service.processDue(NOW);
    assert.deepEqual(events.at(-1), {
      defer: "2026-10-13T19:02:00.000Z",
      reason: "retry_before_placement",
    });
  });

  it("links a leg that may exist and never redials it", async () => {
    const { service, events } = build({
      startError: new VoiceAgentCallStartError(
        VoiceAgentCallStartOutcome.placed_pending_reconciliation,
        new Error("write failed"),
        "agent-call-live",
      ),
    });
    await service.processDue(NOW);
    assert.deepEqual(events.at(-1), { placed: "agent-call-live" });
  });

  it("records a policy refusal (DNC, no credit) as skipped, not retried", async () => {
    const { service, events } = build({
      startError: new VoiceAgentCallStartError(
        VoiceAgentCallStartOutcome.terminal_rejection,
        new Error("Destination is on the DNC list"),
      ),
    });
    await service.processDue(NOW);
    assert.deepEqual(events.at(-1), { finish: "skipped", reason: "rejected" });
  });

  it("does nothing for an organization taken off the pilot flag", async () => {
    const { service, starts, events } = build({
      execution: { organizationId: "org-2" },
    });
    await service.processDue(NOW);
    assert.equal(starts.length, 0);
    assert.equal(events.at(-1)!.reason, "automations_disabled");
  });
});

describe("MeetingReminderCallService.callNow", () => {
  it("refuses a meeting whose lead already answered", async () => {
    const { service } = build({
      meeting: {
        id: "meeting-1",
        organizationId: "org-1",
        status: "scheduled",
        scheduleVersion: 2,
        scheduledAt: MEETING_AT,
        attendanceStatus: "declined",
      },
    });
    await assert.rejects(
      () =>
        service.callNow(
          { userId: "member-1", organizationId: "org-1" },
          "meeting-1",
        ),
      /already answered/,
    );
  });

  it("refuses a second call while one is in progress", async () => {
    const { service } = build({ otherActiveForMeeting: true });
    // The meeting's calendar has a policy in this setup.
    (service as unknown as { policies: Row }).policies.findForCalendar =
      async () => ({ agentId: "agent-1" });
    await assert.rejects(
      () =>
        service.callNow(
          { userId: "member-1", organizationId: "org-1" },
          "meeting-1",
        ),
      /already in progress/,
    );
  });
});
