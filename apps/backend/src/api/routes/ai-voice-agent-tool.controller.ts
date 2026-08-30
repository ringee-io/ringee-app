import { Body, Controller, Headers, Param, Post } from "@nestjs/common";
import { Public } from "@ringee/platform";
import {
  VOICE_AGENT_CALL_ID_HEADER,
  VOICE_AGENT_TOOL_SECRET_HEADER,
  VoiceAgentToolService,
} from "@ringee/services";

/**
 * The tools an AI voice agent calls mid-conversation.
 *
 * Public because the voice provider calls them, not a browser — so each route
 * carries its own proof: the agent's shared secret, which the provider holds as
 * a secret reference and Ringee stores only as a hash. The call's identity
 * comes from a header the provider fills from a system variable, never from the
 * model's own arguments.
 */
@Controller("ai-voice-agents/tools")
export class AiVoiceAgentToolController {
  constructor(private readonly tools: VoiceAgentToolService) {}

  @Public()
  @Post(":agentId/available-slots")
  getAvailableSlots(
    @Param("agentId") agentId: string,
    @Headers(VOICE_AGENT_TOOL_SECRET_HEADER) secret: string,
    @Body() body: { date?: string },
  ) {
    return this.tools.getAvailableSlots(agentId, secret, body ?? {});
  }

  @Public()
  @Post(":agentId/book-appointment")
  bookAppointment(
    @Param("agentId") agentId: string,
    @Headers(VOICE_AGENT_TOOL_SECRET_HEADER) secret: string,
    @Headers(VOICE_AGENT_CALL_ID_HEADER) callControlId: string,
    @Body()
    body: { start?: string; attendee_email?: string; notes?: string },
  ) {
    return this.tools.bookAppointment(
      agentId,
      secret,
      callControlId ?? null,
      body ?? {},
    );
  }
}
