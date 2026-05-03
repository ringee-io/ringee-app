import { Module } from "@nestjs/common";
import { TelnyxService } from "./telnyx.service";
import { TelnyxClient } from "./telnyx.client";
import { TelnyxWebhookVerifier } from "./telnyx.webhook.verifier";

@Module({
  imports: [],
  providers: [TelnyxService, TelnyxClient, TelnyxWebhookVerifier],
  exports: [TelnyxService, TelnyxWebhookVerifier],
})
export class TelnyxModule {}
