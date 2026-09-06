/// <reference types="node" />
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { apiConfiguration } from "@ringee/configuration";
import { HttpException } from "@nestjs/common";
import { VoiceAgentService } from "./voice-agent.service";
import type { VoiceClone, OwnershipContext } from "@ringee/platform";

const initialBaseCost = apiConfiguration.AI_VOICE_AGENT_CLONE_BASE_COST_USD;
const initialMargin = apiConfiguration.AI_VOICE_AGENT_CLONE_PROFIT_MARGIN;
after(() => {
  apiConfiguration.AI_VOICE_AGENT_CLONE_BASE_COST_USD = initialBaseCost;
  apiConfiguration.AI_VOICE_AGENT_CLONE_PROFIT_MARGIN = initialMargin;
});
const CTX = { userId: "user-1", organizationId: "org-1" };
const OTHER = { userId: "user-2", organizationId: "org-2" };
const INPUT = {
  requestId: "12345678-1234-4234-8234-123456789012",
  expectedPriceUsd: 0,
  name: "Reception",
  language: "es",
  gender: "female" as const,
};

function audio(seconds = 5) {
  const bytes = Buffer.alloc(44 + seconds * 48000);
  bytes.write("RIFF");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(24000, 24);
  bytes.writeUInt32LE(48000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}

function build(
  options: { baseCost?: number; margin?: number; balance?: number } = {},
) {
  apiConfiguration.AI_VOICE_AGENT_CLONE_BASE_COST_USD = options.baseCost ?? 0;
  apiConfiguration.AI_VOICE_AGENT_CLONE_PROFIT_MARGIN = options.margin ?? 1;
  let balance = options.balance ?? 100;
  let failMarker = false;
  let failDebit = false;
  const debits = new Map<
    string,
    { amount: number; ctx: OwnershipContext; source: string }
  >();
  const debitCalls: string[] = [];
  const rows: Array<Record<string, any>> = [];
  const clones: VoiceClone[] = [];
  let uploads = 0;
  let previews = 0;
  let failure: Error | null = null;
  const repo = {
    findCustomVoiceByRequestKey: async (
      ctx: OwnershipContext,
      requestKey: string,
    ) => {
      const row = rows.find(
        (row) =>
          row.requestKey === requestKey &&
          row.organizationId === ctx.organizationId,
      );
      return row ? { ...row } : null;
    },
    listUnsettledCustomVoices: async (afterId?: string) =>
      rows
        .filter(
          (row) =>
            !row.chargedAt &&
            ["pending", "ready"].includes(row.status) &&
            (!afterId || row.id > afterId),
        )
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, 100)
        .map((row) => ({ ...row })),
    reserveCustomVoice: async (
      ctx: OwnershipContext,
      data: Record<string, any>,
    ) => {
      const existing = rows.find((row) => row.requestKey === data.requestKey);
      if (existing) return { created: false, voice: { ...existing } };
      const voice = {
        ...data,
        ...ctx,
        status: "pending",
        providerCloneId: null,
        voiceId: null,
        lastError: null,
        chargedAt: null,
      };
      rows.push(voice);
      return { created: true, voice: { ...voice } };
    },
    listCustomVoicesForOwner: async (ctx: OwnershipContext) =>
      rows
        .filter((row) => row.organizationId === ctx.organizationId)
        .map((row) => ({ ...row })),
    updateCustomVoice: async (
      ctx: OwnershipContext,
      id: string,
      data: Record<string, unknown>,
    ) => {
      const row = rows.find(
        (item) => item.id === id && item.organizationId === ctx.organizationId,
      );
      assert.ok(row);
      if (data.chargedAt && failMarker) {
        failMarker = false;
        throw new Error("database disconnected after debit");
      }
      Object.assign(row, data);
      return { ...row };
    },
    findByIdForOwner: async () => ({ id: "agent", modelProvider: "ringee" }),
    update: async () => ({}),
  };
  const provider = {
    cloneVoice: async (input: { name: string }) => {
      uploads++;
      const clone: VoiceClone = {
        cloneId: "clone-" + uploads,
        name: input.name,
        voiceId: null,
        status: "pending",
      };
      if (failure instanceof HttpException && failure.getStatus() < 500)
        throw failure;
      clones.push(clone);
      if (failure) throw failure;
      return clone;
    },
    listClonedVoices: async () => clones,
    listVoices: async () => [],
    renderVoicePreview: async () => {
      previews++;
      return { audio: Buffer.from("preview"), contentType: "audio/wav" };
    },
  };
  const service = new VoiceAgentService(
    repo as never,
    {} as never,
    {} as never,
    provider as never,
    {} as never,
    {} as never,
    {} as never,
    {
      getBalance: async () => balance,
      consumeCredits: async (
        ctx: OwnershipContext,
        amount: number,
        ref: { idempotencyKey: string; source: string },
      ) => {
        debitCalls.push(ref.idempotencyKey);
        if (failDebit) throw new Error("ledger unavailable");
        if (!debits.has(ref.idempotencyKey)) {
          debits.set(ref.idempotencyKey, { amount, ctx, source: ref.source });
          balance -= amount;
        }
        return { amount: balance };
      },
    } as never,
  );
  return {
    service,
    rows,
    clones,
    uploads: () => uploads,
    debits,
    debitCalls,
    balance: () => balance,
    failNextSettlementMarker: () => {
      failMarker = true;
    },
    failDebit: (value: boolean) => {
      failDebit = value;
    },
    previews: () => previews,
    fail: (error: Error) => {
      failure = error;
    },
  };
}

