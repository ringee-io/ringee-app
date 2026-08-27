import { Injectable, BadRequestException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  Credit,
  CreditAutoReload,
  CreditRepository,
  CreditAutoReloadRepository,
} from "@ringee/database";
import { OwnershipContext, StripeService } from "@ringee/platform";
import { UserService } from "./user.service";
import { OrganizationService } from "./organization.service";

/** Identifies a debit in the `CreditDebit` ledger. */
export interface CreditDebitRef {
  idempotencyKey: string;
  source: string;
}

/**
 * Builds a debit ref for a cost that was ALREADY incurred by an upstream
 * provider call (an AI completion, a per-request API charge).
 *
 * Such a charge has no natural replay key: if the work runs twice the provider
 * billed us twice, so the second debit is a new cost, not a duplicate of the
 * first. The unique suffix keeps every one of them in the ledger instead of
 * letting them collapse into a single row — or, worse, skip the ledger.
 *
 * Do NOT use this for settlement events a provider can redeliver (call cost,
 * message cost, Stripe webhooks). Those must key on the thing being paid for so
 * a redelivery is refused — see `call-cost:<callId>`.
 */
export function incurredCostDebitRef(
  subject: string,
  source: string,
): CreditDebitRef {
  return { idempotencyKey: `${subject}:${randomUUID()}`, source };
}

/** Shape returned to the "monthly funding active" UI. */
export interface MonthlyFundSummary {
  enabled: boolean;
  amount: number | null;
  nextChargeDate: Date | null;
  cancelAtPeriodEnd: boolean;
  status: string | null;
  paymentMethod: { brand: string | null; last4: string | null } | null;
}

@Injectable()
export class CreditService {
  constructor(
    private readonly creditRepository: CreditRepository,
    private readonly creditAutoReloadRepository: CreditAutoReloadRepository,
    private readonly stripeService: StripeService,
    private readonly userService: UserService,
    private readonly organizationService: OrganizationService,
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

  /**
   * Unledgered balance increment.
   *
   * @deprecated Prefer {@link grantCreditsOnce} (ledgered + idempotent) or
   * {@link creditTopupOnce} (Stripe purchases). Retained only for callers that
   * predate the ledger; do not add new ones.
   */
  async addCredits(ctx: OwnershipContext, amount: number): Promise<Credit> {
    if (amount <= 0) {
      throw new BadRequestException("The amount must be positive.");
    }

    return this.creditRepository.updateBalance(ctx, amount);
  }

  /**
   * Credits a confirmed Stripe top-up EXACTLY ONCE.
   *
   * The only path that adds top-up credits (one-time, saved-card, auto-reload,
   * AND monthly-fund cycles), called exclusively from the Stripe webhook after
   * the payment is confirmed. The CreditTopup ledger row and the balance move
   * in one transaction (`CreditRepository.topupOnce`): if the row already
   * exists (Stripe retried the webhook, or two events reference the same
   * payment intent), it returns `false` WITHOUT touching the balance. Returns
   * `true` only when the balance was actually credited, so the caller can gate
   * side effects (notifications, analytics, re-arming auto-reload) on a
   * genuine, first-time credit.
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

    const { credited } = await this.creditRepository.topupOnce(ctx, amount, {
      stripeCheckoutSessionId: ref.checkoutSessionId,
      stripePaymentIntentId: ref.paymentIntentId,
      source: ref.source ?? null,
    });

    return credited;
  }

  /**
   * Adds credits EXACTLY ONCE for a non-purchase grant (offer rewards,
   * promotional credits, goodwill).
   *
   * The counterpart of `creditTopupOnce` for money Ringee gives away rather
   * than sells. Every such grant must come through here so there is a single
   * audited path into a balance: the `CreditGrant` ledger records the
   * idempotency key and the increment in one transaction. `granted: false`
   * means the key was already spent and the balance was left alone — callers
   * can gate side effects on it.
   */
  async grantCreditsOnce(
    ctx: OwnershipContext,
    amount: number,
    ref: {
      idempotencyKey: string;
      source: string;
      metadata?: Record<string, unknown> | null;
    },
  ): Promise<{ balance: number; granted: boolean }> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("The amount must be a positive number.");
    }
    if (!ref.idempotencyKey.trim() || !ref.source.trim()) {
      throw new BadRequestException(
        "Grant idempotency key and source must not be empty.",
      );
    }

