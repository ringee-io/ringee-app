import { Module, OnModuleInit } from "@nestjs/common";
import { AiProviderRegistry } from "./ai-provider.registry";
import { OpenAiProvider } from "./providers/openai.provider";

@Module({
  providers: [AiProviderRegistry, OpenAiProvider],
  exports: [AiProviderRegistry, OpenAiProvider],
})
export class AiAgentsPlatformModule implements OnModuleInit {
  constructor(
    private readonly registry: AiProviderRegistry,
    private readonly openai: OpenAiProvider,
  ) {}

  onModuleInit() {
    this.registry.register(this.openai);
  }
}
