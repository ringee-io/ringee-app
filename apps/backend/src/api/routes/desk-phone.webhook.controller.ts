import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request as ExpressRequest } from "express";
import { Public, TelnyxWebhookVerifier } from "@ringee/platform";
import { DeskPhoneCallService } from "@ringee/services";
import { apiConfiguration } from "@ringee/configuration";

/**
 * Dedicated Telnyx webhook for Desk Phones, intentionally separate from
 * `/api/call/webhook` (the WebRTC web/extension/mobile flow). Desk-phone calls
 * originate from device-specific SIP Connections, use Park Outbound Calls, and
 * carry their own validation (device / caller-ID / DNC / credit). Keeping this
 * isolated means the desk-phone flow can be toggled or debugged without
 * touching the existing call pipeline.
 *
 * Configure each desk-phone Credential Connection's `webhook_event_url` to:
 *   {PUBLIC_BACKEND_URL}/api/webhooks/telnyx/desk-phone
 */
@Controller("webhooks/telnyx")
export class DeskPhoneWebhookController {
  private readonly logger = new Logger(DeskPhoneWebhookController.name);

  constructor(
    private readonly deskPhoneCallService: DeskPhoneCallService,
    private readonly verifier: TelnyxWebhookVerifier,
  ) {}

  @Public()
  @Post("desk-phone")
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() req: RawBodyRequest<ExpressRequest>,
    @Headers() headers: Record<string, string>,
    @Body() body: any,
  ): Promise<{ received: boolean }> {
    // Feature is shippable dark: ack and drop when disabled.
    if (!apiConfiguration.DESK_PHONES_ENABLED) {
      return { received: true };
    }

    // Verify the Telnyx Ed25519 signature over the raw body bytes, exactly as
    // messaging.webhook.controller.ts does. Fail closed: a missing/invalid
    // signature (or unconfigured TELNYX_PUBLIC_KEY) is rejected.
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(body ?? {}), "utf-8");
    const ok = this.verifier.verify(
      headers["telnyx-signature-ed25519"],
      headers["telnyx-timestamp"],
      raw,
    );
    if (!ok) {
      this.logger.warn(
        "Rejected Telnyx desk-phone webhook (invalid signature)",
      );
      throw new UnauthorizedException("Invalid Telnyx signature");
    }

    const event = body?.data;
    if (event?.event_type) {
      this.logger.debug(`📟 Desk-phone webhook: ${event.event_type}`);
      // Never throw back to Telnyx for processing errors — that triggers retries
      // we handle idempotently anyway. Ack and log.
      await this.deskPhoneCallService
        .handleEvent(event)
        .catch((err) =>
          this.logger.error(
            `Desk-phone event ${event.event_type} failed: ${err.message}`,
            err.stack,
          ),
        );
    }

    return { received: true };
  }
}
