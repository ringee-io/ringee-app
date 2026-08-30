import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
} from "@nestjs/common";
import { Public } from "@ringee/platform";
import { VoiceAgentResultService } from "@ringee/services";

/**
 * Call-status callbacks for AI voice agent calls.
 *
 * These arrive in the provider's telephony-markup shape rather than as signed
 * events, so this route carries its own proof of authorization: a single-use
 * token minted when the call was placed, whose hash is stored on the call row.
 * The conversation events take the ordinary signed webhook instead.
 *
 * Always answers 200. A provider that gets an error retries the same callback,
 * and a token that does not verify will never start verifying.
 */
@Controller("ai-voice-agents/webhooks")
export class AiVoiceAgentWebhookController {
  private readonly logger = new Logger(AiVoiceAgentWebhookController.name);

  constructor(private readonly results: VoiceAgentResultService) {}

  @Public()
  @Post("status/:agentCallId/:token")
  @HttpCode(HttpStatus.OK)
  async handleStatus(
    @Param("agentCallId") agentCallId: string,
    @Param("token") token: string,
    @Body() body: Record<string, unknown>,
  ) {
    const accepted = await this.results.applyStatusCallback(
      agentCallId,
      token,
      body ?? {},
    );
    if (!accepted) {
      this.logger.warn(
        `Discarded a status callback for agent call ${agentCallId}`,
      );
    }
    return { received: true };
  }
}
