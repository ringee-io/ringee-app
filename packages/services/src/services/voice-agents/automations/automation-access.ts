import { ForbiddenException } from "@nestjs/common";
import type { WorkspaceAdmission } from "@ringee/database";
import type { OwnershipContext } from "@ringee/platform";
import {
  assertVoiceAgentAccess,
  voiceAgentAccess,
  voiceAgentAutomationAdmission,
  type VoiceAgentScope,
} from "../voice-agent-access";

/**
 * Whether a workspace is admitted to automated work — the pilot gate of
 * AGENT-018 (`AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS` for organizations,
 * `AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS` for personal workspaces), decided by
 * `voiceAgentAccess`.
 *
 * Pass the scope a row was persisted with — its `userId` and `organizationId`
 * — never the owner's currently active workspace: deferred work keeps the
 * workspace it was created in.
 */
export function voiceAgentAutomationsEnabled(
  scope: VoiceAgentScope | null | undefined,
): boolean {
  if (!scope) return false;
  return voiceAgentAccess(scope).automations;
}

/**
 * Queue filtering uses the same admission, inside the claim query, so an
 * excluded workspace never starves an admitted one.
 */
export function automationAdmissionFilter(): WorkspaceAdmission {
  return voiceAgentAutomationAdmission();
}

/**
 * The service-side gate every automation entry point runs first. The workers
 * apply the same rule per row, so taking a workspace off the pilot stops its
 * new automated calls and emails, not only its screens.
 */
export function assertVoiceAgentAutomations(ctx: OwnershipContext): void {
  assertVoiceAgentAccess(ctx);
  if (!voiceAgentAutomationsEnabled(ctx)) {
    throw new ForbiddenException(
      ctx.organizationId
        ? "AI voice agent automations are not enabled for this organization yet."
        : "AI voice agent automations are not enabled for this personal workspace yet.",
    );
  }
}
