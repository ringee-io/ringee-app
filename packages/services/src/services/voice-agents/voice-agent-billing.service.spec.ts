/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { apiConfiguration } from "@ringee/configuration";
import { VoiceAgentBillingService } from "./voice-agent-billing.service";

const AGENT_CALL = {
  id: "call-1",
  userId: "user-1",
  organizationId: "org-1",
  callId: null as string | null,
  providerConversationId: "conv-1" as string | null,
  providerCallControlId: "cc-1" as string | null,
  costSettledAt: null as Date | null,
  aiCostDebitedAt: null as Date | null,
  aiCostUsd: null as number | null,
  aiChargedCredits: null as number | null,
};

/** A repository whose settle-once claim behaves like the real updateMany. */
function repository(row: Record<string, unknown> = AGENT_CALL) {
  const state = { ...row };
  const claims: Array<{ cost: number; charged: number }> = [];
  return {
    claims,
    state,
    findById: async () => (state.id ? state : null),
    update: async (_id: string, data: Record<string, unknown>) => {
      Object.assign(state, data);
      return state;
    },
    settleAiCostOnce: async (
      _id: string,
      costUsd: number,
      chargedCredits: number,
    ) => {
      if (state.costSettledAt) return false;
      state.costSettledAt = new Date();
      state.aiCostUsd = costUsd;
      state.aiChargedCredits = chargedCredits;
      claims.push({ cost: costUsd, charged: chargedCredits });
      return true;
    },
    markAiCostDebited: async () => {
      state.aiCostDebitedAt = new Date();
    },
    listUnsettled: async () => [],
    listMissingArtifacts: async (): Promise<Record<string, unknown>[]> => [],
  };
}

type Kind = "telephony" | "voice_agent" | "inference";

interface UsageRow {
  costUsd: number;
  kind?: Kind;
  /** Seconds the two ends were connected. Zero on a leg nobody picked up. */
  connectedSeconds?: number;
  startedAt?: Date | null;
  endedAt?: Date | null;
  callSessionId?: string | null;
}

function provider(
  records: UsageRow[],
  recordings: Array<{ downloadUrl: string | null }> = [],
) {
  /** What the recording lookup was filtered on. */
  const recordingQueries: Array<Record<string, unknown>> = [];
  return {
    recordingQueries,
    fetchUsageRecords: async () =>
      records.map((r) => ({
        kind: r.kind ?? ("voice_agent" as const),
        conversationId: "conv-1",
        callControlId: "cc-1",
        callSessionId: r.callSessionId ?? null,
        costUsd: r.costUsd,
        billedSeconds: 60,
        connectedSeconds: r.connectedSeconds ?? null,
        startedAt: r.startedAt ?? null,
        endedAt: r.endedAt ?? null,
        occurredAt: new Date(),
      })),
    fetchRecordings: async (query: Record<string, unknown>) => {
      recordingQueries.push(query);
      return recordings.map((r, index) => ({
        providerRecordingId: `rec-${index}`,
        callControlId: "cc-1",
        callSessionId: "cs-1",
        downloadUrl: r.downloadUrl,
        channels: "dual" as const,
        startedAt: new Date(),
        endedAt: new Date(),
        durationMillis: 1000,
      }));
    },
  };
}

/** The `Call` side of an agent call, and what the settlement writes onto it. */
function callRepository(
  call: Record<string, unknown> | null = {
    id: "telephony-1",
    userId: "user-1",
    organizationId: "org-1",
    callControlId: "cc-1",
    callSessionId: "cs-1",
    totalCost: null,
  },
) {
  const costs: Array<{ totalCost: number; meta: Record<string, unknown> }> = [];
  const attached: Array<Record<string, unknown>> = [];
  const completed: Array<{
    startedAt: Date | null | undefined;
    endedAt: Date | null | undefined;
  }> = [];
  return {
    costs,
    attached,
    completed,
    call,
    findById: async () => call,
    updateCost: async (
      _controlId: string,
      totalCost: number,
      meta: Record<string, unknown>,
    ) => {
      if (call) call.totalCost = totalCost;
      costs.push({ totalCost, meta });
      return call;
    },
    attachTelephony: async (id: string, data: Record<string, unknown>) => {
      Object.assign(call ?? {}, data);
      attached.push({ id, ...data });
      return call;
    },
    completeCall: async (
      _controlId: string,
      startedAt: Date | null | undefined,
      endedAt: Date | null | undefined,
    ) => {
      if (call) call.endedAt = endedAt ?? null;
      completed.push({ startedAt, endedAt });
      return call;
    },
  };
}

