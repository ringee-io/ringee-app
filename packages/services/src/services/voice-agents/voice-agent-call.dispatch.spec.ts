/// <reference types="node" />
import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { apiConfiguration } from "@ringee/configuration";
import {
  ProviderDispatchDeferredError,
  accountSlot,
  providerAccount,
} from "@ringee/platform";
import { VoiceAgentCallService } from "./voice-agent-call.service";

/**
 * One queued call through `dispatchQueued`, with every dependency a stand-in:
 * what is checked is what each failure leaves behind — dialed or not, back in
 * the queue or over — around the commit. The PostgreSQL + Redis suite runs the
 * same routine end to end.
 */
const config = apiConfiguration as unknown as Record<string, unknown>;
config.PUBLIC_BACKEND_URL ||= "https://api.example.invalid";

const ACCOUNT = providerAccount("telnyx", "dispatch-unit");
const ROW = {
  id: "agent-call-1",
  agentId: "agent-1",
  userId: "user-1",
  organizationId: "org-1",
  status: "queued",
  toNumber: "+18095551234",
  fromNumber: "+13055550001",
  contactId: null,
  variables: {},
};

function build(
  options: {
    /** On the DNC list at the nth check of the number. */
    onDnc?: (check: number) => boolean;
    /** The nth balance read: a figure, or the error it fails with. */
    balance?: (read: number) => number | Error;
    findDispatch?: () => Promise<unknown>;
    dial?: () => Promise<unknown>;
    releaseHolds?: () => Promise<void>;
    closeCall?: () => Promise<unknown>;
  } = {},
) {
  const log: string[] = [];
  const released: Array<Record<string, unknown>> = [];
  const requeued: Array<{ reason: string; options: unknown }> = [];
  let checks = 0;
  let reads = 0;
  const queued = {
    agentCallId: ROW.id,
    source: "agent_api",
    providerAccountKey: accountSlot(ACCOUNT),
    integrationId: null,
    attempts: 1,
    queuedAt: new Date(Date.now() - 1_000),
    expiresAt: new Date(Date.now() + 3_600_000),
  };
  const service = new VoiceAgentCallService(
    {
      require: async () => ({
        id: "agent-1",
        name: "Sofia",
        type: "reminders_notifications",
        providerAssistantId: "assistant-1",
        providerTexmlAppId: "app-1",
        timezone: "UTC",
      }),
      assertReadyForCalls: () => {},
      ensureInsightGroup: async () => {},
      ensureToolEndpoints: async () => true,
      ensureCallingApp: async () => {},
    } as never,
    {} as never,
    {
      findById: async () => ({ ...ROW }),
      update: async (_id: string, data: object) => ({ ...ROW, ...data }),
    } as never,
    {
      createCall: async () => {
        log.push("call-row");
        return { id: "call-1" };
      },
      attachTelephony: async () => {},
      markForciblyEnded: async () => {
        log.push("close-call");
        return options.closeCall ? options.closeCall() : {};
      },
    } as never,
    {
      startCall: async () => {
        log.push("dial");
        return options.dial
          ? options.dial()
          : {
              providerCallId: "provider-1",
              callControlId: "cc-1",
              callSessionId: "session-1",
            };
      },
    } as never,
    {} as never,
    {
      findOnDNC: async () =>
        options.onDnc?.(++checks) ? { reason: "asked not to be called" } : null,
    } as never,
    {
      getBalance: async () => {
        const value = options.balance?.(++reads) ?? 100;
        if (value instanceof Error) throw value;
        return value;
      },
      reserveCredits: async () => true,
      releaseReservations: async () => {
        log.push("release-holds");
        await options.releaseHolds?.();
      },
    } as never,
    {
      listOutboundCallerIds: async () => [
        { id: "num-1", phoneNumber: ROW.fromNumber },
      ],
    } as never,
    {
      getUserById: async () => ({
        id: "user-1",
        blockedAt: null,
        canCall: true,
      }),
      getCachedUserById: async () => ({ canCall: true, freeCallTrial: false }),
    } as never,
    {
      getSettings: async () => ({
        settings: {
          mode: "enforce",
          orgConcurrency: 25,
          orgConcurrencyOverrides: {},
          classOverrides: {},
          queueAgingMs: 60_000,
          agentCallCreditReservationUsd: 0.1,
        },
      }),
      getAccount: () => ACCOUNT,
      admit: async () => ({
        granted: true,
        waitedMs: 0,
        permit: { id: "permit-1" },
      }),
      runWithPermit: (_permit: unknown, fn: () => Promise<unknown>) => fn(),
    } as never,
    {
      claim: async () => true,
      findByAgentCallId: options.findDispatch ?? (async () => queued),
      countLiveInWorkspace: async () => 0,
      commit: async () => "committed",
      release: async (
        _id: string,
        _token: string,
        releaseOptions: Record<string, unknown>,
      ) => {
        released.push(releaseOptions);
        return true;
      },
      requeueUnsent: async (
        _id: string,
        _token: string,
        _notBefore: Date,
        reason: string,
        requeueOptions: unknown,
      ) => {
        requeued.push({ reason, options: requeueOptions });
        return true;
      },
      fail: async () => {
        log.push("fail");
        return true;
      },
    } as never,
    { kick: async () => {} } as never,
    { isWorkspaceMember: async () => true } as never,
    {} as never,
  );
  const dispatch = () =>
    service.dispatchQueued(ROW.id, { maxWaitMs: 0 }) as Promise<
      Record<string, unknown>
    >;
  return { dispatch, log, released, requeued };
}

