import { Injectable, BadRequestException } from "@nestjs/common";
import {
  Credit,
  CreditAutoReload,
  CreditRepository,
  CreditAutoReloadRepository,
} from "@ringee/database";
import { OwnershipContext, StripeService } from "@ringee/platform";

@Injectable()
export class CreditService {
  constructor(
    private readonly creditRepository: CreditRepository,
    private readonly creditAutoReloadRepository: CreditAutoReloadRepository,
    private readonly stripeService: StripeService,
  ) {}

  async getBalance(ctx: OwnershipContext): Promise<number> {
    return this.creditRepository.getBalance(ctx);
  }

  async addCredits(ctx: OwnershipContext, amount: number): Promise<Credit> {
    if (amount <= 0) {
      throw new BadRequestException("The amount must be positive.");
    }

    return this.creditRepository.updateBalance(ctx, amount);
  }

  async consumeCredits(ctx: OwnershipContext, amount: number): Promise<Credit> {
    if (amount < 0) {
      throw new BadRequestException("The amount must be positive.");
    }

    const credit = await this.creditRepository.updateBalance(ctx, -amount);

    // Check if auto-reload should be triggered
    this.checkAutoReload(ctx, credit.amount).catch((err) =>
      console.error("Auto-reload check failed:", err),
    );

    return credit;
  }

  // --- Auto-reload settings ---

  async getAutoReloadSettings(
    ctx: OwnershipContext,
  ): Promise<CreditAutoReload | null> {
    return this.creditAutoReloadRepository.getSettings(ctx);
  }

  async updateAutoReloadSettings(
    ctx: OwnershipContext,
    data: {
      autoReloadEnabled?: boolean;
      autoReloadThreshold?: number;
      autoReloadAmount?: number;
    },
  ): Promise<CreditAutoReload> {
    return this.creditAutoReloadRepository.upsertSettings(ctx, data);
  }

  async updateMonthlyFundSettings(
    ctx: OwnershipContext,
    data: {
      monthlyFundEnabled: boolean;
      monthlyFundAmount?: number;
      stripeSubscriptionId?: string;
    },
  ): Promise<CreditAutoReload> {
    return this.creditAutoReloadRepository.upsertSettings(ctx, data);
  }

  async disableMonthlyFund(ctx: OwnershipContext): Promise<CreditAutoReload> {
    const settings = await this.creditAutoReloadRepository.getSettings(ctx);

    if (settings?.stripeSubscriptionId) {
      await this.stripeService.cancelSubscription(
        settings.stripeSubscriptionId,
      );
    }

    return this.creditAutoReloadRepository.upsertSettings(ctx, {
      monthlyFundEnabled: false,
      monthlyFundAmount: null,
      stripeSubscriptionId: null,
    });
  }

  async findSettingsByStripeSubscription(
    subscriptionId: string,
  ): Promise<CreditAutoReload | null> {
    return this.creditAutoReloadRepository.findByStripeSubscriptionId(
      subscriptionId,
    );
  }

  // --- Auto-reload trigger ---

  private async checkAutoReload(
    ctx: OwnershipContext,
    currentBalance: number,
  ): Promise<void> {
    const settings = await this.creditAutoReloadRepository.getSettings(ctx);

    if (
      !settings?.autoReloadEnabled ||
      !settings.autoReloadAmount ||
      !settings.autoReloadThreshold
    ) {
      return;
    }

    if (currentBalance >= settings.autoReloadThreshold) {
      return;
    }

    try {
      await this.stripeService.chargeOffSession(
        ctx.userId,
        settings.autoReloadAmount,
        ctx.organizationId ?? undefined,
      );
      console.log(
        `🔄 Auto-reload triggered for user ${ctx.userId}: $${settings.autoReloadAmount}`,
      );
    } catch (err) {
      console.error(
        `❌ Auto-reload charge failed for user ${ctx.userId}:`,
        err,
      );
    }
  }
}
