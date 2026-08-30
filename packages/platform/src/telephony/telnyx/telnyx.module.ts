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
  // TelnyxClient is exported so sibling Telnyx adapters (AI voice agents) reuse
  // the one authenticated HTTP client instead of building a second one.
  exports: [
    TelnyxService,
    TelnyxClient,
    TelnyxWebhookVerifier,
    TelnyxEventNormalizer,
  ],
})
export class TelnyxModule {}