function build(options: {
  repo?: ReturnType<typeof repository>;
  calls?: ReturnType<typeof callRepository>;
  provider?: ReturnType<typeof provider>;
  credits?: unknown;
  recordings?: Array<{ status: string }>;
  processed?: unknown[];
}) {
  const repo = options.repo ?? repository();
  const calls = options.calls ?? callRepository();
  const processed = options.processed ?? [];
  const transcribed: string[] = [];
  const service = new VoiceAgentBillingService(
    repo as never,
    calls as never,
    {
      findByCallId: async () => options.recordings ?? [],
    } as never,
    (options.provider ?? provider([{ costUsd: 0.05 }])) as never,
    (options.credits ?? {
      consumeCredits: async () => ({}),
      getBalance: async () => 10,
    }) as never,
    {
      processCallRecording: async (input: unknown) => {
        processed.push(input);
      },
    } as never,
    {
      recoverTranscript: async (agentCall: { id: string }) => {
        transcribed.push(agentCall.id);
      },
      // The real one writes the conversation onto the agent call and the
      // session onto the telephony row, and hands back the row to keep
      // working from. Both writes are what later reads are keyed on.
      bindConversation: async (
        agentCall: { id: string; callId: string | null },
        conversation: {
          conversationId: string | null;
          callSessionId?: string | null;
        },
      ) => {
        if (conversation.conversationId && !repo.state.providerConversationId) {
          await repo.update(agentCall.id, {
            providerConversationId: conversation.conversationId,
          });
        }
        if (agentCall.callId && conversation.callSessionId) {
          const call = await calls.findById();
          if (call && !call.callSessionId) {
            await calls.attachTelephony(call.id as string, {
              callControlId: call.callControlId,
              callSessionId: conversation.callSessionId,
            });
          }
        }
        return repo.state;
      },
    } as never,
  );
  return { service, repo, calls, processed, transcribed };
}

