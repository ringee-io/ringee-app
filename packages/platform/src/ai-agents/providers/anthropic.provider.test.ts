import { describe, expect, it, vi } from "vitest";
import type { AiStreamEvent, AiStreamRequest } from "../types";
import { AnthropicProvider } from "./anthropic.provider";

/**
 * `@ringee/configuration` validates the whole app environment on import and
 * exits when anything is missing; the adapter reads only these values.
 */
vi.mock("@ringee/configuration", () => ({
  apiConfiguration: {
    ANTHROPIC_API_KEY: "test-only-key",
    ANTHROPIC_DEFAULT_MODEL: "claude-opus-5-5",
    AI_PROMPT_CACHE_ENABLED: false,
  },
}));

type ReplyBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

interface SentRequest {
  max_tokens: number;
  system: Array<{ type: "text"; text: string }>;
  tool_choice?: unknown;
}

/** A Claude client that answers `content`, recording every request it gets. */
function build(content: ReplyBlock[], stopReason: string) {
  const sent: SentRequest[] = [];
  const client = {
    messages: {
      stream: (params: SentRequest) => {
        sent.push(params);
        return {
          // The events the SDK streams for those blocks, then the message.
          async *[Symbol.asyncIterator]() {
            for (const block of content) {
              yield block.type === "text"
                ? {
                    type: "content_block_delta",
                    delta: { type: "text_delta", text: block.text },
                  }
                : { type: "content_block_start", content_block: block };
            }
          },
          finalMessage: async () => ({
            content,
            stop_reason: stopReason,
            usage: { input_tokens: 900, output_tokens: 400 },
          }),
        };
      },
    },
  };
  const provider = new AnthropicProvider();
  Object.assign(provider, { clientInstance: client });
  return { provider, sent };
}

async function collect(
  provider: AnthropicProvider,
  request: AiStreamRequest,
): Promise<AiStreamEvent[]> {
  const events: AiStreamEvent[] = [];
  for await (const event of provider.stream(request)) events.push(event);
  return events;
}

const VERDICT: ReplyBlock = {
  type: "tool_use",
  id: "toolu_1",
  name: "submit_demo_request_review",
  input: { decision: "approve", summary: "Real business.", issues: [] },
};

const REQUIRED: AiStreamRequest = {
  system: "You review demo requests for Ringee.",
  messages: [{ role: "user", content: "The request." }],
  tools: [
    {
      name: "submit_demo_request_review",
      description: "Record the verdict on this demo request.",
      parameters: {
        type: "object",
        properties: { decision: { type: "string" } },
        required: ["decision"],
      },
    },
  ],
  toolChoice: "required",
  maxOutputTokens: 1500,
};

describe("AnthropicProvider.stream with a required tool call", () => {
  it("asks for the call in the prompt instead of forcing a tool_choice", async () => {
    const { provider, sent } = build([VERDICT], "tool_use");

    await collect(provider, REQUIRED);

    // `any` / `tool` are a 400 on Opus 5.5, Sonnet 5.5 and Fable 5.1+.
    expect(sent[0].tool_choice).toEqual({ type: "auto" });
    expect(sent[0].system[0].text).toBe(
      "You review demo requests for Ringee.\n\n" +
        "Reply only with a call to the submit_demo_request_review tool, and nothing else.",
    );
  });

  it("gives the thinking room on top of the answer's own budget", async () => {
    const { provider, sent } = build([VERDICT], "tool_use");

    await collect(provider, REQUIRED);

    expect(sent[0].max_tokens).toBe(1500 + 16_000);
  });

  it("never lifts a budget past what every model accepts", async () => {
    const { provider, sent } = build([VERDICT], "tool_use");

    await collect(provider, { ...REQUIRED, maxOutputTokens: 60_000 });
    await collect(provider, { ...REQUIRED, maxOutputTokens: 120_000 });

    // Haiku 4.5 stops at 64K; a budget asked above that is left as asked.
    expect(sent.map((request) => request.max_tokens)).toEqual([
      64_000, 120_000,
    ]);
  });

  it("passes the call on with its arguments", async () => {
    const { provider } = build([VERDICT], "tool_use");

    const events = await collect(provider, REQUIRED);

    expect(events).toContainEqual({
      type: "tool_call_completed",
      id: "toolu_1",
      name: "submit_demo_request_review",
      arguments: { decision: "approve", summary: "Real business.", issues: [] },
    });
    expect(events.some((event) => event.type === "error")).toBe(false);
  });

  it("reports a plain-text answer as an error, never as an empty call", async () => {
    const { provider } = build(
      [{ type: "text", text: "This looks like a real business." }],
      "end_turn",
    );

    const events = await collect(provider, REQUIRED);

    expect(events).toContainEqual({
      type: "error",
      error:
        "claude-opus-5-5 answered without calling the required tool (stop reason: end_turn)",
    });
    expect(events.some((event) => event.type === "tool_call_completed")).toBe(
      false,
    );
  });

  it("reports a reply that ran out before the call, with why", async () => {
    const { provider } = build([], "max_tokens");

    const events = await collect(provider, REQUIRED);

    expect(events[0]).toEqual({
      type: "error",
      error:
        "claude-opus-5-5 answered without calling the required tool (stop reason: max_tokens)",
    });
  });
});

describe("AnthropicProvider.stream with tool_choice auto", () => {
  it("is left as it was: no instruction, no extra room, text is an answer", async () => {
    const { provider, sent } = build(
      [{ type: "text", text: "Hello." }],
      "end_turn",
    );

    const events = await collect(provider, { ...REQUIRED, toolChoice: "auto" });

    expect(sent[0].tool_choice).toEqual({ type: "auto" });
    expect(sent[0].system[0].text).toBe("You review demo requests for Ringee.");
    expect(sent[0].max_tokens).toBe(1500);
    expect(events).toContainEqual({ type: "text_delta", delta: "Hello." });
    expect(events.some((event) => event.type === "error")).toBe(false);
  });
});