    const { credit, granted } = await this.creditRepository.grantOnce(
      ctx,
      amount,
      ref,
    );

    return { balance: credit.amount, granted };
  }

  /**
   * Debits a balance EXACTLY ONCE per idempotency key.
   *
   * `ref` is REQUIRED so every debit lands in the `CreditDebit` ledger and the
   * ledger always reconciles with the balance — a debit with no key would take
   * an unaudited path and silently reopen that gap.
   *
   * Two shapes of key, both legitimate:
   *  - A key derived from the thing being paid for (`call-cost:<callId>`)
   *    protects against a provider redelivering the same settlement event.
   *  - A key unique per invocation (see {@link incurredCostDebitRef}) is
   *    correct when the cost
   *    was already incurred upstream, so a retry is a NEW cost rather than a
   *    replay of the same one.
   */
  async consumeCredits(
    ctx: OwnershipContext,
    amount: number,
    ref: { idempotencyKey: string; source: string },
  ): Promise<Credit> {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException(
        "The amount must be a finite positive number.",
      );
    }
    if (!ref.idempotencyKey.trim() || !ref.source.trim()) {
      throw new BadRequestException(
        "Debit idempotency key and source must not be empty.",
      );
    }

    const result = await this.creditRepository.consumeOnce(ctx, amount, ref);

    // A replay must not re-trigger side effects either.
    if (result.debited) {
      this.checkAutoReload(ctx, result.credit.amount).catch((err) =>
        console.error("Auto-reload check failed:", err),
      );
    }

    return result.credit;
  }

  /** Resolve the caller's stored Stripe customer id (never creates one). */
  private async resolveCustomerId(
    ctx: OwnershipContext,
  ): Promise<string | null> {
    if (ctx.organizationId) {
      const org = await this.organizationService.getOrganizationById(
        ctx.organizationId,
      );
      return org?.customerId ?? null;
    }
    const user = await this.userService.getUserById(ctx.userId);
    return user?.customerId ?? null;
  }

  // --- Monthly fund (Stripe subscription) ---

  /**
   * Snapshot for the "monthly funding active" view. Returns `{enabled:false}`
   * when there's no active subscription; otherwise pulls the next charge date,
   * amount, and card on file straight from Stripe.
   */
  async getMonthlyFundSummary(
    ctx: OwnershipContext,
  ): Promise<MonthlyFundSummary> {
    const settings = await this.creditAutoReloadRepository.getSettings(ctx);
    if (!settings?.monthlyFundEnabled || !settings.stripeSubscriptionId) {
      return {
        enabled: false,
        amount: settings?.monthlyFundAmount ?? null,
        nextChargeDate: null,
        cancelAtPeriodEnd: false,
        status: null,
        paymentMethod: null,
      };
    }

    try {
      const sub = await this.stripeService.getSubscriptionSummary(
        settings.stripeSubscriptionId,
      );
      return {
        enabled: true,
        amount: sub.amountUsd ?? settings.monthlyFundAmount ?? null,
        nextChargeDate: sub.nextChargeDate,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        status: sub.status,
        paymentMethod: sub.paymentMethod,
      };
    } catch (err) {
      console.error("Failed to load monthly fund summary:", err);
      return {
        enabled: true,
        amount: settings.monthlyFundAmount ?? null,
        nextChargeDate: null,
        cancelAtPeriodEnd: false,
        status: null,
        paymentMethod: null,
      };
    }
  }

  /** Change the monthly amount of an active credit-funding subscription. */
  async updateMonthlyFundAmount(
    ctx: OwnershipContext,
    amount: number,
  ): Promise<CreditAutoReload> {
    if (amount < 0.5) {
      throw new BadRequestException("Monthly amount must be at least $0.50.");
    }
    const settings = await this.creditAutoReloadRepository.getSettings(ctx);
    if (!settings?.stripeSubscriptionId || !settings.monthlyFundEnabled) {
      throw new BadRequestException("No active monthly funding to update.");
    }
    await this.stripeService.updateMonthlyCreditSubscriptionAmount(
      settings.stripeSubscriptionId,
      amount,
    );
    return this.creditAutoReloadRepository.upsertSettings(ctx, {
      monthlyFundAmount: amount,
    });
  }

  async updateMonthlyFundSettings(
    ctx: OwnershipContext,
    data: {
      monthlyFundEnabled: boolean;
      monthlyFundAmount?: number | null;
      stripeSubscriptionId?: string | null;
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
    // Keep the status column consistent with the enabled flag. Toggling OFF
    // disables; editing an enabled reload re-arms it to `active` (also clears a
    // previous `failed` / `requires_payment_method` state on an explicit edit).
    const patch: Parameters<CreditAutoReloadRepository["upsertSettings"]>[1] = {
      ...data,
    };
    if (data.autoReloadEnabled === false) {
      patch.autoReloadStatus = "disabled";
    } else if (
      data.autoReloadEnabled === true ||
      data.autoReloadThreshold !== undefined ||
      data.autoReloadAmount !== undefined
    ) {
      patch.autoReloadStatus = "active";
    }
    return this.creditAutoReloadRepository.upsertSettings(ctx, patch);
  }

  /**
   * Config-only enable of balance-drop auto-reload. Requires the caller to
   * already have a saved card (resolved authoritatively from their Stripe
   * customer) — it does NOT charge at setup. Persists an explicit, separate
   * consent timestamp and arms the reload (`active`). Throws if there is no
   * saved payment method so the UI can route the user through card setup first.
   */
  async enableAutoReload(
    ctx: OwnershipContext,
    params: { threshold: number; reloadAmount: number },
  ): Promise<CreditAutoReload> {
    const customerId = await this.resolveCustomerId(ctx);
    const pm = customerId
      ? await this.stripeService.getSavedPaymentMethod(customerId)
      : null;

    if (!pm?.hasSavedMethod) {
      throw new BadRequestException({
        code: "requires_payment_method",
        message: "Add a saved payment method before turning on auto-reload.",
      });
    }

    return this.creditAutoReloadRepository.upsertSettings(ctx, {
      autoReloadEnabled: true,
      autoReloadThreshold: params.threshold,
      autoReloadAmount: params.reloadAmount,
      autoReloadStatus: "active",
      autoReloadConsentAt: new Date(),
    });
  }

  async disableAutoReload(ctx: OwnershipContext): Promise<CreditAutoReload> {
    return this.creditAutoReloadRepository.upsertSettings(ctx, {
      autoReloadEnabled: false,
      autoReloadStatus: "disabled",
    });
  }

  /**
   * Re-arm auto-reload to `active` after a confirmed reload credit. Called from
   * the webhook AFTER the balance is topped up, so re-arming can never race a
   * still-low balance into a second charge.
   */
  async reArmAutoReload(
    ctx: OwnershipContext,
    paymentIntentId: string,
  ): Promise<void> {
    await this.creditAutoReloadRepository.setStatus(ctx, "active", {
      lastChargeAt: new Date(),
      lastPaymentIntentId: paymentIntentId,
    });
  }

  /**
   * Mark auto-reload as failed. `requiresNewMethod` moves it to
   * `requires_payment_method` (card needs replacing / re-auth) vs a plain
   * `failed` (transient decline). Either way the reload stops firing until the
   * user acts — the drawer surfaces the status.
   */
  async markAutoReloadFailed(
    ctx: OwnershipContext,
    requiresNewMethod = false,
  ): Promise<void> {
    await this.creditAutoReloadRepository.setStatus(
      ctx,
      requiresNewMethod ? "requires_payment_method" : "failed",
    );
  }

  /** Clear a failed auto-reload back to `active` (e.g. after a new card). */
  async resetAutoReloadStatusIfFailed(ctx: OwnershipContext): Promise<void> {
    const settings = await this.creditAutoReloadRepository.getSettings(ctx);
    if (
      settings?.autoReloadEnabled &&
      (settings.autoReloadStatus === "failed" ||
        settings.autoReloadStatus === "requires_payment_method")
    ) {
      await this.creditAutoReloadRepository.setStatus(ctx, "active");
    }
  }

  // --- Auto-reload trigger ---

  /**
   * Fire an off-session reload when the balance drops below the threshold.
   *
   * Concurrency-safe: the balance/status guards short-circuit the common case,
   * and the atomic `active -> charging` CAS (`tryBeginAutoReload`) guarantees
   * exactly one of many simultaneous `consumeCredits` calls performs the charge.
   * The winner leaves the status at `charging`; the confirmed webhook credits
   * the balance and re-arms to `active`, so we never re-charge before the credit
   * lands. Credits are added ONLY by the webhook — never here.
   */
  private async checkAutoReload(
    ctx: OwnershipContext,
    currentBalance: number,
  ): Promise<void> {
    const settings = await this.creditAutoReloadRepository.getSettings(ctx);

    if (
      !settings?.autoReloadEnabled ||
      !settings.autoReloadAmount ||
      !settings.autoReloadThreshold ||
      settings.autoReloadStatus !== "active"
    ) {
      return;
    }

    if (currentBalance >= settings.autoReloadThreshold) {
      return;
    }

    // Atomic lock: only the caller that flips `active -> charging` proceeds.
    const won = await this.creditAutoReloadRepository.tryBeginAutoReload(ctx);
    if (!won) {
      return;
    }

    const customerId = await this.resolveCustomerId(ctx);
    const pm = customerId
      ? await this.stripeService.getSavedPaymentMethod(customerId)
      : null;

    if (!customerId || !pm?.hasSavedMethod || !pm.paymentMethodId) {
      await this.creditAutoReloadRepository.setStatus(
        ctx,
        "requires_payment_method",
      );
      console.error(
        `⚠️ Auto-reload has no saved card for user ${ctx.userId}; marked requires_payment_method`,
      );
      return;
    }

    try {
      // Belt-and-suspenders against a duplicate charge on top of the DB lock:
      // a stable per-minute key so a retried call is a Stripe no-op.
      const idempotencyKey = `autoreload:${settings.id}:${Math.floor(
        Date.now() / 60000,
      )}`;
      const res = await this.stripeService.createAutoReloadCharge({
        userId: ctx.userId,
        customerId,
        paymentMethodId: pm.paymentMethodId,
        amountUsd: settings.autoReloadAmount,
        thresholdUsd: settings.autoReloadThreshold,
        organizationId: ctx.organizationId ?? undefined,
        idempotencyKey,
      });

      // Stay `charging`; record the intent. The webhook credits then re-arms to
      // `active` — re-arming here would let a concurrent consume re-charge
      // before the (webhook-only) credit lands.
      await this.creditAutoReloadRepository.setStatus(ctx, "charging", {
        lastPaymentIntentId: res.paymentIntentId,
        lastChargeAt: new Date(),
      });
      console.log(
        `🔄 Auto-reload charge started for user ${ctx.userId}: $${settings.autoReloadAmount} (${res.status})`,
      );
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const requiresNewMethod =
        code === "authentication_required" ||
        code === "payment_method_unactivated";
      await this.creditAutoReloadRepository.setStatus(
        ctx,
        requiresNewMethod ? "requires_payment_method" : "failed",
      );
      console.error(
        `❌ Auto-reload charge failed for user ${ctx.userId}:`,
        err,
      );
    }
  }
}
