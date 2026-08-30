import { Module } from "@nestjs/common";
import { TelnyxModule } from "../telephony/telnyx/telnyx.module";
import { LlmCredentialVerifier } from "./llm-credential.verifier";
import { TelnyxKnowledgeStore } from "./telnyx/telnyx.knowledge.store";
import { TelnyxVoiceAgentService } from "./telnyx/telnyx.voice-agent.service";
import { VoiceAgentProviderService } from "./voice-agent-provider.service";

@Module({
  imports: [TelnyxModule],
  providers: [
    TelnyxKnowledgeStore,
    TelnyxVoiceAgentService,
    VoiceAgentProviderService,
    LlmCredentialVerifier,
  ],
  exports: [VoiceAgentProviderService, LlmCredentialVerifier],
})
export class VoiceAgentModule {}
