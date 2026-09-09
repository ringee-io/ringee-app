/// <reference types="node" />

import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CallbackStatus } from "@ringee/database";
import { CallbackService } from "./callback.service";
import {
  VoiceAgentCallStartError,
  VoiceAgentCallStartOutcome,
} from "../voice-agents/voice-agent-call.service";

const DUE_CALLBACK = {
  id: "agent-call-1",
  userId: "user-1",
  organizationId: "org-1",
  contactId: "contact-1",
  callId: "source-call-1",
  campaignLeadId: null,
  scheduledAt: new Date("2026-09-08T12:00:00.000Z"),
  completedAt: null,
  attemptCount: 0,
  status: CallbackStatus.scheduled,
  note: "After lunch",
  createdAt: new Date("2026-09-08T10:00:00.000Z"),
  updatedAt: new Date("2026-09-08T10:00:00.000Z"),
};

function build(
  options: {
    claim?: boolean;
    claimedAttemptCount?: number;
    startError?: Error;
  } = {},
) {
  const dials: Array<Record<string, unknown>> = [];
  const statuses: Array<Record<string, unknown>> = [];
  const dueTransitions: string[] = [];

  const service = new CallbackService(
    {
      findDue: async () => [DUE_CALLBACK],
      claimScheduled: async () =>
        options.claim === false
          ? null
          : {
              ...DUE_CALLBACK,
              status: CallbackStatus.in_progress,
              attemptCount: options.claimedAttemptCount ?? 1,
            },
      markDueIfScheduled: async (id: string) => {
        dueTransitions.push(id);
        return { ...DUE_CALLBACK, status: CallbackStatus.due };
      },
      updateClaimed: async (id: string, data: Record<string, unknown>) => {
        statuses.push({ id, ...data });
        return { ...DUE_CALLBACK, ...data };
      },
    } as never,
    { updateStatus: async () => null } as never,
    { findById: async () => null, updateStatus: async () => null } as never,
    { scheduleForSubject: async () => null } as never,
    { findById: async () => null } as never,
    { enqueue: async () => null } as never,
    {
      findByCallId: async () => ({
        id: "agent-call-1",
        agentId: "agent-1",
        userId: "user-1",
        organizationId: "org-1",
        toNumber: "+13055550123",
        variables: { first_name: "Ada", ignored: 42 },
        metadata: { external_id: "crm-123", campaign: "fall" },
      }),
    } as never,
    {
      startCall: async (
        ctx: Record<string, unknown>,
        agentId: string,
        input: Record<string, unknown>,
      ) => {
        dials.push({ ctx, agentId, input });
        if (options.startError) throw options.startError;
        return { id: "next-agent-call", status: "initiating" };
      },
    } as never,
  );

  return { service, dials, statuses, dueTransitions };
}

describe("CallbackService AI voice-agent callbacks", () => {
  it("atomically claims a due callback and calls with its original context", async () => {
    const { service, dials, statuses, dueTransitions } = build();

    assert.equal(await service.processDueCallbacks(), 1);
    assert.deepEqual(dials, [
      {
        ctx: { userId: "user-1", organizationId: "org-1" },
        agentId: "agent-1",
        input: {
          to: "+13055550123",
          variables: { first_name: "Ada" },
          metadata: { external_id: "crm-123", campaign: "fall" },
        },
      },
    ]);
    assert.equal(dueTransitions.length, 0);
    assert.equal(statuses[0]?.status, CallbackStatus.completed);
  });

  it("does not dial when another scheduler already claimed the callback", async () => {
    const { service, dials, statuses } = build({ claim: false });

    assert.equal(await service.processDueCallbacks(), 0);
    assert.deepEqual(dials, []);
    assert.deepEqual(statuses, []);
  });

  it("marks a claimed callback missed when the guarded call cannot start", async () => {
    const { service, dials, statuses } = build({
      startError: new VoiceAgentCallStartError(
        VoiceAgentCallStartOutcome.terminal_rejection,
        new Error("DNC blocked"),
      ),
    });

    assert.equal(await service.processDueCallbacks(), 1);
    assert.equal(dials.length, 1);
    assert.equal(statuses[0]?.status, CallbackStatus.missed);
  });

  it("requeues only a bounded pre-placement failure", async () => {
    const retryable = new VoiceAgentCallStartError(
      VoiceAgentCallStartOutcome.retryable_before_placement,
      new Error("provider unavailable"),
    );

    const first = build({ startError: retryable, claimedAttemptCount: 1 });
    assert.equal(await first.service.processDueCallbacks(), 1);
    assert.equal(first.statuses[0]?.status, CallbackStatus.scheduled);

    const exhausted = build({ startError: retryable, claimedAttemptCount: 3 });
    assert.equal(await exhausted.service.processDueCallbacks(), 1);
    assert.equal(exhausted.statuses[0]?.status, CallbackStatus.missed);
  });

  it("completes a callback whose leg was placed before persistence failed", async () => {
    const { service, statuses } = build({
      startError: new VoiceAgentCallStartError(
        VoiceAgentCallStartOutcome.placed_pending_reconciliation,
        new Error("database unavailable"),
        "next-agent-call",
      ),
    });

    assert.equal(await service.processDueCallbacks(), 1);
    assert.equal(statuses[0]?.status, CallbackStatus.completed);
    assert.ok(statuses[0]?.completedAt instanceof Date);
  });
});
