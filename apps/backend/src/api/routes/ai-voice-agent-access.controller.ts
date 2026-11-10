import { Controller, Get } from "@nestjs/common";
import {
  createOwnershipContext,
  CurrentUser,
  type CurrentUserData,
} from "@ringee/platform";
import {
  voiceAgentAccess,
  type VoiceAgentWorkspaceType,
} from "@ringee/services";

/**
 * Tells the caller whether the active workspace may use AI Voice Agents.
 *
 * Deliberately ungated beyond normal authentication: a workspace without
 * access gets `false`, allowing the dashboard layout to redirect without first
 * calling a protected module endpoint. The answer comes from the same access
 * policy every surface and worker reads, for the authenticated ownership
 * context — the active organization, or the caller's own personal workspace —
 * never from an id the client sends.
 *
 * It sits on its own path rather than inside `AiVoiceAgentController` because
 * that controller is guarded as a whole, and `/ai-voice-agents/:id` would
 * swallow an `access` segment anyway.
 *
 * This is only the UX gate. `VoiceAgentAccessGuard` and the service-layer
 * access rule are the real boundaries.
 */
@Controller("ai-voice-agents-access")
export class AiVoiceAgentAccessController {
  @Get()
  getAccess(@CurrentUser() user: CurrentUserData): {
    hasAccess: boolean;
    /** Whether the "Ringee IA Voice Agents" rail is on (AGENT-018). Additive. */
    automations: boolean;
    /** Which kind of workspace answered. Additive. */
    workspaceType: VoiceAgentWorkspaceType;
  } {
    const access = voiceAgentAccess(createOwnershipContext(user));
    return {
      hasAccess: access.module,
      automations: access.automations,
      workspaceType: access.workspaceType,
    };
  }
}
