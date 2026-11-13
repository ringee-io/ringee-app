/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { apiConfiguration } from "@ringee/configuration";
import {
  AiPipelineChargeError,
  AiPipelineCreditService,
  AiPipelineReplyError,
} from "./ai-pipeline-credit.service";

describe("AiPipelineCreditService", () => {
  it("charges the organization the priced token usage with margin", async () => {
    const debits: Array<{ owner: object; amount: number }> = [];
    const credits = {
      consumeCredits: async (
        owner: object,
        amount: number,
        ref: { idempotencyKey: string; source: string },
      ) => {
        assert.ok(ref.idempotencyKey.length > 0, "debit must carry a key");
        assert.equal(ref.source, "ai.pipeline.run");
        debits.push({ owner, amount });
        return {};
      },
    };
    const service = new AiPipelineCreditService(credits as never);

    const charged = await service.chargeUsage({
      context: {
        type: "organization_outside_campaign",
        organizationId: "00000000-0000-0000-0000-000000000001",
      },
      fallbackUserId: "00000000-0000-0000-0000-000000000002",
      usage: {
        model: "gpt-5.4-mini",
        inputTokens: 1_000_000,
        outputTokens: 100_000,
      },
      operation: "test pipeline",
    });

    const expected = 1.2 * apiConfiguration.AI_TOKEN_MARGIN;
    assert.equal(charged, expected);
    assert.deepEqual(debits, [
      {
        owner: {
          userId: "00000000-0000-0000-0000-000000000002",
          organizationId: "00000000-0000-0000-0000-000000000001",
        },
        amount: expected,
      },
    ]);
  });

  it("rejects an unpriced model instead of completing for free", async () => {
    const service = new AiPipelineCreditService({} as never);
    await assert.rejects(
      service.chargeUsage({
        context: { type: "personal", userId: "user-1" },
        fallbackUserId: "user-1",
        usage: {
          model: "unpriced-model",
          inputTokens: 100,
          outputTokens: 10,
        },
        operation: "test pipeline",
      }),
      AiPipelineChargeError,
    );
  });

  it("charges a personal context to its own user", async () => {
    let chargedOwner: object | undefined;
    const service = new AiPipelineCreditService({
      consumeCredits: async (owner: object) => {
        chargedOwner = owner;
        return {};
      },
    } as never);

    await service.chargeUsage({
      context: { type: "personal", userId: "user-1" },
      fallbackUserId: null,
      usage: {
        model: "claude-haiku-4-5",
        inputTokens: 1000,
        outputTokens: 100,
      },
      operation: "personal pipeline",
    });

    assert.deepEqual(chargedOwner, {
      userId: "user-1",
      organizationId: null,
    });
  });

  it("surfaces a failed debit instead of reporting a free success", async () => {
    const service = new AiPipelineCreditService({
      consumeCredits: async () => {
        throw new Error("database unavailable");
      },
    } as never);

    await assert.rejects(
      service.chargeUsage({
        context: { type: "personal", userId: "user-1" },
        fallbackUserId: null,
        usage: {
          model: "gpt-5.4-mini",
          inputTokens: 100,
          outputTokens: 10,
        },
        operation: "personal pipeline",
      }),
      /credit debit failed/,
    );
  });

  it("bills a rejected reply's tokens, then raises its error", async () => {
    const debits: number[] = [];
    const service = new AiPipelineCreditService({
      consumeCredits: async (_owner: object, amount: number) => {
        debits.push(amount);
        return {};
      },
    } as never);

    const rejection = await service
      .chargeFailedReply({
        context: { type: "personal", userId: "user-1" },
        fallbackUserId: null,
        usage: {
          model: "gpt-5.4-mini",
          inputTokens: 1_000_000,
          outputTokens: 100_000,
        },
        operation: "personal pipeline",
        error: "answered without calling the required tool",
      })
      .catch((error: unknown) => error);

    const expected = 1.2 * apiConfiguration.AI_TOKEN_MARGIN;
    assert.ok(rejection instanceof AiPipelineReplyError);
    assert.equal(
      rejection.message,
      "answered without calling the required tool",
    );
    assert.equal(rejection.chargedCredits, expected);
    assert.deepEqual(debits, [expected]);
  });

  it("raises a failure without usage with nothing to bill", async () => {
    const service = new AiPipelineCreditService({
      consumeCredits: async () => {
        throw new Error("a reply without usage must not be debited");
      },
    } as never);

    const rejection = await service
      .chargeFailedReply({
        context: { type: "personal", userId: "user-1" },
        fallbackUserId: null,
        usage: undefined,
        operation: "personal pipeline",
        error: "400 invalid_request_error",
      })
      .catch((error: unknown) => error);

    assert.ok(rejection instanceof AiPipelineReplyError);
    assert.equal(rejection.chargedCredits, 0);
  });
});
