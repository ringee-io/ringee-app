import { Injectable, NotFoundException } from "@nestjs/common";
import type { AiProvider } from "./types";

@Injectable()
export class AiProviderRegistry {
  private readonly providers = new Map<string, AiProvider>();

  register(provider: AiProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): AiProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new NotFoundException(
        `AI provider not registered: ${name}. Registered providers: ${Array.from(
          this.providers.keys(),
        ).join(", ")}`,
      );
    }
    return provider;
  }

  list(): string[] {
    return Array.from(this.providers.keys());
  }
}
