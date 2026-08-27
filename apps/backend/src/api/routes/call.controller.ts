import {
  Body,
  Controller,
  Headers,
  Post,
  HttpCode,
  HttpStatus,
  Logger,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import {
  Public,
  TelnyxEventNormalizer,
  TelnyxWebhookEvent,
  TelnyxWebhookVerifier,
} from "@ringee/platform";
import { CallService } from "@ringee/services";
import type { Request } from "express";
import { TriggerLoopActivityService } from "../../triggerloop/services/triggerloop-activity.service";

@Controller("call")
export class CallController {
  private readonly logger = new Logger(CallController.name);

  constructor(
    private readonly callService: CallService,
    private readonly activity: TriggerLoopActivityService,
    private readonly verifier: TelnyxWebhookVerifier,
    private readonly normalizer: TelnyxEventNormalizer,
  ) {}

  @Public()
  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async handleTelnyxWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers("telnyx-signature-ed25519") signature: string,
    @Headers("telnyx-timestamp") timestamp: string,
    @Body() dto: any,
  ) {
    // Verify the Telnyx Ed25519 signature over the raw body bytes, exactly as
    // messaging.webhook.controller.ts does. Fail closed: a missing/invalid
    // signature (or unconfigured TELNYX_PUBLIC_KEY) is rejected.
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(dto ?? {}), "utf-8");
    if (!this.verifier.verify(signature, timestamp, raw)) {
      this.logger.warn("Rejected Telnyx call webhook (invalid signature)");
      throw new UnauthorizedException("Invalid signature");
    }

    const providerEvent = dto.data as TelnyxWebhookEvent;
    this.logger.debug(
      `📨 Telnyx webhook received: ${providerEvent?.event_type}`,
      new Date().getTime(),
    );

    // Translate into Ringee's own event vocabulary here, at the edge. Nothing
    // downstream of this line knows the carrier is Telnyx.
    const event = this.normalizer.normalize(providerEvent);
    if (!event) {
      this.logger.warn(
        `Dropping Telnyx event ${providerEvent?.event_type} with no call_control_id`,
      );
      return { received: true };
    }

    await this.callService.handleTelephonyEvent(event);

    // After a hangup, record activity and fire transition events. We fetch
    // the call here (in the controller layer) to avoid coupling
    // @ringee/services to the TriggerLoop module.
    if (event.type === "call.hangup") {
      const call = await this.callService.findByControlId(event.callControlId);
      if (call?.userId) {
        await this.activity.onCallCompleted(call.userId, call.id);
      }
    }

    return { received: true };
  }

  @Public()
  @Post("webhook/failover")
  @HttpCode(HttpStatus.OK)
  async handleTelnyxFailover(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers("telnyx-signature-ed25519") signature: string,
    @Headers("telnyx-timestamp") timestamp: string,
    @Body() dto: TelnyxWebhookEvent,
  ) {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(dto ?? {}), "utf-8");
    if (!this.verifier.verify(signature, timestamp, raw)) {
      this.logger.warn(
        "Rejected Telnyx call failover webhook (invalid signature)",
      );
      throw new UnauthorizedException("Invalid signature");
    }

    this.logger.debug(
      `📨 Webhook Telnyx failover recibido: ${JSON.stringify(dto, null, 2)}`,
    );

    return { received: true };
  }
}
