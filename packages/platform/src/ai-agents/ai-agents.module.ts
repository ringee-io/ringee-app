import { Module, OnModuleInit } from "@nestjs/common";
import { AiProviderRegistry } from "./ai-provider.registry";
import { OpenAiProvider } from "./providers/openai.provider";
import { AnthropicProvider } from "./providers/anthropic.provider";

@Module({
  providers: [AiProviderRegistry, OpenAiProvider, AnthropicProvider],
  exports: [AiProviderRegistry, OpenAiProvider, AnthropicProvider],
})
export class AiAgentsPlatformModule implements OnModuleInit {
  constructor(
    private readonly registry: AiProviderRegistry,
    private readonly openai: OpenAiProvider,
    private readonly anthropic: AnthropicProvider,
  ) {}

  onModuleInit() {
    this.registry.register(this.openai);
    this.registry.register(this.anthropic);
  }
}
