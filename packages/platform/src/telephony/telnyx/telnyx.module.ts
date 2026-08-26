import { Module } from "@nestjs/common";
import { TelnyxService } from "./telnyx.service";
import { TelnyxClient } from "./telnyx.client";
import { TelnyxWebhookVerifier } from "./telnyx.webhook.verifier";
import { TelnyxEventNormalizer } from "./telnyx.event.normalizer";

@Module({
  imports: [],
  providers: [
    TelnyxService,
    TelnyxClient,
    TelnyxWebhookVerifier,
    TelnyxEventNormalizer,
  ],
  exports: [TelnyxService, TelnyxWebhookVerifier, TelnyxEventNormalizer],
})
export class TelnyxModule {}
