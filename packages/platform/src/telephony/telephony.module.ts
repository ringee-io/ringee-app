import { Module } from "@nestjs/common";
import { TelnyxModule } from "./telnyx/telnyx.module";
import { TelephonyService } from "./telephony.service";

@Module({
  imports: [TelnyxModule],
  // Re-exporting TelnyxModule makes TelnyxService and TelnyxWebhookVerifier
  // available to importers of TelephonyModule (e.g. ServicesModule).
  exports: [TelephonyService, TelnyxModule],
  providers: [TelephonyService],
})
export class TelephonyModule {}
