import { Injectable, NotFoundException } from "@nestjs/common";
import { EnrichmentProviderType } from "@ringee/database";
import type { EnrichmentProvider } from "./provider";

@Injectable()
export class EnrichmentProviderRegistry {
  private readonly providers = new Map<
    EnrichmentProviderType,
    EnrichmentProvider
  >();

  register(provider: EnrichmentProvider): void {
    this.providers.set(provider.type, provider);
  }

  get(type: EnrichmentProviderType): EnrichmentProvider {
    const p = this.providers.get(type);
    if (!p)
      throw new NotFoundException(
        `Enrichment provider not registered: ${type}`,
      );
    return p;
  }

  tryGet(type: EnrichmentProviderType): EnrichmentProvider | undefined {
    return this.providers.get(type);
  }

  listTypes(): EnrichmentProviderType[] {
    return Array.from(this.providers.keys());
  }

  list(): EnrichmentProvider[] {
    return Array.from(this.providers.values());
  }
}
