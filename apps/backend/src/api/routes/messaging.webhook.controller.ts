import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { Public, TelnyxWebhookVerifier } from "@ringee/platform";
import { MessageService } from "@ringee/services";
import type { Request } from "express";

/**
 * Telnyx Messaging webhook handler.
 * Endpoint: POST /api/messaging/webhook
 *
 * Idempotent on `data.id` (the provider event id). Verifies Telnyx signature
 * using the configured public key + the raw body bytes.
 */
@Controller("messaging")
export class MessagingWebhookController {
  private readonly logger = new Logger(MessagingWebhookController.name);

  constructor(
    private readonly messageService: MessageService,
    private readonly verifier: TelnyxWebhookVerifier,
  ) {}

  @Public()
  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers("telnyx-signature-ed25519") signature: string,
    @Headers("telnyx-timestamp") timestamp: string,
    @Body() body: any,
  ) {
    // The raw body is required to verify the Ed25519 signature.
    // Nest's NestFactory.create({ rawBody: true }) (set in main.ts) puts it
    // on req.rawBody for every route.
    const raw =
      req.rawBody ?? Buffer.from(JSON.stringify(body ?? {}), "utf-8");

    const ok = this.verifier.verify(signature, timestamp, raw);
    if (!ok) {
      this.logger.warn("Rejected Telnyx messaging webhook (invalid signature)");
      throw new UnauthorizedException("Invalid signature");
    }

    if (!body?.data?.id) {
      // Acknowledge unknown payloads so Telnyx stops retrying.
      return { received: true };
    }

    try {
      await this.messageService.handleWebhookEvent(body);
    } catch (err) {
      this.logger.error(
        `Failed to process messaging webhook ${body?.data?.id}: ${(err as Error).message}`,
      );
      throw err;
    }

    return { received: true };
  }
}
