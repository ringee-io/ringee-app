import { Injectable } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import { apiConfiguration } from "@ringee/configuration";
import type {
  AiMessageInput,
  AiProvider,
  AiStreamEvent,
  AiStreamRequest,
  AiSummarizeRequest,
  AiSummarizeResponse,
  AiToolDefinition,
  AiUsage,
} from "../types";

type FinishReason = "stop" | "tool_calls" | "length" | "error" | "cancelled";

/**
 * Room for the thinking a required call does before it answers. A forced
 * `tool_choice` never let the model think, so callers sized `maxOutputTokens`
 * for the answer alone. Asked for in the prompt instead (see `mapToolChoice`),
 * the call comes after the thinking the newer models do by default — and
 * thinking counts toward `max_tokens`, so without this room the reply runs out
 * before the call.
 */
const REQUIRED_CALL_THINKING_TOKENS = 16_000;

/**
 * The room never lifts `max_tokens` past this — Haiku 4.5's output limit, the
 * lowest among the current Claude models — so a budget the model accepted on
 * its own is still accepted with the room.
 */
const THINKING_ROOM_CEILING_TOKENS = 64_000;

/**
 * Claude (Anthropic) adapter for Ringee AI. Mirrors the OpenAI adapter:
 * streamed chat with tool calling plus one-shot summarization. Prompt
 * caching is applied to the system prompt, tool list, and trailing message
 * when AI_PROMPT_CACHE_ENABLED is on.
 */
@Injectable()
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  private clientInstance: Anthropic | null = null;

  /**
   * Lazily constructed so the app still boots when AI_PROVIDER is not
   * "anthropic" and no ANTHROPIC_API_KEY is configured — the client is only
   * built the first time this provider is actually invoked.
   */
  private get client(): Anthropic {
    if (!this.clientInstance) {
      this.clientInstance = new Anthropic({
        apiKey: apiConfiguration.ANTHROPIC_API_KEY,
      });
    }
    return this.clientInstance;
  }

  async *stream(req: AiStreamRequest): AsyncIterable<AiStreamEvent> {
    const model = apiConfiguration.ANTHROPIC_DEFAULT_MODEL;
    const cache = apiConfiguration.AI_PROMPT_CACHE_ENABLED;

    const required = req.toolChoice === "required" && !!req.tools?.length;
    const system = buildSystem(
      required
        ? `${req.system}\n\n${requiredToolInstruction(req.tools!)}`
        : req.system,
      cache,
    );
    const messages = toAnthropicMessages(req.messages, cache);
    const tools = req.tools?.length
      ? req.tools.map((t, i) =>
          toAnthropicTool(t, cache && i === req.tools!.length - 1),
        )
      : undefined;
    const toolChoice = mapToolChoice(req.toolChoice);
    const answerTokens = req.maxOutputTokens ?? 8192;

    let stream: ReturnType<Anthropic["messages"]["stream"]>;
    try {
      stream = this.client.messages.stream(
        {
          model,
          max_tokens: required ? withThinkingRoom(answerTokens) : answerTokens,
          system,
          messages,
          ...(tools ? { tools, tool_choice: toolChoice } : {}),
        },
        { signal: req.signal },
      );
    } catch (err) {
      yield { type: "error", error: errorMessage(err) };
      yield { type: "completed", finishReason: "error" };
      return;
    }

    const startedToolCalls = new Set<string>();
    try {
      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta" && event.delta.text) {
            yield { type: "text_delta", delta: event.delta.text };
          }
        } else if (event.type === "content_block_start") {
          const block = event.content_block;
          if (block.type === "tool_use") {
            startedToolCalls.add(block.id);
            yield {
              type: "tool_call_started",
              id: block.id,
              name: block.name,
            };
          }
        }
      }

      const final = await stream.finalMessage();

      // Without a forced choice the model can still answer in plain text;
      // for a required call that is a failure, never an empty answer.
      const calledTool = final.content.some(
        (block: { type: string }) => block.type === "tool_use",
      );
      if (required && !calledTool) {
        yield {
          type: "error",
          error: `${model} answered without calling the required tool (stop reason: ${final.stop_reason ?? "none"})`,
        };
        yield {
          type: "completed",
          finishReason: "error",
          usage: mapUsage(final.usage, model),
        };
        return;
      }

      for (const block of final.content) {
        if (block.type === "tool_use") {
          if (!startedToolCalls.has(block.id)) {
            yield { type: "tool_call_started", id: block.id, name: block.name };
          }
          yield {
            type: "tool_call_completed",
            id: block.id,
            name: block.name,
            arguments:
              block.input && typeof block.input === "object"
                ? (block.input as Record<string, unknown>)
                : {},
          };
        }
      }

      yield {
        type: "completed",
        finishReason: mapStopReason(final.stop_reason),
        usage: mapUsage(final.usage, model),
      };
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") {
        yield { type: "completed", finishReason: "cancelled" };
        return;
      }
      yield { type: "error", error: errorMessage(err) };
      yield { type: "completed", finishReason: "error" };
    }
  }

  async summarize(req: AiSummarizeRequest): Promise<AiSummarizeResponse> {
    const model = apiConfiguration.ANTHROPIC_SUMMARY_MODEL;
    const res = await this.client.messages.create(
      {
        model,
        max_tokens: 1024,
        system: req.system,
        messages: toAnthropicMessages(req.messages, false),
      },
      { signal: req.signal },
    );
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return { summary: text, usage: mapUsage(res.usage, model) };
  }
}

