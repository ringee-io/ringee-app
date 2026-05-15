import type { AiAgentType, AiConversation } from "@ringee/database";
import type { OwnershipContext } from "@ringee/platform";

/**
 * Runtime context handed to every internal tool. Tools must never
 * trust arguments to identify the user/org — that comes from here.
 */
export interface AgentToolContext {
  ctx: OwnershipContext;
  conversation: AiConversation;
  agent: AiAgentType;
  /** Emit a structured event back to the chat orchestrator (and via SSE to the UI). */
  emit(event: AgentToolEvent): Promise<void> | void;
}

export type AgentToolEvent =
  | {
      kind: "tool_progress";
      toolName: string;
      message: string;
    }
  | {
      kind: "prospect_results";
      jobId: string;
      provider: string;
      results: ProspectPreview[];
      filtersSummary: string;
    }
  | {
      kind: "confirmation_request";
      requestId: string;
      action: "reveal" | "save" | "list_create";
      payload: Record<string, unknown>;
      summary: string;
      estimatedCreditCost?: number | null;
    }
  | {
      kind: "prospects_saved";
      contactIds: string[];
      duplicates: number;
      errors: number;
    }
  | {
      kind: "list_created";
      tagId: string;
      tagName: string;
      contactCount: number;
    };

export interface ProspectPreview {
  externalId: string;
  jobId: string;
  provider: string;
  fullName: string | null;
  jobTitle: string | null;
  company: string | null;
  location: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
  fitScore: number;
  confidence: number | null;
  reasons: string[];
  suggestedCallAngle?: string | null;
}

/**
 * An internal tool the LLM can call. Tools do not know which provider is
 * underneath — they ask the supporting services. Tools are JSON-in/JSON-out.
 */
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: any, runtime: AgentToolContext): Promise<unknown>;
}
