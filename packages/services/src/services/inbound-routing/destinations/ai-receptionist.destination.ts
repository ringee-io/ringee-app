import { HttpException, Injectable } from "@nestjs/common";
import { InboundDestinationType } from "@ringee/database";
import { VoiceAgentCallService } from "../../voice-agents/voice-agent-call.service";
import type {
  InboundDestinationHandler,
  InboundTransport,
  RouteExecutionRequest,
  RouteExecutionResult,
} from "../inbound-routing.types";

/** Refusals a webhook retry cannot change: no credit, no agent, a rejected command. */
const DEFINITIVE_STATUSES = [400, 401, 403, 404, 422];

@Injectable()
export class AiReceptionistDestinationHandler
  implements InboundDestinationHandler
{
  readonly type = InboundDestinationType.ai_receptionist;
  readonly transports: readonly InboundTransport[] = ["call_control"];
  constructor(private readonly agents: VoiceAgentCallService) {}

  async execute(request: RouteExecutionRequest): Promise<RouteExecutionResult> {
    if (request.destination.type !== "ai_receptionist")
      return {
        status: "failed",
        reason: "destination_missing",
        detail: "Expected a voice agent destination.",
      };
    try {
      await this.agents.startInbound(
        request.ctx,
        request.destination.agentId,
        request.call,
      );
    } catch (error) {
      // An uncertain provider outcome propagates so the webhook is redelivered
      // and the same command ids are replayed. A definitive refusal fails the
      // call now instead of leaving the caller ringing through every retry.
      if (
        !(error instanceof HttpException) ||
        !DEFINITIVE_STATUSES.includes(error.getStatus())
      )
        throw error;
      return {
        status: "failed",
        reason: "agent_unavailable",
        detail: `voice agent ${request.destination.agentId} could not answer: ${error.message}`,
        callerMessage: "The AI receptionist could not answer the call.",
      };
    }
    return { status: "ringing", targets: 1 };
  }
}
