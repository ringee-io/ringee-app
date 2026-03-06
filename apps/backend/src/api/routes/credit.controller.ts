import { Controller, Get, Patch, NotFoundException } from "@nestjs/common";
import { CreditService, UserService } from "@ringee/services";
import { CurrentUser, createOwnershipContext } from "@ringee/platform";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
}

@Controller("credits")
export class CreditController {
  constructor(
    private readonly creditService: CreditService,
    private readonly userService: UserService,
  ) { }

  @Get("balance")
  async getBalance(@CurrentUser() user: CurrentUserData) {
    const dbUser = await this.userService.getUserById(user.id);

    if (!dbUser?.id) {
      throw new NotFoundException("User not found");
    }

    try {
      const ctx = createOwnershipContext(user);
      const balance = await this.creditService.getBalance(ctx);

      return {
        balance,
        freeCallTrial: dbUser.freeCallTrial,
      };
    } catch (error) {
      return {
        balance: 0,
        freeCallTrial: false,
      };
    }
  }

  @Patch("/consume-free-call-trial")
  async consumeFreeCallTrial(@CurrentUser() user: CurrentUserData) {
    return this.userService.consumeFreeCallTrial(user.id);
  }
}
