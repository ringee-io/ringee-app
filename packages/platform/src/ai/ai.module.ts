import { Module } from "@nestjs/common";
import { OpenaiModule } from "./openai/openai.module";

@Module({
  imports: [OpenaiModule],
  exports: [OpenaiModule],
})
export class AiModule {}
