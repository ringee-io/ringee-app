import { Injectable } from "@nestjs/common";
import { ChatServiceInterface } from "../chat.service.interface";
import { WhatsappClient } from "./whatsapp.client";
import {
  ChatSignInDto,
  ChatSignUpDto,
  ChatWelcomeDto,
  ChatWelcomeNotLoggedInDto,
  ShowMenuDto,
} from "../chat.dto";
import { apiConfiguration } from "@ringee/configuration";
import { CryptoService } from "../../crypto/crypto.service";

@Injectable()
export class WhatsappService implements ChatServiceInterface {
  constructor(
    private readonly whatsappClient: WhatsappClient,
    private readonly cryptoService: CryptoService,
  ) {}

  async welcomeNotLoggedIn(
    phoneNumber: string,
    dto: ChatWelcomeNotLoggedInDto,
  ): Promise<void> {
    await this.whatsappClient.sendInteractiveButtons({
      to: phoneNumber,
      bodyText: dto.bodyText,
      footerText: dto.footerText,
      header: {
        type: "text",
        text: dto.headerText,
      },
      buttons: [
        {
          id: "signin",
          title: dto.signInText,
        },
        {
          id: "signup",
          title: dto.signUpText,
        },
      ],
    });
  }

  async welcome(phoneNumber: string, dto: ChatWelcomeDto): Promise<void> {
    await this.whatsappClient.sendText(phoneNumber, dto.welcomeText);
    await this.showMenu(phoneNumber, dto.menu);
  }

  async showMenu(phoneNumber: string, dto: ShowMenuDto): Promise<void> {
    await this.whatsappClient.sendInteractiveList({
      to: phoneNumber,
      headerText: dto.headerText,
      bodyText: dto.bodyText,
      footerText: dto.footerText,
      buttonText: dto.buttonText,
      sections: dto.menu.map((menu) => ({
        title: menu.title,
        rows: menu.options.map((option) => ({
          id: option.id,
          title: option.title,
          description: option.description,
        })),
      })),
    });
  }

  async signIn(phoneNumber: string, dto: ChatSignInDto): Promise<void> {
    await this.whatsappClient.sendText(phoneNumber, dto.signInText);

    const encrypted = this.cryptoService.encrypt({
      f: "w",
      p: phoneNumber,
    });

    await this.whatsappClient.sendText(
      phoneNumber,
      `${apiConfiguration.FRONTEND_URL}/login?d=${encrypted}`,
    );
  }

  async signUp(phoneNumber: string, dto: ChatSignUpDto): Promise<void> {
    await this.whatsappClient.sendText(phoneNumber, dto.signUpText);

    const encrypted = this.cryptoService.encrypt({
      f: "w",
      p: phoneNumber,
    });

    await this.whatsappClient.sendText(
      phoneNumber,
      `${apiConfiguration.FRONTEND_URL}/signup?d=${encrypted}`,
    );
  }

  async markAsRead(messageId: string): Promise<void> {
    await this.whatsappClient.markAsRead(messageId);
  }

  async sendTypingIndicator(messageId: string): Promise<void> {
    await this.whatsappClient.sendTypingIndicator(messageId);
  }

  async sendText(to: string, text: string): Promise<void> {
    await this.whatsappClient.sendText(to, text);
  }

  async sendReaction(
    to: string,
    messageId: string,
    emoji: string,
  ): Promise<void> {
    await this.whatsappClient.sendReaction({ to, messageId, emoji });
  }
}
