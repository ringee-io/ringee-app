/// <reference types="node" />

import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CallbackAgentKind, CallbackStatus } from "@ringee/database";
import { CallbackService } from "./callback.service";
import {
  VoiceAgentCallStartError,
  VoiceAgentCallStartOutcome,
} from "../voice-agents/voice-agent-call.service";
import { HandoffDialRefused } from "../voice-agents/automations/voice-agent-handoff.service";

type Row = Record<string, any>;

/** Due a minute ago: the worker claims with the real clock. */
const SCHEDULED_AT = new Date(Date.now() - 60_000);

/** The callback the handoff left: placed by the scheduling agent itself. */
function agentCallback(over: Partial<Row> = {}): Row {
  return {
    id: "cb-1",
    userId: "admin-1",
    organizationId: "org-1",
    contactId: "contact-1",
    callId: "call-1",
    campaignLeadId: null,
    scheduledAt: SCHEDULED_AT,
    note: "Find a new time",
    status: CallbackStatus.scheduled,
    completedAt: null,
    attemptCount: 0,
    agentCallbackKind: CallbackAgentKind.agreed,
    agentId: "agent-sched",
    handoffId: "handoff-1",
    agentCallbackKey: "handoff:handoff-1:agreed:ac-1",
    notBefore: null,
    claimToken: null,
    leaseExpiresAt: null,
    dialTries: 0,
    dialReservedAt: null,
    agentCallId: null,
    reason: null,
    lastError: null,
    createdAt: new Date("2026-11-03T09:05:00.000Z"),
    updatedAt: new Date("2026-11-03T09:05:00.000Z"),
    ...over,
  };
}

const DIAL_DECISION = {
  action: "dial" as const,
  ctx: { userId: "admin-1", organizationId: "org-1" },
  agentId: "agent-sched",
  to: "+34600111222",
  variables: { first_name: "Ana", additional_context: "…" },
  responsibleUserId: "member-1",
  binding: {
    meetingId: "meeting-1",
    meetingScheduleVersion: 3,
    calendarId: "cal-meeting",
  },
  handoff: { id: "handoff-1" },
};

