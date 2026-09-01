import { Controller, Get, Req } from "@nestjs/common";
import type { Request } from "express";
import { resolveVoiceAgentBetaAccess } from "../guards/voice-agent-beta.guard";

/**
 * Tells the caller whether they are in the AI Voice Agents closed beta.
 *
 * Deliberately ungated: every authenticated user may ask, and someone outside
 * the beta simply gets `false`. It exists so the dashboard never keeps its own
 * copy of the allowlist — the sidebar entry, the route gate and
 * `VoiceAgentBetaGuard` all read the same source.
 *
 * It sits on its own path rather than inside `AiVoiceAgentController` because
 * that controller is guarded as a whole, and `/ai-voice-agents/:id` would
 * swallow an `access` segment anyway.
 *
 * This is only the UX gate. `VoiceAgentBetaGuard` is the real boundary.
 */
@Controller("ai-voice-agents-access")
export class AiVoiceAgentAccessController {
  @Get()
  async getAccess(
    @Req() req: Request & { clerkUserId?: string },
  ): Promise<{ hasAccess: boolean }> {
    const clerkUserId = req.clerkUserId;
    if (!clerkUserId) return { hasAccess: false };
    return { hasAccess: await resolveVoiceAgentBetaAccess(clerkUserId) };
  }
}
