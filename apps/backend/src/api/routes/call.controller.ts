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
import { TriggerLoopActivityService } from "../../triggerloop/services/triggerloop-activity.service";

@Controller("call")
export class CallController {
  private readonly logger = new Logger(CallController.name);

  constructor(
    private readonly callService: CallService,
    private readonly activity: TriggerLoopActivityService,
  ) {}

  @Public()
  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async handleTelnyxWebhook(@Body() dto: any) {
    this.logger.debug(
      `📨 Webhook Telnyx recibido: ${dto.event_type}`,
      new Date().getTime(),
    );

    const event = dto.data as TelnyxWebhookEvent;
    await this.callService.handleTelnyxEvent(event);

    // After a hangup, record activity and fire transition events. We fetch
    // the call here (in the controller layer) to avoid coupling
    // @ringee/services to the TriggerLoop module.
    if (event.event_type === "call.hangup" && event.payload?.call_control_id) {
      const call = await this.callService.findByControlId(
        event.payload.call_control_id,
      );
      if (call?.userId) {
        await this.activity.onCallCompleted(call.userId, call.id);
      }
    }

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
