import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
} from "@nestjs/common";
import { Public } from "@ringee/platform";
import {
  CustomIntegrationAuthService,
  CustomIntegrationClickToCallService,
  CustomIntegrationInboundService,
} from "@ringee/services";

const API_KEY_HEADER = "x-ringee-api-key";

interface ClickToCallBody {
  contactExternalId?: string;
  phoneNumber?: string;
  fromNumber?: string;
  agentEmail?: string;
  ownerEmail?: string;
  ownerExternalId?: string;
}

@Controller("integrations/custom")
export class CustomIntegrationsWebhookController {
  constructor(
    private readonly auth: CustomIntegrationAuthService,
    private readonly inbound: CustomIntegrationInboundService,
    private readonly clickToCall: CustomIntegrationClickToCallService,
  ) {}

  /**
   * The envelope is validated by the service, which reports every problem in
   * one response instead of one per round trip.
   */
  @Public()
  @Post("webhook")
  @HttpCode(202)
  async receive(
    @Headers(API_KEY_HEADER) apiKey: string | undefined,
    @Body() body: unknown,
  ) {
    const { integration } = await this.auth.resolveApiKey(apiKey);
    return this.inbound.handle(integration, body);
  }

  @Public()
  @Post("click-to-call")
  async callOut(
    @Headers(API_KEY_HEADER) apiKey: string | undefined,
    @Body() body: ClickToCallBody,
  ) {
    if (!body || typeof body !== "object") {
      throw new BadRequestException("body must be a JSON object");
    }
    const { integration } = await this.auth.resolveApiKey(apiKey);
    return this.clickToCall.execute(integration, body);
  }
}
