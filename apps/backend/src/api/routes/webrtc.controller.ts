import { Controller, Get } from "@nestjs/common";
import { User } from "@ringee/database";
import { CurrentUser, TelephonyService } from "@ringee/platform";

@Controller("webrtc")
export class WebRTCController {
  constructor(private readonly telephonyService: TelephonyService) {}

  @Get("credentials")
  async createTelephonyCredential(@CurrentUser() user: User) {
    return this.telephonyService.createTelephonyCredential(user.id);
  }
}
