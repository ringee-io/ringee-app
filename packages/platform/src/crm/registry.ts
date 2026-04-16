import { Injectable, NotFoundException } from "@nestjs/common";
import { CrmProviderType } from "@ringee/database";
import type { CrmProvider } from "./provider";

@Injectable()
export class CrmProviderRegistry {
  private readonly providers = new Map<CrmProviderType, CrmProvider>();

  register(provider: CrmProvider): void {
    this.providers.set(provider.type, provider);
  }

  get(type: CrmProviderType): CrmProvider {
    const p = this.providers.get(type);
    if (!p) throw new NotFoundException(`CRM provider not registered: ${type}`);
    return p;
  }

  tryGet(type: CrmProviderType): CrmProvider | undefined {
    return this.providers.get(type);
  }

  listTypes(): CrmProviderType[] {
    return Array.from(this.providers.keys());
  }
}
