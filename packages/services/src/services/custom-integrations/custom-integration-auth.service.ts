import { Injectable, UnauthorizedException } from "@nestjs/common";
import {
  CustomIntegration,
  CustomIntegrationRepository,
} from "@ringee/database";
import {
  OwnershipContext,
  hashApiKey,
  isValidApiKeyShape,
} from "@ringee/platform";

export interface ResolvedApiKey {
  integration: CustomIntegration;
  ctx: OwnershipContext;
}

@Injectable()
export class CustomIntegrationAuthService {
  constructor(private readonly repo: CustomIntegrationRepository) {}

  async resolveApiKey(rawKey: string | undefined | null): Promise<ResolvedApiKey> {
    if (!isValidApiKeyShape(rawKey)) {
      throw new UnauthorizedException("Invalid API key format");
    }
    const hash = hashApiKey(rawKey);
    const integration = await this.repo.findByApiKeyHash(hash);
    if (!integration) {
      throw new UnauthorizedException("Invalid API key");
    }
    if (integration.status !== "active") {
      throw new UnauthorizedException("Integration is disabled");
    }

    // Fire-and-forget touch — the lookup already succeeded.
    void this.repo.touchLastUsed(integration.id).catch(() => undefined);

    return {
      integration,
      ctx: {
        userId: integration.userId,
        organizationId: integration.organizationId,
      },
    };
  }
}
