import { Module } from "@nestjs/common";
import { TelnyxService } from "./telnyx.service";
import { TelnyxClient } from "./telnyx.client";
import { TelnyxWebhookVerifier } from "./telnyx.webhook.verifier";
import { TelnyxEventNormalizer } from "./telnyx.event.normalizer";
import { DispatchModule } from "../dispatch/dispatch.module";

@Module({
  // The client asks the dispatch service before any request that starts a call.
  imports: [DispatchModule],
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