describe("workspace voice cloning", () => {
  it("reserves once under concurrent retries and preserves the human name", async () => {
    const h = build();
    const [a, b] = await Promise.all([
      h.service.cloneVoice(CTX, INPUT, audio()),
      h.service.cloneVoice(CTX, INPUT, audio()),
    ]);
    assert.equal(h.uploads(), 1);
    assert.equal(a.custom?.id, b.custom?.id);
    assert.equal(a.displayName, "Reception");
    assert.equal(a.custom?.status, "pending");
  });

  it("rejects changed payloads on the same request key", async () => {
    const h = build();
    await h.service.cloneVoice(CTX, INPUT, audio());
    await assert.rejects(
      h.service.cloneVoice(CTX, { ...INPUT, name: "Different" }, audio()),
      /already used/,
    );
    assert.equal(h.uploads(), 1);
  });

  it("scopes retries and reads to the organization", async () => {
    const h = build();
    await h.service.cloneVoice(CTX, INPUT, audio());
    assert.deepEqual(await h.service.listCustomVoices(OTHER), []);
    await h.service.cloneVoice(OTHER, INPUT, audio());
    assert.equal(h.uploads(), 2);
    assert.equal((await h.service.listCustomVoices(OTHER)).length, 1);
  });

  it("recovers an accepted upload after a lost response without another upload", async () => {
    const h = build();
    h.fail(new Error("connection interrupted"));
    await h.service.cloneVoice(CTX, INPUT, audio());
    assert.equal(h.rows[0]!.providerCloneId, null);
    Object.assign(h.clones[0]!, {
      status: "ready",
      voiceId: "Telnyx.Ultra.custom",
    });
    const voices = await h.service.listCustomVoices(CTX);
    assert.equal(voices[0]?.custom?.status, "ready");
    assert.equal(voices[0]?.id, "Telnyx.Ultra.custom");
    await h.service.cloneVoice(CTX, INPUT, audio());
    assert.equal(h.uploads(), 1);
  });

  it("does not replay a definitive provider refusal", async () => {
    const h = build();
    h.fail(
      new HttpException(
        { errors: [{ detail: "Sample contains no speech" }] },
        422,
      ),
    );
    const voice = await h.service.cloneVoice(CTX, INPUT, audio());
    assert.equal(voice.custom?.status, "failed");
    assert.match(voice.custom?.lastError ?? "", /no speech/);
    await h.service.cloneVoice(CTX, INPUT, audio());
    assert.equal(h.uploads(), 1);
  });

  it("checks ownership before returning even an already cached preview", async () => {
    const h = build();
    await h.service.cloneVoice(CTX, INPUT, audio());
    Object.assign(h.clones[0]!, {
      status: "ready",
      voiceId: "Telnyx.Ultra.custom",
    });
    await h.service.previewVoice(CTX, "Telnyx.Ultra.custom");
    await assert.rejects(
      h.service.previewVoice(OTHER, "Telnyx.Ultra.custom"),
      /not available/,
    );
    assert.equal(h.previews(), 1);
  });

  it("blocks pending and expired voices from preview and assignment", async () => {
    const h = build();
    const pending = await h.service.cloneVoice(CTX, INPUT, audio());
    await assert.rejects(
      h.service.previewVoice(CTX, pending.id),
      /not available/,
    );
    await assert.rejects(
      h.service.update(CTX, "agent", { voiceId: pending.id }),
      /not available/,
    );
    Object.assign(h.clones[0]!, {
      status: "ready",
      voiceId: "Telnyx.Ultra.custom",
    });
    await h.service.listCustomVoices(CTX);
    h.clones.length = 0;
    assert.equal(
      (await h.service.listCustomVoices(CTX))[0]?.custom?.status,
      "expired",
    );
    await assert.rejects(
      h.service.update(CTX, "agent", { voiceId: "Telnyx.Ultra.custom" }),
      /not available/,
    );
  });

  it("rejects invalid audio and personal workspace access before uploading", async () => {
    const h = build();
    await assert.rejects(
      h.service.cloneVoice(CTX, INPUT, audio(2)),
      /between 3 and 15/,
    );
    await assert.rejects(
      h.service.cloneVoice(CTX, INPUT, Buffer.from("fake wav")),
      /valid mono/,
    );
    await assert.rejects(
      h.service.cloneVoice({ userId: "personal" }, INPUT, audio()),
      /organization/,
    );
    assert.equal(h.uploads(), 0);
  });
});

