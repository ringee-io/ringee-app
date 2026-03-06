import {
  Controller,
  Post,
  Body,
  BadRequestException,
  Res,
} from "@nestjs/common";
import { CreateChatAuthDto, CurrentUser, createOwnershipContext } from "@ringee/platform";
import { ChatAuthService } from "@ringee/services";
import { CryptoService } from "@ringee/platform";
import { UserRepository } from "@ringee/database";
import { apiConfiguration } from "@ringee/configuration";
import { Response } from "express";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
}

@Controller("chat/auth")
export class ChatAuthController {
  constructor(
    private readonly chatAuthService: ChatAuthService,
    private readonly cryptoService: CryptoService,
    private readonly userRepository: UserRepository,
  ) { }

  @Post("connect")
  async connectWhatsapp(
    @Body() body: CreateChatAuthDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    await this.chatAuthService.createChatAuth(ctx, {
      phoneNumber: body.phoneNumber,
    });
  }

  @Post()
  async connectChat(@CurrentUser() user: CurrentUserData, @Res() res: Response) {
    const e = this.cryptoService.encrypt({
      u: user.id,
    });

    const url = `https://wa.me/${apiConfiguration.WHATSAPP_PHONE_NUMBER}?text=ringee-login-${e}`;

    res.status(302).redirect(url);
  }

  @Post("decrypt")
  decrypt(@Body() body: { p: string }) {
    if (!body.p) {
      throw new BadRequestException("Missing data");
    }

    return {
      data: this.cryptoService.decrypt(body.p),
    };
  }
}
