import { Module } from "@nestjs/common";
import { WhatsappModule } from "./whatsapp/whatsapp.module";

@Module({
  imports: [WhatsappModule],
  exports: [WhatsappModule],
})
export class ChatModule {}
