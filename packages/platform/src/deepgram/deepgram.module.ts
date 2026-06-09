import { Module } from "@nestjs/common";
import { DeepgramService } from "./deepgram.service";

@Module({
  providers: [DeepgramService],
  exports: [DeepgramService],
})
export class DeepgramModule {}