describe("VoiceAgentBillingService", () => {
  it("charges the provider's own cost times the configured margin", async () => {
    const debits: Array<{ amount: number; key: string; source: string }> = [];
    const { service } = build({
      // The voice engine and the LLM tokens are separate records on one call.
      provider: provider([
        { costUsd: 0.05, kind: "voice_agent" },
        { costUsd: 0.011, kind: "inference" },
      ]),
      credits: {
        consumeCredits: async (
          _ctx: object,
          amount: number,
          ref: { idempotencyKey: string; source: string },
        ) => {
          debits.push({
            amount,
            key: ref.idempotencyKey,
            source: ref.source,
          });
          return {};
        },
        getBalance: async () => 10,
      },
    });

    const settlement = await service.settle("call-1");

    const expected = 0.061 * apiConfiguration.AI_VOICE_AGENT_PROFIT_MARGIN;
    assert.equal(settlement.settled, true);
    assert.equal(settlement.providerCostUsd, 0.061);
    assert.equal(settlement.chargedCredits, expected);
    assert.deepEqual(debits, [
      {
        amount: expected,
        key: "ai-voice-agent-cost:call-1",
        source: "ai.voice_agent.call",
      },
    ]);
  });

  it("prices the AI half from the AI records alone", async () => {
    // The voice leg is on the same answer and carries by far the larger number.
    // Folding it into the AI half would charge the caller the engine's margin
    // on their phone bill.
    const { service } = build({
      provider: provider([
        { costUsd: 0.265, kind: "telephony" },
        { costUsd: 0.1, kind: "voice_agent" },
      ]),
    });

    const settlement = await service.settle("call-1");
    assert.equal(settlement.providerCostUsd, 0.1);
  });

  it("debits once no matter how many times settlement runs", async () => {
    let debitCount = 0;
    const { service, repo } = build({
      credits: {
        consumeCredits: async () => {
          debitCount += 1;
          return {};
        },
        getBalance: async () => 10,
      },
    });

    const first = await service.settle("call-1");
    const second = await service.settle("call-1");
    const third = await service.settle("call-1");

    assert.equal(debitCount, 1);
    assert.equal(repo.claims.length, 1);
    for (const result of [first, second, third]) {
      assert.equal(result.settled, true);
      assert.equal(result.chargedCredits, first.chargedCredits);
    }
  });

  it("does not settle at zero when the provider has published nothing yet", async () => {
    let debitCount = 0;
    const { service, repo } = build({
      provider: provider([]),
      credits: {
        consumeCredits: async () => {
          debitCount += 1;
          return {};
        },
        getBalance: async () => 10,
      },
    });

    const settlement = await service.settle("call-1");

    assert.equal(settlement.settled, false);
    assert.equal(debitCount, 0);
    // Nothing was claimed, so a later sweep will try again.
    assert.equal(repo.state.costSettledAt, null);
  });

  it("waits for a provider handle before trying to price the call", async () => {
    const repo = repository({
      ...AGENT_CALL,
      providerConversationId: null,
      providerCallControlId: null,
    });
    const { service } = build({ repo });

    const settlement = await service.settle("call-1");
    assert.equal(settlement.settled, false);
    assert.equal(repo.state.costSettledAt, null);
  });

  it("prices a call the conversation webhook never bound", async () => {
    // The control id is written when the call is placed; the conversation id
    // only ever arrives on a webhook. A call is settled from either.
    const repo = repository({
      ...AGENT_CALL,
      providerConversationId: null,
    });
    const { service } = build({ repo });

    const settlement = await service.settle("call-1");

    assert.equal(settlement.settled, true);
    // And the conversation the records name is written down, so the token
    // records — which carry no other handle — are findable next time.
    assert.equal(repo.state.providerConversationId, "conv-1");
  });

  it("closes out a call the provider charged nothing for", async () => {
    let debitCount = 0;
    const { service, repo } = build({
      provider: provider([{ costUsd: 0 }]),
      credits: {
        consumeCredits: async () => {
          debitCount += 1;
          return {};
        },
        getBalance: async () => 10,
      },
    });

    const settlement = await service.settle("call-1");

    assert.equal(settlement.settled, true);
    assert.equal(settlement.chargedCredits, 0);
    assert.equal(debitCount, 0);
    // Settled, so the sweep stops chasing it.
    assert.ok(repo.state.costSettledAt);
  });

  it("finishes a debit that was claimed but never taken", async () => {
    // What a crash between the claim and the debit leaves behind: priced, and
    // marked settled, with no credits ever taken.
    const debits: number[] = [];
    const repo = repository({
      ...AGENT_CALL,
      costSettledAt: new Date(),
      aiCostDebitedAt: null,
      aiCostUsd: 0.05,
      aiChargedCredits: 0.1,
    });
    const { service } = build({
      repo,
      credits: {
        consumeCredits: async (_ctx: object, amount: number) => {
          debits.push(amount);
          return {};
        },
        getBalance: async () => 10,
      },
    });

    const settlement = await service.settle("call-1");

    assert.equal(settlement.settled, true);
    // The price was fixed when the claim was written, not recomputed here.
    assert.deepEqual(debits, [0.1]);
    assert.equal(repo.claims.length, 0);
    assert.ok(repo.state.aiCostDebitedAt);

    // And once debited it stays done.
    await service.settle("call-1");
    assert.deepEqual(debits, [0.1]);
  });

  it("keeps the settlement claim when the debit itself fails", async () => {
    const repo = repository();
    const { service } = build({
      repo,
      credits: {
        consumeCredits: async () => {
          throw new Error("ledger unavailable");
        },
        getBalance: async () => 10,
      },
    });

    await assert.rejects(() => service.settle("call-1"), /ledger unavailable/);
    // Claimed, but never debited — which is exactly what makes the sweep pick
    // it up again rather than writing the call off. The ledger key is
    // idempotent, so retrying the debit is safe; releasing the claim would
    // risk charging twice.
    assert.ok(repo.state.costSettledAt);
    assert.equal(repo.state.aiCostDebitedAt, null);
  });

  describe("the voice leg", () => {
    const linked = () => repository({ ...AGENT_CALL, callId: "telephony-1" });

    it("prices the leg onto the call row with the shared ledger key", async () => {
      const debits: Array<{ amount: number; key: string }> = [];
      const calls = callRepository();
      const { service } = build({
        repo: linked(),
        calls,
        provider: provider([
          { costUsd: 0.265, kind: "telephony" },
          { costUsd: 0.1, kind: "voice_agent" },
        ]),
        credits: {
          consumeCredits: async (
            _ctx: object,
            amount: number,
            ref: { idempotencyKey: string },
          ) => {
            debits.push({ amount, key: ref.idempotencyKey });
            return {};
          },
          getBalance: async () => 10,
        },
      });

      const settlement = await service.settle("call-1");

      assert.equal(settlement.telephonyCostUsd, 0.265);
      assert.equal(calls.costs.length, 1);
      // Rounded to the ledger's precision, like every other amount it stores.
      assert.equal(
        calls.costs[0].totalCost,
        Math.round(0.265 * apiConfiguration.CALL_PROFIT_MARGIN * 1e6) / 1e6,
      );
      // The cost webhook's own key, so only one of the two paths can charge.
      assert.ok(debits.some((d) => d.key === "call-cost:telephony-1"));
    });

    it("sums every leg the call produced", async () => {
      // A failed attempt before the one that connected is its own record.
      const calls = callRepository();
      const { service } = build({
        repo: linked(),
        calls,
        provider: provider([
          { costUsd: 0.265, kind: "telephony" },
          { costUsd: 0, kind: "telephony" },
        ]),
      });

      const settlement = await service.settle("call-1");
      assert.equal(settlement.telephonyCostUsd, 0.265);
    });

    it("leaves a leg the cost webhook already priced alone", async () => {
      const calls = callRepository({
        id: "telephony-1",
        userId: "user-1",
        organizationId: "org-1",
        callControlId: "cc-1",
        callSessionId: "cs-1",
        totalCost: 0.4,
      });
      const { service } = build({
        repo: linked(),
        calls,
        provider: provider([{ costUsd: 0.265, kind: "telephony" }]),
      });

      await service.settle("call-1");
      assert.equal(calls.costs.length, 0);
    });

    it("does not charge for a leg it cannot write the cost onto", async () => {
      // `updateCost` keys on the control id. Debiting first and discovering
      // that afterwards would take credits with nothing to show for them.
      const debits: number[] = [];
      const calls = callRepository({
        id: "telephony-1",
        userId: "user-1",
        organizationId: "org-1",
        callControlId: null,
        callSessionId: "cs-1",
        totalCost: null,
      });
      const { service } = build({
        repo: linked(),
        calls,
        provider: provider([{ costUsd: 0.265, kind: "telephony" }]),
        credits: {
          consumeCredits: async (_ctx: object, amount: number) => {
            debits.push(amount);
            return {};
          },
          getBalance: async () => 10,
        },
      });

      await service.settle("call-1");

      assert.equal(calls.costs.length, 0);
      assert.deepEqual(debits, []);
    });

    it("does not price the leg at zero before the provider reports it", async () => {
      const calls = callRepository();
      const { service } = build({
        repo: linked(),
        calls,
        // Only the AI half has been published so far.
        provider: provider([{ costUsd: 0.1, kind: "voice_agent" }]),
      });

      const settlement = await service.settle("call-1");

      assert.equal(settlement.telephonyCostUsd, undefined);
      assert.equal(calls.costs.length, 0);
      assert.equal(calls.call!.totalCost, null);
    });
  });

  /**
   * An agent call has nobody on Ringee's end of the leg, so nothing but the
   * provider's status callback ever writes its timeline — and that callback is
   * a delivery like any other. The records that price the call also say when it
   * started, when it ended and whether it ever connected, so the read that
   * settles the money settles the timeline with it.
   */
  describe("the call's timeline", () => {
    const STARTED = new Date("2026-09-01T11:42:00.000Z");
    const ENDED = new Date("2026-09-01T11:43:27.000Z");

    const pending = () =>
      callRepository({
        id: "telephony-1",
        userId: "user-1",
        organizationId: "org-1",
        callControlId: "cc-1",
        callSessionId: "cs-1",
        status: "pending",
        answeredAt: null,
        endedAt: null,
        totalCost: null,
      });

    const linked = () =>
      repository({
        ...AGENT_CALL,
        callId: "telephony-1",
        status: "initiating",
      });

    it("closes a call whose status callback never arrived", async () => {
      const calls = pending();
      const repo = linked();
      const { service } = build({
        repo,
        calls,
        provider: provider([
          {
            costUsd: 0.66,
            kind: "telephony",
            connectedSeconds: 87,
            startedAt: STARTED,
            endedAt: ENDED,
          },
          { costUsd: 0.1, kind: "voice_agent" },
        ]),
      });

      await service.settle("call-1");

      // Dated from the provider's own record of the leg, not from the moment
      // the sweep happened to run — which is what made every agent call read
      // as a zero-second one.
      assert.deepEqual(calls.completed, [
        { startedAt: STARTED, endedAt: ENDED },
      ]);
      // The answer has to be dated too: an absent `answeredAt` is exactly what
      // `completeCall` reads to file a call as one nobody picked up.
      const answered = calls.attached.find((write) => write.answeredAt);
      assert.ok(answered);
      assert.deepEqual(
        answered.answeredAt,
        new Date(ENDED.getTime() - 87 * 1000),
      );
      assert.equal(answered.status, "answered");
      // And the agent call leaves its dialing state, which is what the
      // artifact sweep looks for.
      assert.equal(repo.state.status, "completed");
    });

    it("files a leg nobody picked up as a no-answer", async () => {
      // A refused leg reports an end time and a charge like any other. What
      // tells it apart is that the two ends were never connected.
      const calls = pending();
      const repo = linked();
      const { service } = build({
        repo,
        calls,
        provider: provider([
          {
            costUsd: 0.02,
            kind: "telephony",
            connectedSeconds: 0,
            startedAt: STARTED,
            endedAt: ENDED,
          },
        ]),
      });

      await service.settle("call-1");

      assert.deepEqual(calls.completed, [
        { startedAt: STARTED, endedAt: ENDED },
      ]);
      assert.equal(
        calls.attached.find((write) => write.answeredAt),
        undefined,
      );
      assert.equal(repo.state.status, "no_answer");
    });

    it("leaves a call the callback already closed exactly as it is", async () => {
      // The callback saw the leg; this only reads about it afterwards.
      const calls = callRepository({
        id: "telephony-1",
        userId: "user-1",
        organizationId: "org-1",
        callControlId: "cc-1",
        callSessionId: "cs-1",
        status: "completed",
        answeredAt: STARTED,
        endedAt: ENDED,
        totalCost: null,
      });
      const { service } = build({
        repo: repository({
          ...AGENT_CALL,
          callId: "telephony-1",
          status: "completed",
        }),
        calls,
        provider: provider([
          {
            costUsd: 0.66,
            kind: "telephony",
            connectedSeconds: 87,
            startedAt: STARTED,
            endedAt: ENDED,
          },
        ]),
      });

      await service.settle("call-1");

      assert.deepEqual(calls.completed, []);
      assert.deepEqual(calls.attached, []);
    });

    it("waits rather than closing a call the provider has not finished", async () => {
      // A leg still in progress is published without an end. Closing it from
      // that would freeze the duration at whatever the sweep saw.
      const calls = pending();
      const repo = linked();
      const { service } = build({
        repo,
        calls,
        provider: provider([
          { costUsd: 0.66, kind: "telephony", connectedSeconds: 12 },
        ]),
      });

      await service.settle("call-1");

      assert.deepEqual(calls.completed, []);
      assert.equal(repo.state.status, "initiating");
    });

    it("closes a call whose money was already fully settled", async () => {
      // The state the reported call was in: priced, debited, and still
      // reading `pending` — because the two are settled by different things
      // and only one of them ever ran. A pass that stopped at "nothing is
      // owed" would leave it that way for good.
      const calls = callRepository({
        id: "telephony-1",
        userId: "user-1",
        organizationId: "org-1",
        callControlId: "cc-1",
        callSessionId: "cs-1",
        status: "pending",
        answeredAt: null,
        endedAt: null,
        totalCost: 0.66,
      });
      const repo = repository({
        ...AGENT_CALL,
        callId: "telephony-1",
        status: "initiating",
        costSettledAt: new Date(),
        aiCostDebitedAt: new Date(),
        aiCostUsd: 0.1,
        aiChargedCredits: 0.2,
      });
      const { service } = build({
        repo,
        calls,
        provider: provider([
          {
            costUsd: 0.265,
            kind: "telephony",
            connectedSeconds: 97,
            startedAt: STARTED,
            endedAt: ENDED,
          },
        ]),
      });

      await service.settle("call-1");

      assert.deepEqual(calls.completed, [
        { startedAt: STARTED, endedAt: ENDED },
      ]);
      assert.equal(repo.state.status, "completed");
    });

    it("takes the connected leg's answer when an earlier attempt failed", async () => {
      // Two records, one call: the attempt that was refused and the one that
      // carried the conversation.
      const calls = pending();
      const { service } = build({
        repo: linked(),
        calls,
        provider: provider([
          {
            costUsd: 0.02,
            kind: "telephony",
            connectedSeconds: 0,
            startedAt: STARTED,
            endedAt: new Date(STARTED.getTime() + 8000),
          },
          {
            costUsd: 0.66,
            kind: "telephony",
            connectedSeconds: 87,
            startedAt: new Date(STARTED.getTime() + 10000),
            endedAt: ENDED,
          },
        ]),
      });

      await service.settle("call-1");

      // The whole span of the call, and the answer that actually happened.
      assert.deepEqual(calls.completed, [
        { startedAt: STARTED, endedAt: ENDED },
      ]);
      assert.ok(calls.attached.find((write) => write.answeredAt));
    });
  });

  describe("the recording", () => {
    const linked = () => repository({ ...AGENT_CALL, callId: "telephony-1" });

    it("stores the recording the provider kept for the call", async () => {
      const { service, processed } = build({
        repo: linked(),
        provider: provider(
          [{ costUsd: 0.1, kind: "voice_agent" }],
          [{ downloadUrl: "https://provider.example/rec.mp3" }],
        ),
      });

      await service.settle("call-1");

      assert.equal(processed.length, 1);
      assert.deepEqual(
        (processed[0] as { recording: { publicUrl: string } }).recording
          .publicUrl,
        "https://provider.example/rec.mp3",
      );
    });

    it("looks the recording up by the handle the dial path wrote down", async () => {
      // A provider-placed agent leg reports its session only on an event
      // Ringee may never receive. Filtering on the session answered "no
      // recording" for every agent call ever made, while the audio sat on the
      // provider under the control id.
      const providerDouble = provider(
        [{ costUsd: 0.1, kind: "voice_agent" }],
        [{ downloadUrl: "https://provider.example/rec.mp3" }],
      );
      const { service } = build({
        repo: linked(),
        provider: providerDouble,
      });

      await service.settle("call-1");

      assert.equal(providerDouble.recordingQueries.length, 1);
      assert.equal(providerDouble.recordingQueries[0]!.callControlId, "cc-1");
    });

    it("writes down the session the recording is filed under", async () => {
      // The recording is one of the few places the session handle is ever
      // reported. Keeping it is what makes every session-keyed read of this
      // call find it.
      const calls = callRepository({
        id: "telephony-1",
        userId: "user-1",
        organizationId: "org-1",
        callControlId: "cc-1",
        callSessionId: null,
        totalCost: null,
      });
      const { service } = build({
        repo: linked(),
        calls,
        provider: provider(
          [{ costUsd: 0.1, kind: "voice_agent" }],
          [{ downloadUrl: "https://provider.example/rec.mp3" }],
        ),
      });

      await service.settle("call-1");

      assert.ok(
        calls.attached.some((write) => write.callSessionId === "cs-1"),
        "the session handle the recording reported was not kept",
      );
    });

    it("does not store a recording the call already has", async () => {
      const { service, processed } = build({
        repo: linked(),
        recordings: [{ status: "completed" }],
        provider: provider(
          [{ costUsd: 0.1, kind: "voice_agent" }],
          [{ downloadUrl: "https://provider.example/rec.mp3" }],
        ),
      });

      await service.settle("call-1");
      assert.equal(processed.length, 0);
    });

    it("settles the money even when the recording cannot be fetched", async () => {
      const badProvider = {
        ...provider([{ costUsd: 0.1, kind: "voice_agent" }]),
        fetchRecordings: async () => {
          throw new Error("provider unavailable");
        },
      };
      const { service, repo } = build({
        repo: linked(),
        provider: badProvider as never,
      });

      const settlement = await service.settle("call-1");

      assert.equal(settlement.settled, true);
      assert.ok(repo.state.costSettledAt);
    });
  });

  describe("the artifacts", () => {
    const linked = () => repository({ ...AGENT_CALL, callId: "telephony-1" });

    it("recovers the transcript in the same pass as the recording", async () => {
      const { service, transcribed } = build({ repo: linked() });

      await service.settle("call-1");

      assert.deepEqual(transcribed, ["call-1"]);
    });

    it("goes back for artifacts a settled call never received", async () => {
      // The recording and the transcript are published on their own schedule,
      // so a call routinely settles its money while its audio is still being
      // written — and a settled call has already left the billing list.
      const repo = linked();
      const outstanding = {
        ...AGENT_CALL,
        id: "call-2",
        callId: "telephony-1",
      };
      repo.listMissingArtifacts = async () => [outstanding];

      const { service, transcribed } = build({ repo });

      const result = await service.sweep();

      assert.equal(result.recovered, 1);
      assert.deepEqual(transcribed, ["call-2"]);
    });
  });
});
