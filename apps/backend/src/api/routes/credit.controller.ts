import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  NotFoundException,
} from "@nestjs/common";
import { CreditService, UserService } from "@ringee/services";
import {
  CurrentUser,
  createOwnershipContext,
  UpdateAutoReloadSettingsDto,
} from "@ringee/platform";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
}

@Controller("credits")
export class CreditController {
  constructor(
    private readonly creditService: CreditService,
    private readonly userService: UserService,
  ) {}

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

  @Get("auto-reload-settings")
  async getAutoReloadSettings(@CurrentUser() user: CurrentUserData) {
    const ctx = createOwnershipContext(user);
    const settings = await this.creditService.getAutoReloadSettings(ctx);

    return {
      autoReloadEnabled: settings?.autoReloadEnabled ?? false,
      autoReloadThreshold: settings?.autoReloadThreshold ?? 5,
      autoReloadAmount: settings?.autoReloadAmount ?? 25,
      monthlyFundEnabled: settings?.monthlyFundEnabled ?? false,
      monthlyFundAmount: settings?.monthlyFundAmount ?? null,
    };
  }

  @Patch("auto-reload-settings")
  async updateAutoReloadSettings(
    @CurrentUser() user: CurrentUserData,
    @Body() body: UpdateAutoReloadSettingsDto,
  ) {
    const ctx = createOwnershipContext(user);
    const settings = await this.creditService.updateAutoReloadSettings(
      ctx,
      body,
    );

    return {
      autoReloadEnabled: settings.autoReloadEnabled,
      autoReloadThreshold: settings.autoReloadThreshold,
      autoReloadAmount: settings.autoReloadAmount,
    };
  }

  @Delete("monthly-fund")
  async cancelMonthlyFund(@CurrentUser() user: CurrentUserData) {
    const ctx = createOwnershipContext(user);
    await this.creditService.disableMonthlyFund(ctx);
    return { success: true };
  }
}
