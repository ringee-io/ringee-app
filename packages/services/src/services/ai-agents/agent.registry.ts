import { Injectable } from "@nestjs/common";
import type { AiAgentType } from "@ringee/database";
import type { AgentTool } from "./tool.types";
import type { AiToolDefinition } from "@ringee/platform";
import { ProspectingExpertAgent } from "./agents/prospecting-expert.agent";

export interface AgentDescriptor {
  id: AiAgentType;
  label: string;
  description: string;
  active: boolean;
  comingSoon?: boolean;
}

export interface RunnableAgent {
  id: AiAgentType;
  label: string;
  systemPrompt(): string;
  tools(): AgentTool[];
  toolSchemas(): AiToolDefinition[];
}

/**
 * Lists every agent surfaced in the UI. Only `prospecting_expert` is wired
 * to a runnable implementation for the MVP — the others are returned with
 * `comingSoon: true` so the selector UI can show them as disabled.
 */
@Injectable()
export class AgentRegistry {
  private readonly runnables = new Map<AiAgentType, RunnableAgent>();

  constructor(private readonly prospectingExpert: ProspectingExpertAgent) {
    this.runnables.set("prospecting_expert", prospectingExpert);
  }

  listDescriptors(): AgentDescriptor[] {
    return [
      {
        id: "prospecting_expert",
        label: this.prospectingExpert.label,
        description: this.prospectingExpert.description,
        active: true,
      },
      {
        id: "campaign_builder",
        label: "Campaign Builder",
        description:
          "Builds outbound calling campaigns from your saved lists and scripts.",
        active: false,
        comingSoon: true,
      },
      {
        id: "crm",
        label: "CRM Agent",
        description:
          "Keeps your CRM in sync with calls, contacts, and meetings.",
        active: false,
        comingSoon: true,
      },
      {
        id: "call_coach",
        label: "Call Coach",
        description:
          "Reviews your call recordings and transcripts and gives feedback.",
        active: false,
        comingSoon: true,
      },
      {
        id: "analytics",
        label: "Analytics Agent",
        description:
          "Explains what's driving your numbers and what to do next.",
        active: false,
        comingSoon: true,
      },
    ];
  }

  getRunnable(id: AiAgentType): RunnableAgent {
    const runnable = this.runnables.get(id);
    if (!runnable) {
      throw new Error(
        `Agent "${id}" is not active yet. Only prospecting_expert is available in the current MVP.`,
      );
    }
    return runnable;
  }

  isActive(id: AiAgentType): boolean {
    return this.runnables.has(id);
  }
}
