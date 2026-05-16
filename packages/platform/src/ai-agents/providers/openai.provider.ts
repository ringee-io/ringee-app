import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
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

type ChatMessage =
  OpenAI.Chat.Completions.ChatCompletionMessageParam;

@Injectable()
export class OpenAiProvider implements AiProvider {
  readonly name = "openai";
  private readonly logger = new Logger(OpenAiProvider.name);
  private readonly client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: apiConfiguration.OPENAI_API_KEY });
  }

  async *stream(req: AiStreamRequest): AsyncIterable<AiStreamEvent> {
    const model = apiConfiguration.OPENAI_DEFAULT_MODEL;

    const messages: ChatMessage[] = [
      { role: "system", content: req.system },
      ...req.messages.map(toOpenAiMessage),
    ];

    const tools = req.tools?.map(toOpenAiTool);
    const toolChoice =
      req.toolChoice === "required"
        ? "required"
        : req.toolChoice === "none"
          ? "none"
          : "auto";

    let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
    try {
      stream = await this.client.chat.completions.create(
        {
          model,
          // temperature: req.temperature ?? apiConfiguration.AI_TEMPERATURE,
          max_tokens: req.maxOutputTokens,
          messages,
          stream: true,
          stream_options: { include_usage: true },
          ...(tools && tools.length > 0
            ? { tools, tool_choice: toolChoice }
            : {}),
        },
        { signal: req.signal },
      );
    } catch (err) {
      yield { type: "error", error: errorMessage(err) };
      yield { type: "completed", finishReason: "error" };
      return;
    }

    // Track in-flight tool calls (OpenAI streams arguments as deltas).
    const toolCalls = new Map<
      number,
      { id: string; name: string; argsBuffer: string }
    >();

    let finishReason: AiStreamEvent extends { type: "completed" }
      ? "stop" | "tool_calls" | "length" | "error" | "cancelled"
      : never = "stop" as never;
    let usage:
      | OpenAI.Completions.CompletionUsage
      | undefined;

    try {
      for await (const chunk of stream) {
        const choice = chunk.choices?.[0];
        const delta = choice?.delta;

        if (delta?.content) {
          yield { type: "text_delta", delta: delta.content };
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const existing = toolCalls.get(idx);
            if (!existing) {
              const created = {
                id: tc.id ?? `call_${idx}_${Date.now()}`,
                name: tc.function?.name ?? "",
                argsBuffer: tc.function?.arguments ?? "",
              };
              toolCalls.set(idx, created);
              if (created.name) {
                yield {
                  type: "tool_call_started",
                  id: created.id,
                  name: created.name,
                };
              }
              if (created.argsBuffer) {
                yield {
                  type: "tool_call_arguments_delta",
                  id: created.id,
                  name: created.name,
                  argumentsDelta: created.argsBuffer,
                };
              }
            } else {
              if (tc.function?.name && !existing.name) {
                existing.name = tc.function.name;
                yield {
                  type: "tool_call_started",
                  id: existing.id,
                  name: existing.name,
                };
              }
              if (tc.function?.arguments) {
                existing.argsBuffer += tc.function.arguments;
                yield {
                  type: "tool_call_arguments_delta",
                  id: existing.id,
                  name: existing.name,
                  argumentsDelta: tc.function.arguments,
                };
              }
            }
          }
        }

        if (choice?.finish_reason) {
          finishReason =
            choice.finish_reason === "tool_calls"
              ? ("tool_calls" as never)
              : choice.finish_reason === "length"
                ? ("length" as never)
                : ("stop" as never);
        }
        if (chunk.usage) usage = chunk.usage;
      }

      for (const tc of toolCalls.values()) {
        if (!tc.name) continue;
        let args: Record<string, unknown> = {};
        try {
          args = tc.argsBuffer ? JSON.parse(tc.argsBuffer) : {};
        } catch (err) {
          this.logger.warn(
            `Failed to parse tool args for ${tc.name}: ${tc.argsBuffer}`,
          );
        }
        yield {
          type: "tool_call_completed",
          id: tc.id,
          name: tc.name,
          arguments: args,
        };
      }

      yield {
        type: "completed",
        finishReason,
        usage: usage ? toAiUsage(usage, model) : { model },
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
    const model = apiConfiguration.OPENAI_SUMMARY_MODEL;
    const res = await this.client.chat.completions.create(
      {
        model,
        // temperature: 0.2,
        messages: [
          { role: "system", content: req.system },
          ...req.messages.map(toOpenAiMessage),
        ],
      },
      { signal: req.signal },
    );
    const text = res.choices?.[0]?.message?.content ?? "";
    return {
      summary: text,
      usage: res.usage ? toAiUsage(res.usage, model) : { model },
    };
  }
}

function toOpenAiMessage(m: AiMessageInput): ChatMessage {
  if (m.role === "tool") {
    return {
      role: "tool",
      tool_call_id: m.toolCallId,
      content:
        typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    };
  }
  if (m.role === "assistant" && "toolCalls" in m && m.toolCalls?.length) {
    return {
      role: "assistant",
      content: m.content ?? "",
      tool_calls: m.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    };
  }
  return {
    role: m.role as "system" | "user" | "assistant",
    content: (m as { content: string }).content,
  };
}

function toOpenAiTool(t: AiToolDefinition): OpenAI.Chat.Completions.ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters as Record<string, unknown>,
    },
  };
}

/**
 * Normalize OpenAI usage to the provider-agnostic shape. OpenAI's
 * `prompt_tokens` is the *total* input including cached tokens; the cost
 * layer needs fresh vs cached split out. OpenAI does not bill cache writes
 * separately, so `cacheWriteTokens` is always 0.
 */
function toAiUsage(
  usage: OpenAI.Completions.CompletionUsage,
  model: string,
): AiUsage {
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const prompt = usage.prompt_tokens ?? 0;
  return {
    inputTokens: Math.max(0, prompt - cached),
    outputTokens: usage.completion_tokens ?? 0,
    cachedInputTokens: cached,
    cacheWriteTokens: 0,
    model,
  };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
