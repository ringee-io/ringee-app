import {
  Body,
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Public, TelnyxWebhookEvent } from "@ringee/platform";
import { CallService } from "@ringee/services";

@Controller("call")
export class CallController {
  private readonly logger = new Logger(CallController.name);

  constructor(private readonly callService: CallService) { }

  @Public()
  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async handleTelnyxWebhook(@Body() dto: any) {
    this.logger.debug(
      `📨 Webhook Telnyx recibido: ${dto.event_type}`,
      new Date().getTime(),
    );

    await this.callService.handleTelnyxEvent(dto.data as TelnyxWebhookEvent);
    return { received: true };
  }

  @Public()
  @Post("webhook/failover")
  @HttpCode(HttpStatus.OK)
  async handleTelnyxFailover(@Body() dto: TelnyxWebhookEvent) {
    this.logger.debug(
      `📨 Webhook Telnyx failover recibido: ${JSON.stringify(dto, null, 2)}`,
    );

    return { received: true };
  }
}
