import { Injectable } from "@nestjs/common";
import {
  CustomIntegration,
  CustomIntegrationRepository,
} from "@ringee/database";
import {
  OwnershipContext,
  PublishableKeyClaims,
  isOriginAllowed,
  mintPublishableKey,
  normalizeAllowedOrigins,
  normalizeOrigin,
  verifyPublishableKey,
} from "@ringee/platform";
import { CustomIntegrationService } from "../custom-integrations/custom-integration.service";
import { SdkError } from "./sdk.errors";

export interface ResolvedPublishableKey {
  integration: CustomIntegration;
  claims: PublishableKeyClaims;
  /** Normalized, verified request origin. */
  origin: string;
  ctx: OwnershipContext;
}

/**
 * Mints and validates browser-safe publishable keys (`pk_live_...`).
 *
 * A publishable key embeds `{ integrationId, apiKeyPrefix, allowedOrigins }`
 * signed by Ringee. Validation is fully stateless except for a single lookup of
 * the owning `CustomIntegration`, which lets us enforce two live revocation
 * rules the token alone can't express: the integration must still be `active`,
 * and its `apiKeyPrefix` must still match the one signed into the key (so
 * rotating the secret `cik_live` key invalidates every `pk` at once).
 */
@Injectable()
export class SdkPublishableKeyService {
  constructor(
    private readonly integrations: CustomIntegrationService,
    private readonly repo: CustomIntegrationRepository,
  ) {}

  /**
   * Mint a publishable key for an integration the caller owns. Admin-gated at
   * the controller (same `@OrgAdminOnly()` as the rest of integration mgmt).
   */
  async mint(
    ctx: OwnershipContext,
    integrationId: string,
    allowedOrigins: string[],
  ): Promise<{
    publishableKey: string;
    integrationId: string;
    apiKeyPrefix: string;
    allowedOrigins: string[];
  }> {
    // Ownership + existence check (throws NotFound/Forbidden).
    const integration = await this.integrations.get(ctx, integrationId);

    let origins: string[];
    try {
      origins = normalizeAllowedOrigins(allowedOrigins);
    } catch (err) {
      throw new SdkError(
        "DOMAIN_NOT_ALLOWED",
        (err as Error).message || "Invalid allowed origins",
      );
    }

    const { key } = mintPublishableKey({
      integrationId: integration.id,
      apiKeyPrefix: integration.apiKeyPrefix,
      allowedOrigins: origins,
    });

    return {
      publishableKey: key,
      integrationId: integration.id,
      apiKeyPrefix: integration.apiKeyPrefix,
      allowedOrigins: origins,
    };
  }

  /**
   * Validate a publishable key + request origin and return the live
   * integration. Throws a typed {@link SdkError} on any failure.
   */
  async resolve(
    rawKey: string | undefined | null,
    requestOrigin: string | undefined | null,
  ): Promise<ResolvedPublishableKey> {
    const verified = verifyPublishableKey(rawKey);
    if (!verified.ok) {
      throw new SdkError(
        "INVALID_PUBLISHABLE_KEY",
        "The publishable key is invalid.",
      );
    }
    const { claims } = verified;

    const integration = await this.repo.findById(claims.integrationId);
    if (!integration) {
      throw new SdkError(
        "INVALID_PUBLISHABLE_KEY",
        "The publishable key is invalid.",
      );
    }
    if (integration.status !== "active") {
      throw new SdkError(
        "INTEGRATION_DISABLED",
        "This integration is disabled.",
      );
    }
    // Rotating the secret key changes apiKeyPrefix → old publishable keys die.
    if (integration.apiKeyPrefix !== claims.apiKeyPrefix) {
      throw new SdkError(
        "INVALID_PUBLISHABLE_KEY",
        "The publishable key has been revoked.",
      );
    }

    if (!isOriginAllowed(requestOrigin, claims.allowedOrigins)) {
      throw new SdkError(
        "DOMAIN_NOT_ALLOWED",
        "This domain is not authorized for the integration.",
      );
    }

    return {
      integration,
      claims,
      origin: normalizeOrigin(requestOrigin)!,
      ctx: {
        userId: integration.userId,
        organizationId: integration.organizationId,
      },
    };
  }
}
