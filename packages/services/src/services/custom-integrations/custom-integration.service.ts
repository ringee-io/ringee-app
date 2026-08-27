import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CustomIntegration,
  CustomIntegrationEventType,
  CustomIntegrationRepository,
  CustomIntegrationStatus,
  CustomIntegrationInboundRepository,
  CustomIntegrationInboundEvent,
  CustomIntegrationDeliveryRepository,
  CustomIntegrationDelivery,
} from "@ringee/database";
import {
  CryptoService,
  OwnershipContext,
  generateCustomIntegrationApiKey,
  generateWebhookSigningSecret,
} from "@ringee/platform";

export interface CustomIntegrationSummary {
  id: string;
  name: string;
  status: CustomIntegrationStatus;
  apiKeyPrefix: string;
  apiKeyLastUsedAt: Date | null;
  outboundUrl: string | null;
  subscribedEvents: CustomIntegrationEventType[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomIntegrationWithSecrets extends CustomIntegrationSummary {
  /** Plaintext API key — only returned on create/rotate. */
  apiKey?: string;
  /** Plaintext webhook signing secret — only returned on create/rotate. */
  signingSecret?: string;
}

@Injectable()
export class CustomIntegrationService {
  constructor(
    private readonly repo: CustomIntegrationRepository,
    private readonly crypto: CryptoService,
    private readonly inboundRepo: CustomIntegrationInboundRepository,
    private readonly deliveryRepo: CustomIntegrationDeliveryRepository,
  ) {}

  list(ctx: OwnershipContext): Promise<CustomIntegration[]> {
    return this.repo.list(ctx);
  }

  async get(ctx: OwnershipContext, id: string): Promise<CustomIntegration> {
    const integration = await this.repo.findById(id);
    this.assertOwnership(integration, ctx);
    return integration!;
  }

  async create(
    ctx: OwnershipContext,
    input: { name: string },
  ): Promise<CustomIntegrationWithSecrets> {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException("name is required");

    const apiKey = generateCustomIntegrationApiKey();
    const signingSecret = generateWebhookSigningSecret();
    const webhookSigningSecretCt = this.crypto.encrypt({ s: signingSecret });

    const integration = await this.repo.create(ctx, {
      name,
      apiKeyPrefix: apiKey.prefix,
      apiKeyHash: apiKey.hash,
      webhookSigningSecretCt,
    });

    return {
      ...this.toSummary(integration),
      apiKey: apiKey.plaintext,
      signingSecret,
    };
  }

  async update(
    ctx: OwnershipContext,
    id: string,
    input: {
      name?: string;
      outboundUrl?: string | null;
      subscribedEvents?: CustomIntegrationEventType[];
      status?: CustomIntegrationStatus;
    },
  ): Promise<CustomIntegrationSummary> {
    await this.get(ctx, id);

    if (input.outboundUrl) {
      const trimmed = input.outboundUrl.trim();
      if (trimmed && !/^https?:\/\//i.test(trimmed)) {
        throw new BadRequestException(
          "outboundUrl must start with http:// or https://",
        );
      }
    }

    const updated = await this.repo.update(id, {
      name: input.name?.trim() || undefined,
      outboundUrl:
        input.outboundUrl === undefined
          ? undefined
          : input.outboundUrl?.trim() || null,
      subscribedEvents: input.subscribedEvents,
      status: input.status,
    });
    return this.toSummary(updated);
  }

  async regenerateApiKey(
    ctx: OwnershipContext,
    id: string,
  ): Promise<{ apiKey: string; apiKeyPrefix: string }> {
    await this.get(ctx, id);
    const apiKey = generateCustomIntegrationApiKey();
    await this.repo.rotateApiKey(id, apiKey.prefix, apiKey.hash);
    return { apiKey: apiKey.plaintext, apiKeyPrefix: apiKey.prefix };
  }

  async regenerateSigningSecret(
    ctx: OwnershipContext,
    id: string,
  ): Promise<{ signingSecret: string }> {
    await this.get(ctx, id);
    const secret = generateWebhookSigningSecret();
    const ct = this.crypto.encrypt({ s: secret });
    await this.repo.rotateSigningSecret(id, ct);
    return { signingSecret: secret };
  }

  async delete(ctx: OwnershipContext, id: string): Promise<void> {
    await this.get(ctx, id);
    await this.repo.delete(id);
  }

  /** Decrypt the stored webhook signing secret (for the worker, not exposed via API). */
  decryptSigningSecret(integration: CustomIntegration): string {
    const obj = this.crypto.decrypt(integration.webhookSigningSecretCt) as {
      s: string;
    };
    return obj.s;
  }

  /**
   * Delivery logs for one integration, after the ownership check in `get`.
   * Reads go through here rather than straight from a controller so the
   * workspace check and the query stay in one place.
   */
  async listInboundEvents(
    ctx: OwnershipContext,
    id: string,
    options: { limit?: number; cursor?: string },
  ): Promise<CustomIntegrationInboundEvent[]> {
    await this.get(ctx, id);
    return this.inboundRepo.list(id, options);
  }

  async listOutboundDeliveries(
    ctx: OwnershipContext,
    id: string,
    options: { limit?: number; cursor?: string },
  ): Promise<CustomIntegrationDelivery[]> {
    await this.get(ctx, id);
    return this.deliveryRepo.list(id, options);
  }

  toSummary(i: CustomIntegration): CustomIntegrationSummary {
    return {
      id: i.id,
      name: i.name,
      status: i.status,
      apiKeyPrefix: i.apiKeyPrefix,
      apiKeyLastUsedAt: i.apiKeyLastUsedAt,
      outboundUrl: i.outboundUrl,
      subscribedEvents: i.subscribedEvents,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    };
  }

  private assertOwnership(
    integration: CustomIntegration | null,
    ctx: OwnershipContext,
  ): void {
    if (!integration)
      throw new NotFoundException("Custom integration not found");
    const expectedOrgId = ctx.organizationId ?? null;
    if (integration.organizationId !== expectedOrgId) {
      throw new ForbiddenException("Integration belongs to another workspace");
    }
    if (!integration.organizationId && integration.userId !== ctx.userId) {
      throw new ForbiddenException("Integration belongs to another workspace");
    }
  }
}
