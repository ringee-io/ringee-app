import { Injectable } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  AiConversation,
  AiMessage,
  AiMessageRepository,
} from "@ringee/database";
import type { AiMessageInput } from "@ringee/platform";

export interface BuiltContext {
  /** System prompt to feed the provider (already includes summary + state hints). */
  system: string;
  /** Chronological messages to send to the model. */
  messages: AiMessageInput[];
  /** Estimated token count for the constructed context. */
  estimatedTokens: number;
}

/**
 * Builds the prompt context the AI provider receives for a turn. The
 * strategy:
 *   1. Take the most recent `AI_MAX_CONTEXT_MESSAGES` messages from history.
 *   2. Prepend a compact "long-term summary" line if the conversation has
 *      been summarized.
 *   3. Append structured agent state (provider selection, last search,
 *      buyer signals, pending confirmations) into the system prompt so the
 *      model doesn't re-fetch context every turn.
 *
 * Provider-specific caching (e.g. OpenAI prompt caching) is the provider
 * adapter's responsibility — this builder just produces a stable prefix
 * so adapters can mark it as cacheable when they support it.
 */
@Injectable()
export class AiContextBuilder {
  constructor(private readonly messages: AiMessageRepository) {}

  async build(
    conversation: AiConversation,
    baseSystemPrompt: string,
    extraSystem?: string,
  ): Promise<BuiltContext> {
    const recentLimit = apiConfiguration.AI_MAX_CONTEXT_MESSAGES;
    const recent = await this.messages.recent(conversation.id, recentLimit);

    const systemParts: string[] = [baseSystemPrompt.trim()];

    if (conversation.summary) {
      systemParts.push(
        `LONG-TERM SUMMARY (prior conversation, summarized): ${conversation.summary.trim()}`,
      );
    }

    const stateSummary = summarizeAgentState(conversation);
    if (stateSummary) {
      systemParts.push(`CONVERSATION STATE: ${stateSummary}`);
    }

    if (extraSystem) {
      systemParts.push(extraSystem);
    }

    const system = systemParts.join("\n\n");
    const sanitized = sanitizeWindow(recent.filter((m) => m.role !== "system"));
    const messages = sanitized.map((m) => toAiInputMessage(m));

    const estimatedTokens = estimateTokens(system, messages);

    return { system, messages, estimatedTokens };
  }
}

/**
 * Drop tool / assistant-tool-call rows that would form an invalid OpenAI
 * history when the window starts mid-conversation:
 *  - tool messages whose originating assistant tool-call row is not in the
 *    window (OpenAI rejects with "messages with role 'tool' must be a
 *    response to a preceeding message with 'tool_calls'").
 *  - assistant rows that carry a tool_call but whose matching tool response
 *    is missing from the window (OpenAI rejects because the tool_calls have
 *    no follow-up). For these, strip the tool fields but keep any text.
 */
function sanitizeWindow(msgs: AiMessage[]): AiMessage[] {
  const callIdsInWindow = new Set<string>();
  const callIdsWithResponse = new Set<string>();

  for (const m of msgs) {
    if (m.role === "assistant" && m.toolName && m.toolPayload) {
      callIdsInWindow.add(m.id);
    }
    if (m.role === "tool") {
      const ref = readToolCallRef(m);
      callIdsWithResponse.add(ref);
    }
  }

  const out: AiMessage[] = [];
  for (const m of msgs) {
    if (m.role === "tool") {
      const ref = readToolCallRef(m);
      if (!callIdsInWindow.has(ref)) continue; // orphan tool — drop
      out.push(m);
      continue;
    }
    if (m.role === "assistant" && m.toolName && m.toolPayload) {
      if (!callIdsWithResponse.has(m.id)) {
        // The tool result fell out of the window. Keep the row only if it
        // also has user-visible text; otherwise drop entirely.
        if (m.content && m.content.trim().length > 0) {
          out.push({
            ...m,
            toolName: null,
            toolPayload: null,
          });
        }
        continue;
      }
    }
    out.push(m);
  }
  return out;
}

function readToolCallRef(m: AiMessage): string {
  const payload = m.toolPayload as
    | (Record<string, unknown> & { _toolCallMessageId?: string })
    | null;
  return (payload && typeof payload._toolCallMessageId === "string"
    ? payload._toolCallMessageId
    : null) ?? m.id;
}

function summarizeAgentState(conversation: AiConversation): string | null {
  const state = conversation.agentState as Record<string, unknown> | null;
  if (!state) {
    if (conversation.providerSelection) {
      return `Selected provider: ${conversation.providerSelection}`;
    }
    return null;
  }

  const parts: string[] = [];
  if (conversation.providerSelection) {
    parts.push(`provider=${conversation.providerSelection}`);
  }
  const lastSearch = state.lastSearch as
    | {
        jobId: string;
        provider: string;
        totalResults: number;
        at: string;
      }
    | undefined;
  if (lastSearch) {
    parts.push(
      `lastSearch={ jobId:${lastSearch.jobId}, provider:${lastSearch.provider}, total:${lastSearch.totalResults} }`,
    );
  }
  const buyerSignals = state.buyerSignals as
    | {
        titles?: string[];
        industries?: string[];
        countries?: string[];
      }
    | undefined;
  if (buyerSignals) {
    parts.push(
      `buyerSignals={ titles:[${(buyerSignals.titles ?? []).slice(0, 3).join(", ")}], industries:[${(buyerSignals.industries ?? []).slice(0, 3).join(", ")}], countries:[${(buyerSignals.countries ?? []).slice(0, 3).join(", ")}] }`,
    );
  }
  return parts.length ? parts.join(" | ") : null;
}

function toAiInputMessage(m: AiMessage): AiMessageInput {
  if (m.role === "tool" && m.toolName) {
    const payload = m.toolPayload as
      | (Record<string, unknown> & { _toolCallMessageId?: string; result?: unknown })
      | null;
    // The tool_call_id sent to OpenAI MUST match an id present in the
    // preceding assistant message's tool_calls. The orchestrator writes that
    // id into `_toolCallMessageId` when persisting the tool result row.
    const callId =
      (payload && typeof payload._toolCallMessageId === "string"
        ? payload._toolCallMessageId
        : null) ?? m.id;
    const content =
      payload && "result" in payload ? payload.result : payload ?? m.content ?? null;
    return {
      role: "tool",
      toolCallId: callId,
      toolName: m.toolName,
      content,
    };
  }
  if (m.role === "assistant" && m.toolName && m.toolPayload) {
    // An assistant tool-call turn. The row id IS the call id — the matching
    // tool result row references it via `_toolCallMessageId`.
    return {
      role: "assistant",
      content: m.content ?? null,
      toolCalls: [
        {
          id: m.id,
          name: m.toolName,
          arguments: (m.toolPayload as Record<string, unknown>) ?? {},
        },
      ],
    };
  }
  return {
    role: m.role === "system" ? "system" : (m.role as "user" | "assistant"),
    content: m.content ?? "",
  };
}

/** Rough token estimate: ~4 chars per token for English text. */
function estimateTokens(system: string, messages: AiMessageInput[]): number {
  let chars = system.length;
  for (const m of messages) {
    if ("content" in m && typeof m.content === "string") chars += m.content.length;
    if ("content" in m && m.content && typeof m.content !== "string") {
      chars += JSON.stringify(m.content).length;
    }
    if ("toolCalls" in m) {
      chars += JSON.stringify(m.toolCalls).length;
    }
  }
  return Math.ceil(chars / 4);
}
