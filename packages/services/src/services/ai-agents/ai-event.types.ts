/**
 * Stream events the chat orchestrator emits over SSE to the frontend.
 * These are the *UI-facing* events — distinct from the lower-level
 * AiStreamEvent the provider adapter produces.
 */

export type AiChatStreamEvent =
  | {
      type: "message_started";
      messageId: string;
      role: "assistant";
      createdAt: string;
    }
  | {
      type: "text_delta";
      messageId: string;
      delta: string;
    }
  | {
      type: "message_completed";
      messageId: string;
      content: string;
    }
  | {
      type: "tool_started";
      toolCallId: string;
      toolName: string;
    }
  | {
      type: "tool_completed";
      toolCallId: string;
      toolName: string;
      ok: boolean;
      summary?: string;
    }
  | {
      type: "tool_event";
      toolEventId: string;
      kind: string;
      payload: Record<string, unknown>;
    }
  | {
      type: "confirmation_request";
      confirmationId: string;
      action: "reveal" | "save" | "list_create";
      summary: string;
      payload: Record<string, unknown>;
      estimatedCreditCost?: number | null;
    }
  | {
      type: "confirmation_resolved";
      confirmationId: string;
      accepted: boolean;
      result?: Record<string, unknown>;
    }
  | {
      type: "usage";
      messageId: string;
      model: string | null;
      inputTokens: number;
      outputTokens: number;
      cachedTokens: number;
      cacheWriteTokens: number;
      /** Credits charged for this turn (USD-equivalent, margin applied). */
      costCredits: number;
      /** Running AI cost total for the whole conversation. */
      conversationTotalCost: number;
    }
  | {
      type: "error";
      message: string;
      /** Set to "insufficient_credit" when the run was blocked/stopped for credit. */
      code?: string;
    }
  | {
      type: "completed";
      finishReason: string;
    };