describe("voice cloning credit settlement", () => {
  it("leaves free cloning usable with no credit and never writes a zero debit", async () => {
    const h = build({ balance: -1, margin: 3 });
    assert.deepEqual(await h.service.getCloneQuote(CTX), {
      amountUsd: 0,
      currency: "USD",
      canAfford: true,
    });
    await h.service.cloneVoice(CTX, INPUT, audio());
    Object.assign(h.clones[0]!, {
      status: "ready",
      voiceId: "Telnyx.Ultra.free",
    });
    await h.service.sweepCustomVoices();
    assert.equal(h.debitCalls.length, 0);
    assert.equal(h.balance(), -1);
    assert.ok(h.rows[0]!.chargedAt);
    assert.equal(
      (await h.service.listCustomVoices(CTX))[0]?.custom?.status,
      "ready",
    );
  });

  it("quotes the margin and rejects insufficient credit or stale prices before any upload", async () => {
    const h = build({ baseCost: 2, margin: 1.5, balance: 2.99 });
    assert.deepEqual(await h.service.getCloneQuote(CTX), {
      amountUsd: 3,
      currency: "USD",
      canAfford: false,
    });
    await assert.rejects(
      h.service.cloneVoice(CTX, { ...INPUT, expectedPriceUsd: 3 }, audio()),
      (error: unknown) =>
        error instanceof HttpException && error.getStatus() === 402,
    );
    await assert.rejects(
      h.service.cloneVoice(CTX, INPUT, audio()),
      /price has changed/,
    );
    await assert.rejects(
      h.service.getCloneQuote({ userId: "personal" }),
      /organization/,
    );
    assert.equal(h.rows.length, 0);
    assert.equal(h.uploads(), 0);
    assert.equal(h.debits.size, 0);
  });

  it("snapshots the accepted price and settles once even when a sweep races browser polling", async () => {
    const h = build({ baseCost: 2, margin: 1.5, balance: 10 });
    const input = { ...INPUT, expectedPriceUsd: 3 };
    await h.service.cloneVoice(CTX, input, audio());
    assert.equal(h.debits.size, 0);
    apiConfiguration.AI_VOICE_AGENT_CLONE_PROFIT_MARGIN = 4;
    await h.service.cloneVoice(CTX, input, audio());
    Object.assign(h.clones[0]!, {
      status: "ready",
      voiceId: "Telnyx.Ultra.paid",
    });
    await Promise.all([
      h.service.sweepCustomVoices(),
      h.service.listCustomVoices({ ...CTX, userId: "another-org-member" }),
    ]);
    await h.service.sweepCustomVoices();
    await h.service.listCustomVoices(CTX);
    assert.equal(h.debits.size, 1);
    assert.equal(h.balance(), 7);
    const debit = h.debits.get("voice-clone:" + h.rows[0]!.id);
    assert.equal(debit?.amount, 3);
    assert.equal(debit?.ctx.organizationId, CTX.organizationId);
    assert.equal(debit?.source, "ai-voice-agent.voice-clone");
    assert.equal(h.rows[0]!.providerCostUsd, 2);
    assert.equal(h.rows[0]!.profitMultiplier, 1.5);
    assert.equal(h.uploads(), 1);
  });

  it("recovers a lost settlement marker without debiting a second time", async () => {
    const h = build({ baseCost: 2, balance: 10 });
    await h.service.cloneVoice(CTX, { ...INPUT, expectedPriceUsd: 2 }, audio());
    Object.assign(h.clones[0]!, {
      status: "ready",
      voiceId: "Telnyx.Ultra.recover",
    });
    h.failNextSettlementMarker();
    await h.service.sweepCustomVoices();
    assert.equal(h.balance(), 8);
    assert.equal(h.rows[0]!.chargedAt, null);
    await h.service.sweepCustomVoices();
    assert.equal(h.balance(), 8);
    assert.equal(h.debits.size, 1);
    assert.ok(h.rows[0]!.chargedAt);
    assert.deepEqual(h.debitCalls, [
      "voice-clone:" + h.rows[0]!.id,
      "voice-clone:" + h.rows[0]!.id,
    ]);
  });

  it("does not expose a usable paid voice until its debit succeeds", async () => {
    const h = build({ baseCost: 2 });
    const input = { ...INPUT, expectedPriceUsd: 2 };
    await h.service.cloneVoice(CTX, input, audio());
    Object.assign(h.clones[0]!, {
      status: "ready",
      voiceId: "Telnyx.Ultra.unpaid",
    });
    h.failDebit(true);
    await h.service.sweepCustomVoices();
    assert.equal(
      (await h.service.cloneVoice(CTX, input, audio())).custom?.status,
      "pending",
    );
    await assert.rejects(h.service.previewVoice(CTX, "Telnyx.Ultra.unpaid"));
    assert.equal(h.previews(), 0);
    h.failDebit(false);
    await h.service.sweepCustomVoices();
    assert.equal(
      (await h.service.listCustomVoices(CTX))[0]?.custom?.status,
      "ready",
    );
    assert.equal(h.debits.size, 1);
  });

  it("does not charge rejected or failed clones and tolerates delayed provider listing", async () => {
    const h = build({ baseCost: 2 });
    const input = { ...INPUT, expectedPriceUsd: 2 };
    await h.service.cloneVoice(CTX, input, audio());
    const clone = h.clones.pop()!;
    assert.equal(
      (await h.service.listCustomVoices(CTX))[0]?.custom?.status,
      "pending",
    );
    h.clones.push({ ...clone, status: "failed" });
    await h.service.sweepCustomVoices();
    assert.equal(h.rows[0]!.status, "failed");
    h.fail(new HttpException("Invalid sample", 422));
    await h.service.cloneVoice(
      CTX,
      { ...input, requestId: "22345678-1234-4234-8234-123456789012" },
      audio(),
    );
    await h.service.sweepCustomVoices();
    assert.equal(h.debits.size, 0);
    assert.equal(h.balance(), 100);
  });
});
