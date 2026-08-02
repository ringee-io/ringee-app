import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  CustomIntegrationEventType,
  CustomIntegrationStatus,
} from "@ringee/database";
import {
  ALL_EVENT_SPECS,
  CurrentUser,
  CurrentUserData,
  createOwnershipContext,
  OrgAdminOnly,
} from "@ringee/platform";
import {
  CustomIntegrationDeliveryService,
  CustomIntegrationService,
  SdkPublishableKeyService,
} from "@ringee/services";
import {
  CustomIntegrationInboundRepository,
  CustomIntegrationDeliveryRepository,
} from "@ringee/database";

interface CreateBody {
  name: string;
}

interface UpdateBody {
  name?: string;
  outboundUrl?: string | null;
  subscribedEvents?: CustomIntegrationEventType[];
  status?: CustomIntegrationStatus;
}

@Controller("integrations/custom")
@OrgAdminOnly()
export class CustomIntegrationsController {
  constructor(
    private readonly integrations: CustomIntegrationService,
    private readonly delivery: CustomIntegrationDeliveryService,
    private readonly inboundRepo: CustomIntegrationInboundRepository,
    private readonly deliveryRepo: CustomIntegrationDeliveryRepository,
    private readonly sdkKeys: SdkPublishableKeyService,
  ) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserData) {
    const ctx = createOwnershipContext(user);
    const items = await this.integrations.list(ctx);
    return items.map((i) => this.integrations.toSummary(i));
  }

  @Post()
  async create(@CurrentUser() user: CurrentUserData, @Body() body: CreateBody) {
    if (!body?.name?.trim()) throw new BadRequestException("name is required");
    const ctx = createOwnershipContext(user);
    return this.integrations.create(ctx, { name: body.name });
  }

  @Get("event-specs")
  getEventSpecs() {
    return ALL_EVENT_SPECS;
  }

  @Get(":id")
  async get(@CurrentUser() user: CurrentUserData, @Param("id") id: string) {
    const ctx = createOwnershipContext(user);
    const integration = await this.integrations.get(ctx, id);
    return this.integrations.toSummary(integration);
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
    @Body() body: UpdateBody,
  ) {
    const ctx = createOwnershipContext(user);
    return this.integrations.update(ctx, id, body ?? {});
  }

  @Delete(":id")
  async delete(@CurrentUser() user: CurrentUserData, @Param("id") id: string) {
    const ctx = createOwnershipContext(user);
    await this.integrations.delete(ctx, id);
    return { deleted: true };
  }

  @Post(":id/regenerate-api-key")
  async regenerateApiKey(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
  ) {
    const ctx = createOwnershipContext(user);
    return this.integrations.regenerateApiKey(ctx, id);
  }

  /**
   * Mint a browser-safe publishable key (`pk_live_...`) for this integration,
   * scoped to the given `allowedOrigins`. Unlike the secret `cik_live_` key
   * this is meant to ship in a CRM's frontend; it embeds no secret and is
   * revoked automatically when the integration's API key is rotated.
   */
  @Post(":id/publishable-keys")
  async mintPublishableKey(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
    @Body() body: { allowedOrigins?: string[] },
  ) {
    if (
      !Array.isArray(body?.allowedOrigins) ||
      body.allowedOrigins.length === 0
    ) {
      throw new BadRequestException("allowedOrigins is required");
    }
    const ctx = createOwnershipContext(user);
    return this.sdkKeys.mint(ctx, id, body.allowedOrigins);
  }

  @Post(":id/regenerate-signing-secret")
  async regenerateSigningSecret(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
  ) {
    const ctx = createOwnershipContext(user);
    return this.integrations.regenerateSigningSecret(ctx, id);
  }

  @Post(":id/test-webhook")
  async testWebhook(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
  ) {
    const ctx = createOwnershipContext(user);
    await this.integrations.get(ctx, id);
    return this.delivery.sendTest(id);
  }

  @Get(":id/inbound-logs")
  async inboundLogs(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string,
  ) {
    const ctx = createOwnershipContext(user);
    await this.integrations.get(ctx, id);
    return this.inboundRepo.list(id, {
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }

  @Get(":id/outbound-logs")
  async outboundLogs(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string,
  ) {
    const ctx = createOwnershipContext(user);
    await this.integrations.get(ctx, id);
    return this.deliveryRepo.list(id, {
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }
}
