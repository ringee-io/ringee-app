/**
 * Provider-agnostic types for Ringee AI.
 *
 * The agent system never sees OpenAI-specific shapes — every provider
 * adapter translates these into its own SDK calls. To add a new provider,
 * implement `AiProvider` and register it.
 */

export type AiRole = "system" | "user" | "assistant" | "tool";

export interface AiTextMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiToolResultMessage {
  role: "tool";
  toolCallId: string;
  toolName: string;
  /** JSON-serializable result returned to the model. */
  content: unknown;
}

export interface AiAssistantToolCallMessage {
  role: "assistant";
  /** Optional accompanying text the assistant emitted alongside the tool call(s). */
  content?: string | null;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
}

export type AiMessageInput =
  | AiTextMessage
  | AiAssistantToolCallMessage
  | AiToolResultMessage;

/**
 * A single tool exposed to the model. Arguments must be a JSON Schema
 * compatible with the underlying provider; the adapter is responsible
 * for any provider-specific reshaping.
 */
export interface AiToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AiCacheHint {
  /**
   * Stable key used to mark prefix segments (system prompt, tool schemas,
   * stable product context) as cacheable. Providers that support prompt
   * caching attach this hint; others ignore it.
   */
  prefixKey?: string;
  /** Mark the trailing system/user content above this index as cacheable. */
  cachePrefixThrough?: number;
}

export interface AiStreamRequest {
  system: string;
  messages: AiMessageInput[];
  tools?: AiToolDefinition[];
  toolChoice?: "auto" | "required" | "none";
  temperature?: number;
  maxOutputTokens?: number;
  cache?: AiCacheHint;
  /** Abort signal so the orchestrator can cancel a stream mid-flight. */
  signal?: AbortSignal;
}

export type AiStreamEvent =
  | { type: "text_delta"; delta: string }
  | { type: "tool_call_started"; id: string; name: string }
  | {
      type: "tool_call_arguments_delta";
      id: string;
      name: string;
      argumentsDelta: string;
    }
  | {
      type: "tool_call_completed";
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }
  | {
      type: "completed";
      finishReason: "stop" | "tool_calls" | "length" | "error" | "cancelled";
      usage?: AiUsage;
    }
  | { type: "error"; error: string };

export interface AiUsage {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  model?: string;
}

export interface AiSummarizeRequest {
  system: string;
  messages: AiMessageInput[];
  signal?: AbortSignal;
}

export interface AiSummarizeResponse {
  summary: string;
  usage?: AiUsage;
}

export interface AiProvider {
  /** Stable identifier used in config (`openai`, `anthropic`, ...). */
  readonly name: string;

  /** Streamed chat with optional tool calling. */
  stream(req: AiStreamRequest): AsyncIterable<AiStreamEvent>;

  /** One-shot text generation used for conversation summarization. */
  summarize(req: AiSummarizeRequest): Promise<AiSummarizeResponse>;
}