describe("dispatching a queued call", () => {
  it("places it when every check passes", async () => {
    const { dispatch, log } = build();
    assert.equal((await dispatch()).outcome, "placed");
    assert.equal(log.filter((entry) => entry === "dial").length, 1);
  });

  it("checks the number again right before the request: one added to the DNC list is never dialed", async () => {
    // Clear when the call was claimed, on the list by the time it is sent.
    const { dispatch, log, requeued } = build({
      onDnc: (check) => check === 2,
    });
    const outcome = await dispatch();
    assert.equal(outcome.outcome, "failed");
    assert.ok(!log.includes("dial"));
    assert.ok(log.includes("release-holds"), "its holds were released");
    assert.ok(log.includes("close-call"), "its call row was closed");
    assert.deepEqual(requeued, [], "a refusal ends the call");
  });

  it("sends a call whose balance could not be read at the last check back to the queue", async () => {
    const { dispatch, log, requeued } = build({
      balance: (read) => (read === 2 ? new Error("the database blinked") : 100),
    });
    const outcome = await dispatch();
    assert.equal(outcome.outcome, "deferred");
    assert.ok(!log.includes("dial"), "nothing was sent");
    assert.equal(requeued.length, 1);
    // An error is an attempt: it is not given back, so the error limit holds.
    assert.deepEqual(requeued[0].options, { refundAttempt: false });
    assert.match(requeued[0].reason, /^retry:ServiceUnavailableException/);
  });

  it("tells a balance that cannot be read from an empty one before the commit", async () => {
    const unreadable = build({
      balance: (read) => (read === 1 ? new Error("the database blinked") : 100),
    });
    assert.equal((await unreadable.dispatch()).outcome, "deferred");
    assert.ok(!unreadable.log.includes("fail"), "not ended: tried again later");

    const empty = build({ balance: () => 0 });
    assert.equal((await empty.dispatch()).outcome, "failed");
    assert.ok(empty.log.includes("fail"), "a real zero ends the call");
  });

  it("puts a deferred egress back in the queue even when undoing the placement fails", async () => {
    const { dispatch, requeued } = build({
      dial: async () => {
        throw new ProviderDispatchDeferredError("busy", 900);
      },
      releaseHolds: async () => {
        throw new Error("credit row locked");
      },
      closeCall: async () => {
        throw new Error("call row locked");
      },
    });
    const outcome = await dispatch();
    assert.deepEqual(outcome, {
      outcome: "deferred",
      reason: "busy",
      retryAfterMs: 900,
    });
    // Waiting for capacity is not an attempt that failed.
    assert.deepEqual(requeued, [
      { reason: "busy", options: { refundAttempt: true } },
    ]);
  });

  it("never puts back a call the provider may have placed", async () => {
    const { dispatch, log, requeued } = build({
      dial: async () => {
        throw new Error("socket hang up");
      },
    });
    assert.equal((await dispatch()).outcome, "in_doubt");
    assert.equal(log.filter((entry) => entry === "dial").length, 1);
    assert.deepEqual(requeued, []);
  });

  it("puts off, rather than fails, a call whose dispatch broke before the commit", async () => {
    const { dispatch, released, log } = build({
      findDispatch: async () => {
        throw new Error("connection reset");
      },
    });
    const before = Date.now();
    const outcome = await dispatch();
    assert.equal(outcome.outcome, "deferred");
    assert.ok(Number(outcome.retryAfterMs) > 0, "the pump backs off");
    assert.ok(!log.includes("dial"));
    // The claim was handed back with a pause, so the same row is not taken
    // straight back.
    assert.equal(released.length, 1);
    assert.ok((released[0].notBefore as Date).getTime() > before);
    assert.match(String(released[0].reason), /^retry:Error/);
  });
});
