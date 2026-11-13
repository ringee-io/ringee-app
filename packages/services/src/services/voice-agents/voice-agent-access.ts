import { ForbiddenException } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import type { WorkspaceAdmission } from "@ringee/database";

/**
 * The one access policy of AI Voice Agents (AGENT-011, AGENT-018). REST, MCP,
 * the CLI, the dashboard's access response and every worker read it, so no
 * surface can disagree about a workspace.
 *
 * It answers two questions and nothing else:
 *
 * - **module** — may this workspace use the module and its manual operations
 *   (agents, voices, previews, test sessions, a manual agent call)?
 * - **automations** — may it be admitted to automated work (the rail's setup,
 *   reminder calls, follow-up objectives, handoffs, agent callbacks, receipts)?
 *
 * Whether one resource belongs to the workspace, and whether a call is ready,
 * compliant and funded, are separate checks owned by the services that act.
 *
 * Organizations keep the rule they had: every organization has the module;
 * automations follow `AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS` (`*` for all of
 * them). A personal workspace has neither unless its owner is listed in
 * `AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS` (`*` for every personal
 * workspace). The two lists are separate: the organization list's `*` never
 * admits a personal workspace, and the personal list admits no organization.
 */
export type VoiceAgentWorkspaceType = "organization" | "personal";

/**
 * The authenticated or persisted scope a decision is about. An organization's
 * answer needs no user; a personal workspace without its owner's id is never
 * admitted (fail closed).
 */
export interface VoiceAgentScope {
  userId?: string | null;
  organizationId?: string | null;
}

export interface VoiceAgentAccess {
  workspaceType: VoiceAgentWorkspaceType;
  module: boolean;
  automations: boolean;
}

/** The scope-aware decision; everything else in this file is built on it. */
export function voiceAgentAccess(scope: VoiceAgentScope): VoiceAgentAccess {
  if (scope.organizationId) {
    const allowed = apiConfiguration.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS;
    return {
      workspaceType: "organization",
      module: true,
      automations:
        allowed.includes("*") || allowed.includes(scope.organizationId),
    };
  }
  const enrolled = personalPilotEnrolled(scope.userId);
  return { workspaceType: "personal", module: enrolled, automations: enrolled };
}

/** Whether the workspace may use the AI Voice Agents module. */
export function hasVoiceAgentAccess(scope: VoiceAgentScope): boolean {
  return voiceAgentAccess(scope).module;
}

/**
 * The domain gate every module operation runs first, in the shared service
 * layer, so REST, MCP and CLI consumers cannot disagree. It names no resource:
 * a resource still has to be found inside the workspace.
 */
export function assertVoiceAgentAccess(scope: VoiceAgentScope): void {
  if (!hasVoiceAgentAccess(scope)) {
    throw new ForbiddenException(VOICE_AGENT_ACCESS_DENIED);
  }
}

export const VOICE_AGENT_ACCESS_DENIED =
  "AI Voice Agents are available in organization workspaces, and in personal workspaces enrolled in the pilot";

/**
 * Which workspaces' automated work may be claimed, for queue filters. Applied
 * inside the claim query, so a workspace that is not admitted can never take a
 * claim slot from one that is.
 */
export function voiceAgentAutomationAdmission(): WorkspaceAdmission {
  const allowed = apiConfiguration.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS;
  const personal = apiConfiguration.AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS;
  return {
    organizationIds: allowed.includes("*") ? null : [...allowed],
    personalUserIds: personal.includes("*") ? null : [...personal],
  };
}

function personalPilotEnrolled(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const enrolled = apiConfiguration.AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS;
  return enrolled.includes("*") || enrolled.includes(userId.toLowerCase());
}
