import { Controller, Get, Req } from "@nestjs/common";
import type { Request } from "express";
import { hasVoiceAgentAccess } from "@ringee/services";

/**
 * Tells the caller whether the active workspace may use AI Voice Agents.
 *
 * Deliberately ungated beyond normal authentication: a personal workspace gets
 * `false`, allowing the dashboard layout to redirect without first calling a
 * protected module endpoint.
 *
 * It sits on its own path rather than inside `AiVoiceAgentController` because
 * that controller is guarded as a whole, and `/ai-voice-agents/:id` would
 * swallow an `access` segment anyway.
 *
 * This is only the UX gate. `VoiceAgentOrganizationGuard` and the service-layer
 * access rule are the real boundaries.
 */
@Controller("ai-voice-agents-access")
export class AiVoiceAgentAccessController {
  @Get()
  getAccess(@Req() req: Request & { clerkOrgId?: string }): {
    hasAccess: boolean;
  } {
    return {
      hasAccess: hasVoiceAgentAccess({
        organizationId: req.clerkOrgId ?? null,
      }),
    };
  }
}