function build(
  options: {
    callbacks?: Row[];
    /** What the handoff service decides for every due callback. */
    decision?: Row;
    plans?: Row[];
    /** Earlier agent calls, by their dial key. */
    earlier?: Row[];
    startError?: (input: Row) => Error | null;
    authorizeError?: Error;
    /** Fail the first write that settles a claim: the worker "crashes". */
    crashOnFirstFinish?: boolean;
  } = {},
) {
  const store = new Map<string, Row>(
    (options.callbacks ?? [agentCallback()]).map((row) => [row.id, { ...row }]),
  );
  const agentCalls = new Map<string, Row>(
    (options.earlier ?? []).map((row) => [row.idempotencyKey, row]),
  );
  const dials: Row[] = [];
  const authorizations: Row[] = [];
  const recoveriesMarked: Row[] = [];
  let finishes = 0;

  const repo = {
    findDue: async () => [],
    findById: async (id: string) =>
      store.get(id) ? { ...store.get(id)! } : null,
    claimDueAgentCallbacks: async (now: Date, leaseUntil: Date) => {
      const claimed: Row[] = [];
      for (const row of store.values()) {
        const due =
          ["scheduled", "due"].includes(row.status) &&
          row.scheduledAt.getTime() <= now.getTime() &&
          (!row.notBefore || row.notBefore.getTime() <= now.getTime());
        const abandoned =
          row.status === "in_progress" &&
          row.leaseExpiresAt &&
          row.leaseExpiresAt.getTime() < now.getTime();
        if (!row.agentCallbackKind || !(due || abandoned)) continue;
        row.status = "in_progress";
        row.claimToken = `token-${row.attemptCount + 1}`;
        row.leaseExpiresAt = leaseUntil;
        row.attemptCount += 1;
        claimed.push({ ...row });
      }
      return claimed;
    },
    beginAgentDial: async (
      id: string,
      token: string,
      now: Date,
      leaseUntil: Date,
    ) => {
      const row = store.get(id)!;
      if (
        row.status !== "in_progress" ||
        row.claimToken !== token ||
        row.leaseExpiresAt.getTime() <= now.getTime()
      ) {
        return null;
      }
      if (!row.dialReservedAt) {
        row.dialTries += 1;
        row.dialReservedAt = now;
      }
      row.leaseExpiresAt = leaseUntil;
      return { ...row };
    },
    holdsAgentClaim: async (id: string, token: string) =>
      store.get(id)?.status === "in_progress" &&
      store.get(id)?.claimToken === token,
    finishAgentCallback: async (
      id: string,
      token: string,
      status: string,
      data: Row,
    ) => {
      finishes += 1;
      if (options.crashOnFirstFinish && finishes === 1) {
        throw new Error("database unavailable");
      }
      const row = store.get(id)!;
      if (row.status !== "in_progress" || row.claimToken !== token) {
        return false;
      }
      Object.assign(row, {
        status,
        claimToken: null,
        leaseExpiresAt: null,
        ...(data.reason ? { reason: data.reason } : {}),
        ...(data.lastError ? { lastError: data.lastError } : {}),
        ...(data.agentCallId ? { agentCallId: data.agentCallId } : {}),
      });
      return true;
    },
    deferAgentCallback: async (
      id: string,
      token: string,
      notBefore: Date,
      reason: string,
      unplaced = false,
    ) => {
      const row = store.get(id)!;
      if (row.status !== "in_progress" || row.claimToken !== token) {
        return false;
      }
      Object.assign(row, {
        status: "scheduled",
        claimToken: null,
        leaseExpiresAt: null,
        notBefore,
        reason,
        ...(unplaced ? { dialReservedAt: null } : {}),
      });
      return true;
    },
    createAgentCallbackOnce: async (data: Row) => {
      const existing = [...store.values()].find(
        (row) => row.agentCallbackKey === data.agentCallbackKey,
      );
      if (existing) return { callback: { ...existing }, created: false };
      const row = agentCallback({
        ...data,
        id: `cb-${store.size + 1}`,
        status: CallbackStatus.scheduled,
      });
      store.set(row.id, row);
      return { callback: { ...row }, created: true };
    },
    update: async (id: string, data: Row) => {
      Object.assign(store.get(id)!, data);
      return { ...store.get(id)! };
    },
    updateStatus: async (id: string, status: string) => {
      store.get(id)!.status = status;
      return { ...store.get(id)! };
    },
    // Compare-and-set on the status, like the Prisma `updateManyAndReturn`.
    cancelUnlessBeingPlaced: async (id: string) => {
      const row = store.get(id);
      if (!row || row.status === "in_progress") return null;
      row.status = CallbackStatus.cancelled;
      return { ...row };
    },
    rescheduleAgentCallback: async (id: string, scheduledAt: Date) => {
      const row = store.get(id);
      if (!row?.agentCallbackKind || row.status === "in_progress") return null;
      Object.assign(row, {
        scheduledAt,
        status: CallbackStatus.scheduled,
        completedAt: null,
        attemptCount: 0,
        notBefore: null,
        dialTries: 0,
        dialReservedAt: null,
        claimToken: null,
        leaseExpiresAt: null,
        reason: null,
      });
      return { ...row };
    },
  };

  const enqueued: Row[] = [];
  const reminders: Row[] = [];
  const service = new CallbackService(
    repo as never,
    {} as never,
    {} as never,
    {
      scheduleForSubject: async (input: Row) => reminders.push(input),
      rescheduleForSubject: async (input: Row) => reminders.push(input),
      cancelForSubject: async () => undefined,
    } as never,
    { findById: async () => null } as never,
    { enqueue: async (input: Row) => enqueued.push(input) } as never,
    {
      findByIdempotencyKey: async (key: string) => agentCalls.get(key) ?? null,
    } as never,
    {
      startCall: async (
        ctx: Row,
        agentId: string,
        input: Row,
        beforePlacement?: (placement: Row) => Promise<void>,
      ) => {
        const agentCallId = `ac-${input.idempotencyKey}`;
        // The row and its key exist before the leg, as in the real path.
        agentCalls.set(input.idempotencyKey, {
          id: agentCallId,
          idempotencyKey: input.idempotencyKey,
          status: "created",
          providerCallControlId: null,
        });
        try {
          await beforePlacement?.({
            agentCallId,
            callId: `call-${agentCallId}`,
          });
        } catch (error) {
          agentCalls.get(input.idempotencyKey)!.status = "failed";
          throw new VoiceAgentCallStartError(
            VoiceAgentCallStartOutcome.terminal_rejection,
            error,
            agentCallId,
          );
        }
        const failure = options.startError?.(input) ?? null;
        dials.push({ ctx, agentId, input });
        if (failure) throw failure;
        agentCalls.get(input.idempotencyKey)!.status = "initiating";
        agentCalls.get(input.idempotencyKey)!.providerCallControlId = "v3:new";
        return { id: agentCallId, status: "initiating" };
      },
    } as never,
    {} as never,
    {
      reviewDue: async () => options.plans ?? [],
      markRecoveryPlanned: async (plan: Row) => {
        recoveriesMarked.push(plan);
        return recoveriesMarked.length === 1;
      },
      decideCallback: async () => options.decision ?? DIAL_DECISION,
      authorizeCallbackDial: async (
        callback: Row,
        decision: Row,
        placement: Row,
      ) => {
        authorizations.push({ callback: callback.id, decision, placement });
        if (options.authorizeError) throw options.authorizeError;
      },
    } as never,
  );

  return {
    service,
    repo,
    store,
    dials,
    authorizations,
    enqueued,
    reminders,
    recoveriesMarked,
  };
}

