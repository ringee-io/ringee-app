/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AiStreamEvent } from "@ringee/platform";
import {
  AiPipelineCreditService,
  AiPipelineReplyError,
} from "../ai-pipeline-credit.service";
import { PipelineRunInput } from "../ai-pipeline.types";
import { FollowUpAiBatchService } from "./follow-up-ai-batch.service";

const input: PipelineRunInput = {
  context: { type: "personal", userId: "user-1" },
  trigger: "manual",
  eligibleCalls: [
    {
      callId: "call-1",
      context: { type: "personal", userId: "user-1" },
      outcomeClass: "interested",
      hasUsableTranscript: true,
      durationBucket: "normal",
      objections: [],
      intentSignals: [],
      notablePhrases: [],
      contactId: "contact-1",
      durationSeconds: 120,
      userId: "user-1",
    },
  ],
};

function serviceStreaming(events: AiStreamEvent[]) {
  const debits: number[] = [];
  const providers = {
    get: () => ({
      async *stream() {
        yield* events;
      },
    }),
  };
  const billing = new AiPipelineCreditService({
    consumeCredits: async (_owner: object, amount: number) => {
      debits.push(amount);
      return {};
    },
  } as never);
  return {
    service: new FollowUpAiBatchService(providers as never, billing),
    debits,
  };
}

describe("FollowUpAiBatchService", () => {
  it("bills a reply that skipped the required tool, then fails", async () => {
    // What the Anthropic adapter emits when a required call is answered in
    // plain text: the error first, then the usage the reply consumed.
    const { service, debits } = serviceStreaming([
      { type: "text_delta", delta: "Here is my analysis" },
      {
        type: "error",
        error: "answered without calling the required tool",
      },
      {
        type: "completed",
        finishReason: "error",
        usage: {
          model: "gpt-5.4-mini",
          inputTokens: 1_000,
          outputTokens: 100,
        },
      },
    ]);

    const rejection = await service
      .enrich(input)
      .catch((error: unknown) => error);

    assert.ok(rejection instanceof AiPipelineReplyError);
    assert.equal(
      rejection.message,
      "answered without calling the required tool",
    );
    assert.equal(debits.length, 1);
    assert.ok(debits[0] > 0);
    assert.equal(rejection.chargedCredits, debits[0]);
  });

  it("fails a request that never got a reply without billing it", async () => {
    const { service, debits } = serviceStreaming([
      { type: "error", error: "400 invalid_request_error" },
      { type: "completed", finishReason: "error" },
    ]);

    const rejection = await service
      .enrich(input)
      .catch((error: unknown) => error);

    assert.ok(rejection instanceof AiPipelineReplyError);
    assert.equal(rejection.chargedCredits, 0);
    assert.deepEqual(debits, []);
  });

  it("bills and returns the enrichment of a reply that called the tool", async () => {
    const { service, debits } = serviceStreaming([
      { type: "tool_call_started", id: "tool-1", name: "emit_enrichment" },
      {
        type: "tool_call_completed",
        id: "tool-1",
        name: "emit_enrichment",
        arguments: { items: [{ callId: "call-1", priority: "high" }] },
      },
      {
        type: "completed",
        finishReason: "tool_calls",
        usage: {
          model: "gpt-5.4-mini",
          inputTokens: 1_000,
          outputTokens: 100,
        },
      },
    ]);

    const output = await service.enrich(input);

    assert.equal(output.enrichedCount, 1);
    assert.equal(output.enrichment.get("call-1")?.priority, "high");
    assert.deepEqual(debits, [output.chargedCredits]);
  });
});
