import { Injectable } from "@nestjs/common";
import { InboundDestinationType } from "@ringee/database";
import { VoiceAgentCallService } from "../../voice-agents/voice-agent-call.service";
import type { InboundDestinationHandler, InboundTransport, RouteExecutionRequest, RouteExecutionResult } from "../inbound-routing.types";

@Injectable()
export class AiReceptionistDestinationHandler implements InboundDestinationHandler {
  readonly type = InboundDestinationType.ai_receptionist;
  readonly transports: readonly InboundTransport[] = ["call_control"];
  constructor(private readonly agents: VoiceAgentCallService) {}

  async execute(request: RouteExecutionRequest): Promise<RouteExecutionResult> {
    if (request.destination.type !== "ai_receptionist")
      return { status: "failed", reason: "destination_missing", detail: "Expected a voice agent destination." };
    await this.agents.startInbound(request.ctx, request.destination.agentId, request.call);
    return { status: "ringing", targets: 1 };
  }
}
