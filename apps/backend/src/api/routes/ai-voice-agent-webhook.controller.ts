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
 * Provider callbacks for AI voice agent calls.
 *
 * Neither of these arrives as a signed Call Control event, so each carries its
 * own proof of authorization in the URL: the status callback a single-use
 * token minted when the call was placed, and the analysis callback a token
 * derived from the agent id — the provider stores a bare URL against the
 * analysis group, with no headers and no signature to pin. The conversation
 * events take the ordinary signed webhook instead.
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

  /**
   * Post-call analysis: the summary, outcome, sentiment and extracted fields
   * the provider produces once a conversation ends.
   *
   * It is delivered here and nowhere else. The results are computed minutes
   * after the call, the provider exposes no endpoint to read them back, and
   * they carry no call handle — only the conversation id, which is what binds
   * them to a call.
   */
  @Public()
  @Post("insights/:agentId/:token")
  @HttpCode(HttpStatus.OK)
  async handleInsights(
    @Param("agentId") agentId: string,
    @Param("token") token: string,
    @Body() body: Record<string, unknown>,
  ) {
    const accepted = await this.results.applyInsightCallback(
      agentId,
      token,
      body ?? {},
    );
    if (!accepted) {
      this.logger.warn(`Discarded an analysis callback for agent ${agentId}`);
    }
    return { received: true };
  }
}
