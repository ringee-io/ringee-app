import { Module } from "@nestjs/common";
import { TelnyxService } from "./telnyx.service";
import { TelnyxClient } from "./telnyx.client";

@Module({
  imports: [],
  providers: [TelnyxService, TelnyxClient],
  exports: [TelnyxService],
})
export class TelnyxModule {}
