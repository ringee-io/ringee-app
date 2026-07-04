import { Injectable } from "@nestjs/common";
import { CreditTopup, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class CreditTopupRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotently records a completed credit top-up.
   *
   * Returns the freshly created row, or `null` when a row already exists for
   * this checkout session (or payment intent). The unique constraints on
   * `stripeCheckoutSessionId` / `stripePaymentIntentId` are the durable guard:
   * if Stripe replays `checkout.session.completed`, the second insert hits a
   * P2002 and we return `null` so the caller skips re-crediting the balance.
   *
   * `stripeCheckoutSessionId` is nullable so PaymentIntent-only top-ups
   * (saved-card recharge, auto-reload) can be recorded — those rely on
   * `stripePaymentIntentId` for the uniqueness guard instead.
   */
  async recordIfNew(data: {
    userId: string | null;
    organizationId: string | null;
    amount: number;
    amountCents: number;
    stripeCheckoutSessionId: string | null;
    stripePaymentIntentId: string | null;
    source?: string | null;
  }): Promise<CreditTopup | null> {
    try {
      return await this.prisma.creditTopup.create({
        data: {
          userId: data.userId,
          organizationId: data.organizationId,
          amount: data.amount,
          amountCents: data.amountCents,
          stripeCheckoutSessionId: data.stripeCheckoutSessionId,
          stripePaymentIntentId: data.stripePaymentIntentId,
          source: data.source ?? null,
          status: "completed",
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return null;
      }
      throw err;
    }
  }

  async findByCheckoutSessionId(
    stripeCheckoutSessionId: string,
  ): Promise<CreditTopup | null> {
    return this.prisma.creditTopup.findUnique({
      where: { stripeCheckoutSessionId },
    });
  }
}
