import { Module } from "@nestjs/common";
import { WhatsappService } from "./whatsapp.service";
import { WhatsappClient } from "./whatsapp.client";
import { HttpModule } from "@nestjs/axios";
import { CryptoService } from "../../crypto/crypto.service";

@Module({
  imports: [
    HttpModule.register({
      timeout: 3000,
      maxRedirects: 5,
    }),
  ],
  providers: [WhatsappService, WhatsappClient, CryptoService],
  exports: [WhatsappService, WhatsappClient, CryptoService],
})
export class WhatsappModule {}
