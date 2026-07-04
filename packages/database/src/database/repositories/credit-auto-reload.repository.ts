import { Injectable } from "@nestjs/common";
import { CreditAutoReload } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";

/** Discrete lifecycle of the balance-drop auto-reload. */
export type AutoReloadStatus =
  | "disabled"
  | "active"
  | "charging"
  | "failed"
  | "requires_payment_method";

@Injectable()
export class CreditAutoReloadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(ctx: OwnershipContext): Promise<CreditAutoReload | null> {
    const ownershipFilter = buildOwnershipFilter(ctx);
    return this.prisma.creditAutoReload.findFirst({
      where: ownershipFilter,
    });
  }

  async upsertSettings(
    ctx: OwnershipContext,
    data: Partial<
      Pick<
        CreditAutoReload,
        | "autoReloadEnabled"
        | "autoReloadThreshold"
        | "autoReloadAmount"
        | "autoReloadStatus"
        | "autoReloadConsentAt"
        | "autoReloadLastChargeAt"
        | "autoReloadLastPaymentIntentId"
        | "monthlyFundEnabled"
        | "monthlyFundAmount"
        | "stripeSubscriptionId"
      >
    >,
  ): Promise<CreditAutoReload> {
    const existing = await this.getSettings(ctx);

    if (existing) {
      return this.prisma.creditAutoReload.update({
        where: { id: existing.id },
        data,
      });
    }

    return this.prisma.creditAutoReload.create({
      data: {
        ...data,
        user: ctx.organizationId ? undefined : { connect: { id: ctx.userId } },
        organization: ctx.organizationId
          ? { connect: { id: ctx.organizationId } }
          : undefined,
      },
    });
  }

  /**
   * Concurrency lock for the balance-drop reload.
   *
   * Atomically flips the owner's row from `active` to `charging` and reports
   * whether THIS caller won the transition. Because it is a single conditional
   * `updateMany`, Postgres serializes concurrent callers on the row: exactly one
   * sees `count === 1` and proceeds to charge; every other simultaneous
   * `consumeCredits` that dropped the balance below the threshold sees `count
   * === 0` and bails. This is what prevents duplicate auto-reload charges when
   * several calls end at once. The row is re-armed to `active` by the confirmed
   * webhook (or marked `failed` on decline).
   */
  async tryBeginAutoReload(ctx: OwnershipContext): Promise<boolean> {
    const { count } = await this.prisma.creditAutoReload.updateMany({
      where: {
        ...buildOwnershipFilter(ctx),
        autoReloadEnabled: true,
        autoReloadStatus: "active",
      },
      data: { autoReloadStatus: "charging" },
    });
    return count === 1;
  }

  /**
   * Set the auto-reload status for the owner, optionally recording the charge
   * timestamp / payment-intent id. Used to re-arm (`active`) after a confirmed
   * webhook, or to move to `failed` / `requires_payment_method` on decline.
   */
  async setStatus(
    ctx: OwnershipContext,
    status: AutoReloadStatus,
    extra?: {
      lastChargeAt?: Date | null;
      lastPaymentIntentId?: string | null;
    },
  ): Promise<void> {
    await this.prisma.creditAutoReload.updateMany({
      where: buildOwnershipFilter(ctx),
      data: {
        autoReloadStatus: status,
        ...(extra?.lastChargeAt !== undefined
          ? { autoReloadLastChargeAt: extra.lastChargeAt }
          : {}),
        ...(extra?.lastPaymentIntentId !== undefined
          ? { autoReloadLastPaymentIntentId: extra.lastPaymentIntentId }
          : {}),
      },
    });
  }

  async findByStripeSubscriptionId(
    subscriptionId: string,
  ): Promise<CreditAutoReload | null> {
    return this.prisma.creditAutoReload.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
    });
  }
}
