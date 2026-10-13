import { ForbiddenException } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import type {
  OrganizationOwnershipContext,
  OwnershipContext,
} from "@ringee/platform";
import { assertVoiceAgentAccess } from "../voice-agent-access";

/**
 * Whether the "Ringee IA Voice Agents" rail and its automations are on for an
 * organization — the pilot flag of AGENT-018, read from
 * `AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS`. Personal workspaces never are
 * (AGENT-011).
 */
export function voiceAgentAutomationsEnabled(
  organizationId: string | null | undefined,
): boolean {
  if (!organizationId) return false;
  const allowed = apiConfiguration.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS;
  return allowed.includes("*") || allowed.includes(organizationId);
}

/**
 * The service-side gate every automation entry point runs first. The worker
 * applies the same rule per row, so taking an organization off the flag stops
 * its automated calls and emails, not only its screens.
 */
export function assertVoiceAgentAutomations(
  ctx: OwnershipContext,
): asserts ctx is OrganizationOwnershipContext {
  assertVoiceAgentAccess(ctx);
  if (!voiceAgentAutomationsEnabled(ctx.organizationId)) {
    throw new ForbiddenException(
      "AI voice agent automations are not enabled for this organization yet.",
    );
  }
}