describe("CallbackService — agent callbacks for a handoff request (AGENT-021)", () => {
  it("places a due callback through the scheduling agent under a key persisted before the leg", async () => {
    const h = build();
    assert.equal(await h.service.processDueCallbacks(), 1);

    assert.equal(h.dials.length, 1);
    const [dial] = h.dials;
    assert.equal(dial!.agentId, "agent-sched");
    assert.deepEqual(dial!.ctx, { userId: "admin-1", organizationId: "org-1" });
    assert.equal(
      dial!.input.idempotencyKey,
      `callback:cb-1:${SCHEDULED_AT.getTime()}:d1`,
    );
    assert.equal(dial!.input.responsibleUserId, "member-1");
    // The commit point ran, with the placement it binds the call's tools to.
    assert.equal(h.authorizations.length, 1);
    assert.equal(
      h.authorizations[0]!.placement.agentCallId,
      `ac-callback:cb-1:${SCHEDULED_AT.getTime()}:d1`,
    );
    const row = h.store.get("cb-1")!;
    assert.equal(row.status, CallbackStatus.completed);
    assert.equal(
      row.agentCallId,
      `ac-callback:cb-1:${SCHEDULED_AT.getTime()}:d1`,
    );
    assert.equal(row.claimToken, null);

    // A second tick finds nothing to place.
    assert.equal(await h.service.processDueCallbacks(), 0);
    assert.equal(h.dials.length, 1);
  });

  it("recovers a worker that died after dialing by its key, and never dials again", async () => {
    const h = build({ crashOnFirstFinish: true });
    // The leg was placed, then the write that settles the claim failed.
    assert.equal(await h.service.processDueCallbacks(), 0);
    assert.equal(h.dials.length, 1);
    assert.equal(h.store.get("cb-1")!.status, "in_progress");

    // Before the lease runs out, nobody may take it over.
    assert.equal(await h.service.processDueCallbacks(), 0);
    assert.equal(h.dials.length, 1);

    // After it, the next tick links the call the first try placed.
    h.store.get("cb-1")!.leaseExpiresAt = new Date(Date.now() - 1);
    assert.equal(await h.service.processDueCallbacks(), 1);
    assert.equal(h.dials.length, 1);
    const row = h.store.get("cb-1")!;
    assert.equal(row.status, CallbackStatus.completed);
    assert.equal(
      row.agentCallId,
      `ac-callback:cb-1:${SCHEDULED_AT.getTime()}:d1`,
    );
  });

  it("retries a try that provably placed nothing, under the next key", async () => {
    const key = `callback:cb-1:${SCHEDULED_AT.getTime()}:d1`;
    const h = build({
      callbacks: [
        agentCallback({
          status: "in_progress",
          claimToken: "stale",
          leaseExpiresAt: new Date(Date.now() - 1),
          dialTries: 1,
          dialReservedAt: null,
          attemptCount: 1,
        }),
      ],
      earlier: [
        {
          id: "ac-old",
          idempotencyKey: key,
          status: "failed",
          providerCallControlId: null,
        },
      ],
    });
    assert.equal(await h.service.processDueCallbacks(), 1);
    assert.equal(h.dials.length, 1);
    assert.equal(
      h.dials[0]!.input.idempotencyKey,
      `callback:cb-1:${SCHEDULED_AT.getTime()}:d2`,
    );
  });

  it("waits for a reclaimed try that never confirmed its leg, and links it once it does", async () => {
    const key = `callback:cb-1:${SCHEDULED_AT.getTime()}:d1`;
    // The worker died after writing the row, before learning whether the
    // provider took the leg: no control id, and not provably unplaced.
    const earlier: Row = {
      id: "ac-old",
      idempotencyKey: key,
      status: "created",
      providerCallControlId: null,
      createdAt: new Date(Date.now() - 6 * 60_000),
    };
    const h = build({
      callbacks: [
        agentCallback({
          status: "in_progress",
          claimToken: "stale",
          leaseExpiresAt: new Date(Date.now() - 1),
          dialTries: 1,
          dialReservedAt: new Date(Date.now() - 6 * 60_000),
          attemptCount: 1,
        }),
      ],
      earlier: [earlier],
    });

    // Neither completed on a guess nor dialed again: it waits, keeping the
    // reservation so the same key is the one checked next time.
    assert.equal(await h.service.processDueCallbacks(), 0);
    assert.equal(h.dials.length, 0);
    let row = h.store.get("cb-1")!;
    assert.equal(row.status, CallbackStatus.scheduled);
    assert.equal(row.reason, "placement_pending");
    assert.equal(row.dialTries, 1);
    assert.notEqual(row.dialReservedAt, null);
    assert.ok(row.notBefore.getTime() > Date.now());
    assert.equal(row.agentCallId, null);

    // The status callback reports the leg: the next look links that call.
    earlier.providerCallControlId = "v3:late";
    row.notBefore = new Date(Date.now() - 1);
    assert.equal(await h.service.processDueCallbacks(), 1);
    assert.equal(h.dials.length, 0);
    row = h.store.get("cb-1")!;
    assert.equal(row.status, CallbackStatus.completed);
    assert.equal(row.agentCallId, "ac-old");
  });

  it("records a reclaimed try still unconfirmed after the wait as unconfirmed, never redialing it", async () => {
    const key = `callback:cb-1:${SCHEDULED_AT.getTime()}:d1`;
    const h = build({
      callbacks: [
        agentCallback({
          status: "in_progress",
          claimToken: "stale",
          leaseExpiresAt: new Date(Date.now() - 1),
          dialTries: 1,
          dialReservedAt: new Date(Date.now() - 61 * 60_000),
          attemptCount: 3,
        }),
      ],
      earlier: [
        {
          id: "ac-old",
          idempotencyKey: key,
          status: "initiating",
          providerCallControlId: null,
          createdAt: new Date(Date.now() - 61 * 60_000),
        },
      ],
    });
    assert.equal(await h.service.processDueCallbacks(), 0);
    assert.equal(h.dials.length, 0);
    const row = h.store.get("cb-1")!;
    assert.equal(row.status, CallbackStatus.missed);
    assert.equal(row.reason, "placement_unconfirmed");
    // A leg may exist, so it is linked for a person to look at.
    assert.equal(row.agentCallId, "ac-old");
    assert.equal(await h.service.processDueCallbacks(), 0);
    assert.equal(h.dials.length, 0);
  });

  it("links a placement whose outcome is unknown and never redials it", async () => {
    const h = build({
      startError: () =>
        new VoiceAgentCallStartError(
          VoiceAgentCallStartOutcome.placed_pending_reconciliation,
          new Error("socket hang up"),
          "ac-maybe",
        ),
    });
    assert.equal(await h.service.processDueCallbacks(), 1);
    const row = h.store.get("cb-1")!;
    assert.equal(row.status, CallbackStatus.completed);
    assert.equal(row.agentCallId, "ac-maybe");
    assert.equal(await h.service.processDueCallbacks(), 0);
    assert.equal(h.dials.length, 1);
  });

  it("records the commit point's refusal, with no leg", async () => {
    const h = build({
      authorizeError: new HandoffDialRefused(
        CallbackStatus.missed,
        "meeting_changed",
      ),
    });
    assert.equal(await h.service.processDueCallbacks(), 0);
    assert.equal(h.dials.length, 0);
    const row = h.store.get("cb-1")!;
    assert.equal(row.status, CallbackStatus.missed);
    assert.equal(row.reason, "meeting_changed");
  });

  it("defers or skips as the request decides, without dialing", async () => {
    const until = new Date(Date.now() + 5 * 60_000);
    const deferred = build({
      decision: { action: "defer", until, reason: "source_call_live" },
    });
    await deferred.service.processDueCallbacks();
    assert.equal(deferred.dials.length, 0);
    const row = deferred.store.get("cb-1")!;
    assert.equal(row.status, CallbackStatus.scheduled);
    assert.equal(row.notBefore, until);
    assert.equal(row.reason, "source_call_live");
    assert.equal(row.claimToken, null);

    const skipped = build({
      decision: {
        action: "skip",
        status: CallbackStatus.cancelled,
        reason: "objective_resolved",
      },
    });
    await skipped.service.processDueCallbacks();
    assert.equal(skipped.dials.length, 0);
    assert.equal(skipped.store.get("cb-1")!.status, CallbackStatus.cancelled);
    assert.equal(skipped.store.get("cb-1")!.reason, "objective_resolved");
  });

  it("plans one recovery call per attempt, even when two ticks race", async () => {
    const plan = {
      handoff: {
        id: "handoff-1",
        userId: "admin-1",
        organizationId: "org-1",
        callId: "call-1",
      },
      agentId: "agent-sched",
      contactId: "contact-1",
      at: new Date(Date.now() + 2 * 60 * 60_000),
      attempt: 1,
    };
    const h = build({ callbacks: [], plans: [plan] });
    await h.service.processDueCallbacks();
    await h.service.processDueCallbacks();
    const created = [...h.store.values()];
    assert.equal(created.length, 1);
    assert.equal(created[0]!.agentCallbackKind, CallbackAgentKind.recovery);
    assert.equal(created[0]!.agentCallbackKey, "handoff:handoff-1:recovery:1");
    assert.match(created[0]!.note, /Not a time the contact agreed to/);
    assert.equal(h.recoveriesMarked.length, 2);
    // Announced to integrations once; no reminder for a person to act on.
    assert.equal(h.enqueued.length, 1);
    assert.equal(h.reminders.length, 0);
  });

  it("does not let a person move or cancel a callback the agent is placing", async () => {
    const h = build({
      callbacks: [agentCallback({ status: "in_progress", claimToken: "t" })],
    });
    await assert.rejects(
      h.service.reschedule("cb-1", new Date(Date.now() + 86_400_000)),
      /placing this callback right now/,
    );
    await assert.rejects(
      h.service.cancel("cb-1"),
      /placing this callback right now/,
    );

    // Once it is back to scheduled, a new time is a new dial with new keys.
    const scheduled = build({
      callbacks: [agentCallback({ dialTries: 2, notBefore: new Date() })],
    });
    const at = new Date(Date.now() + 86_400_000);
    await scheduled.service.reschedule("cb-1", at);
    const row = scheduled.store.get("cb-1")!;
    assert.equal(row.scheduledAt, at);
    assert.equal(row.dialTries, 0);
    assert.equal(row.notBefore, null);
    assert.equal(scheduled.reminders.length, 0);
  });

  it("does not overwrite a claim the worker took after the person's read", async () => {
    for (const change of ["cancel", "reschedule"] as const) {
      const h = build();
      const read = h.repo.findById;
      // The worker claims the row between the read and the write.
      h.repo.findById = async (id: string) => {
        const row = await read(id);
        h.store.get(id)!.status = "in_progress";
        h.store.get(id)!.claimToken = "worker";
        return row;
      };
      await assert.rejects(
        change === "cancel"
          ? h.service.cancel("cb-1")
          : h.service.reschedule("cb-1", new Date(Date.now() + 86_400_000)),
        /placing this callback right now/,
      );
      const row = h.store.get("cb-1")!;
      assert.equal(row.status, "in_progress");
      assert.equal(row.claimToken, "worker");
      assert.equal(row.scheduledAt, SCHEDULED_AT);
    }
  });
});
