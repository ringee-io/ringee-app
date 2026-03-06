import { Module } from "@nestjs/common";
import { TelnyxModule } from "./telnyx/telnyx.module";
import { TelephonyService } from "./telephony.service";

@Module({
  imports: [TelnyxModule],
  exports: [TelephonyService],
  providers: [TelephonyService],
})
export class TelephonyModule {}
