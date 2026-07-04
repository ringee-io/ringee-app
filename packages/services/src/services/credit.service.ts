import { Injectable, BadRequestException } from "@nestjs/common";
import {
  Credit,
  CreditAutoReload,
  CreditRepository,
  CreditAutoReloadRepository,
  CreditTopupRepository,
} from "@ringee/database";
import { OwnershipContext, StripeService } from "@ringee/platform";

@Injectable()
export class CreditService {
  constructor(
    private readonly creditRepository: CreditRepository,
    private readonly creditAutoReloadRepository: CreditAutoReloadRepository,
    private readonly creditTopupRepository: CreditTopupRepository,
    private readonly stripeService: StripeService,
  ) {}

  async getBalance(ctx: OwnershipContext): Promise<number> {
    return this.creditRepository.getBalance(ctx);
  }

  /**
   * Balance plus the last top-up (amount + date), so the recharge UI can
   * suggest the previous amount as the default and show a "Last top-up: $X"
   * hint. Both last-top-up fields are null before the first purchase.
   */
  async getBalanceSummary(ctx: OwnershipContext): Promise<{
    balance: number;
    lastTopupAmount: number | null;
    lastTopupAt: Date | null;
  }> {
    const credit = await this.creditRepository.getCredit(ctx);
    return {
      balance: credit?.amount ?? 0,
      lastTopupAmount: credit?.lastPurchaseAmount ?? null,
      lastTopupAt: credit?.lastPurchaseDate ?? null,
    };
  }

  async addCredits(ctx: OwnershipContext, amount: number): Promise<Credit> {
    if (amount <= 0) {
      throw new BadRequestException("The amount must be positive.");
    }

    return this.creditRepository.updateBalance(ctx, amount);
  }

  /**
   * Credits a confirmed Stripe top-up EXACTLY ONCE.
   *
   * This is the only path that adds one-time top-up credits, and it is called
   * exclusively from the Stripe webhook after the payment is confirmed. It first
   * records the checkout session in the CreditTopup ledger; if that row already
   * exists (Stripe retried the webhook, or two events reference the same
   * payment intent), it returns `false` WITHOUT touching the balance. Returns
   * `true` only when the balance was actually credited, so the caller can gate
   * side effects (notifications, analytics) on a genuine, first-time credit.
   */
  async creditTopupOnce(
    ctx: OwnershipContext,
    amount: number,
    ref: {
      checkoutSessionId: string | null;
      paymentIntentId: string | null;
      source?: string | null;
    },
  ): Promise<boolean> {
    if (amount <= 0) {
      throw new BadRequestException("The amount must be positive.");
    }

    const recorded = await this.creditTopupRepository.recordIfNew({
      userId: ctx.userId ?? null,
      organizationId: ctx.organizationId ?? null,
      amount,
      amountCents: Math.round(amount * 100),
      stripeCheckoutSessionId: ref.checkoutSessionId,
      stripePaymentIntentId: ref.paymentIntentId,
      source: ref.source ?? null,
    });

    if (!recorded) {
      return false;
    }

    await this.creditRepository.updateBalance(ctx, amount);
    return true;
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
