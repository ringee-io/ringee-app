/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { apiConfiguration } from "@ringee/configuration";
import { VoiceAgentBillingService } from "./voice-agent-billing.service";

const AGENT_CALL = {
  id: "call-1",
  userId: "user-1",
  organizationId: "org-1",
  providerConversationId: "conv-1",
  providerCallControlId: "cc-1",
  costSettledAt: null,
  aiCostDebitedAt: null,
  aiCostUsd: null,
  aiChargedCredits: null,
};

/** A repository whose settle-once claim behaves like the real updateMany. */
function repository(row: Record<string, unknown> = AGENT_CALL) {
  const state = { ...row };
  const claims: Array<{ cost: number; charged: number }> = [];
  return {
    claims,
    state,
    findById: async () => (state.id ? state : null),
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
  };
}

function provider(records: Array<{ costUsd: number }>) {
  return {
    fetchUsageRecords: async () =>
      records.map((r) => ({
        kind: "voice_agent" as const,
        conversationId: "conv-1",
        callControlId: "cc-1",
        costUsd: r.costUsd,
        billedSeconds: 60,
        occurredAt: new Date(),
      })),
  };
}

describe("VoiceAgentBillingService", () => {
  it("charges the provider's own cost times the configured margin", async () => {
    const debits: Array<{ amount: number; key: string; source: string }> = [];
    const credits = {
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
    };
    const repo = repository();
    const service = new VoiceAgentBillingService(
      repo as never,
      // The voice engine and the LLM tokens are separate records on one call.
      provider([{ costUsd: 0.05 }, { costUsd: 0.011 }]) as never,
      credits as never,
    );

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

  it("debits once no matter how many times settlement runs", async () => {
    let debitCount = 0;
    const credits = {
      consumeCredits: async () => {
        debitCount += 1;
        return {};
      },
    };
    const repo = repository();
    const service = new VoiceAgentBillingService(
      repo as never,
      provider([{ costUsd: 0.05 }]) as never,
      credits as never,
    );

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
    const credits = {
      consumeCredits: async () => {
        debitCount += 1;
        return {};
      },
    };
    const repo = repository();
    const service = new VoiceAgentBillingService(
      repo as never,
      provider([]) as never,
      credits as never,
    );

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
    const service = new VoiceAgentBillingService(
      repo as never,
      provider([{ costUsd: 0.05 }]) as never,
      { consumeCredits: async () => ({}) } as never,
    );

    const settlement = await service.settle("call-1");
    assert.equal(settlement.settled, false);
    assert.equal(repo.state.costSettledAt, null);
  });

  it("closes out a call the provider charged nothing for", async () => {
    let debitCount = 0;
    const repo = repository();
    const service = new VoiceAgentBillingService(
      repo as never,
      provider([{ costUsd: 0 }]) as never,
      {
        consumeCredits: async () => {
          debitCount += 1;
          return {};
        },
      } as never,
    );

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
    const service = new VoiceAgentBillingService(
      repo as never,
      provider([{ costUsd: 0.05 }]) as never,
      {
        consumeCredits: async (_ctx: object, amount: number) => {
          debits.push(amount);
          return {};
        },
      } as never,
    );

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

  it("leaves a claimed-but-undebited call for the sweep to retry", async () => {
    const repo = repository();
    const service = new VoiceAgentBillingService(
      repo as never,
      provider([{ costUsd: 0.05 }]) as never,
      {
        consumeCredits: async () => {
          throw new Error("ledger unavailable");
        },
      } as never,
    );

    await assert.rejects(() => service.settle("call-1"), /ledger unavailable/);
    // Claimed, but never debited — which is exactly what makes the sweep pick
    // it up again rather than writing the call off.
    assert.ok(repo.state.costSettledAt);
    assert.equal(repo.state.aiCostDebitedAt, null);
  });

  it("keeps the settlement claim when the debit itself fails", async () => {
    const repo = repository();
    const service = new VoiceAgentBillingService(
      repo as never,
      provider([{ costUsd: 0.05 }]) as never,
      {
        consumeCredits: async () => {
          throw new Error("ledger unavailable");
        },
      } as never,
    );

    await assert.rejects(() => service.settle("call-1"), /ledger unavailable/);
    // The ledger key is idempotent, so retrying the debit is safe; releasing
    // the claim would risk charging twice.
    assert.ok(repo.state.costSettledAt);
  });
});