function buildSystem(
  system: string,
  cache: boolean,
): Anthropic.TextBlockParam[] {
  return [
    {
      type: "text",
      text: system,
      ...(cache ? { cache_control: { type: "ephemeral" } } : {}),
    },
  ];
}

/**
 * "required" is never sent as a forced choice (`any` / `tool`): the newest
 * Claude models — Opus 5.5, Sonnet 5.5, Fable and Mythos 5.1 and later —
 * reject it with a 400 ("tool_choice: type "tool" and "any" are not supported
 * for this model"). `stream` asks for the call in the system prompt instead,
 * and reports a reply without one as an error.
 */
function mapToolChoice(
  choice: AiStreamRequest["toolChoice"],
): Anthropic.ToolChoice {
  if (choice === "none") return { type: "none" };
  return { type: "auto" };
}

/** The answer's budget plus the thinking's, within what every model accepts. */
function withThinkingRoom(answerTokens: number): number {
  return Math.max(
    answerTokens,
    Math.min(
      answerTokens + REQUIRED_CALL_THINKING_TOKENS,
      THINKING_ROOM_CEILING_TOKENS,
    ),
  );
}

/** What stands in for a forced `tool_choice` (see `mapToolChoice`). */
function requiredToolInstruction(tools: AiToolDefinition[]): string {
  return tools.length === 1
    ? `Reply only with a call to the ${tools[0].name} tool, and nothing else.`
    : "Reply only with calls to the tools provided, and nothing else.";
}

function toAnthropicTool(t: AiToolDefinition, cache: boolean): Anthropic.Tool {
  return {
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Tool.InputSchema,
    ...(cache ? { cache_control: { type: "ephemeral" } } : {}),
  };
}

/**
 * Convert provider-agnostic messages into Anthropic message params.
 * Tool results become `tool_result` blocks inside a user turn; assistant
 * tool calls become `tool_use` blocks. Consecutive same-role messages are
 * merged so the alternation the API expects always holds.
 */
function toAnthropicMessages(
  messages: AiMessageInput[],
  cache: boolean,
): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];

  for (const m of messages) {
    const role: "user" | "assistant" =
      m.role === "assistant" ? "assistant" : "user";
    const blocks = toContentBlocks(m);
    if (blocks.length === 0) continue;

    const last = out[out.length - 1];
    if (last && last.role === role && Array.isArray(last.content)) {
      last.content.push(...blocks);
    } else {
      out.push({ role, content: blocks });
    }
  }

  if (cache && out.length > 0) {
    const lastMsg = out[out.length - 1];
    if (Array.isArray(lastMsg.content) && lastMsg.content.length > 0) {
      const lastBlock = lastMsg.content[lastMsg.content.length - 1];
      (lastBlock as { cache_control?: unknown }).cache_control = {
        type: "ephemeral",
      };
    }
  }

  return out;
}

function toContentBlocks(m: AiMessageInput): Anthropic.ContentBlockParam[] {
  if (m.role === "tool") {
    return [
      {
        type: "tool_result",
        tool_use_id: m.toolCallId,
        content:
          typeof m.content === "string"
            ? m.content
            : JSON.stringify(m.content ?? null),
      },
    ];
  }

  if (m.role === "assistant" && "toolCalls" in m && m.toolCalls?.length) {
    const blocks: Anthropic.ContentBlockParam[] = [];
    if (m.content && m.content.trim().length > 0) {
      blocks.push({ type: "text", text: m.content });
    }
    for (const tc of m.toolCalls) {
      blocks.push({
        type: "tool_use",
        id: tc.id,
        name: tc.name,
        input: tc.arguments ?? {},
      });
    }
    return blocks;
  }

  const text = (m as { content: string }).content ?? "";
  if (!text.trim()) return [];
  return [{ type: "text", text }];
}

function mapStopReason(reason: string | null): FinishReason {
  if (reason === "tool_use") return "tool_calls";
  if (reason === "max_tokens") return "length";
  return "stop";
}

function mapUsage(
  usage:
    | {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number | null;
        cache_creation_input_tokens?: number | null;
      }
    | undefined,
  model: string,
): AiUsage {
  if (!usage) return { model };
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cachedInputTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    model,
  };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
