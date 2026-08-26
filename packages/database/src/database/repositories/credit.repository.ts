import { Injectable } from "@nestjs/common";
import { Credit, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";

export interface CreditDebitReference {
  idempotencyKey: string;
  source: string;
}

export interface CreditGrantReference {
  idempotencyKey: string;
  source: string;
  metadata?: Record<string, unknown> | null;
}

export interface CreditTopupReference {
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  source?: string | null;
}

type CreditDebitTransactionClient = {
  creditDebit: {
    create(input: {
      data: {
        userId: string | null;
        organizationId: string | null;
        amount: number;
        balanceBefore: number;
        balanceAfter: number;
        idempotencyKey: string;
        source: string;
      };
    }): Promise<unknown>;
  };
};

@Injectable()
export class CreditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateCredit(ctx: OwnershipContext): Promise<Credit> {
    const ownershipFilter = buildOwnershipFilter(ctx);
    let credit = await this.prisma.credit.findFirst({
      where: ownershipFilter,
    });

    if (!credit) {
      credit = await this.prisma.credit.create({
        data: {
          amount: 0,
          user: ctx.organizationId
            ? undefined
            : { connect: { id: ctx.userId } },
          organization: ctx.organizationId
            ? { connect: { id: ctx.organizationId } }
            : undefined,
        },
      });
    }

    return credit;
  }

  async updateBalance(ctx: OwnershipContext, amount: number): Promise<Credit> {
    const existing = await this.getOrCreateCredit(ctx);

    return this.prisma.credit.update({
      where: { id: existing.id },
      data: {
        // Atomic at the database level: concurrent calls/pipelines must each
        // contribute their own debit instead of overwriting a stale balance.
        amount: { increment: amount },
        ...(amount > 0
          ? {
              lastPurchaseDate: new Date(),
              // The amount added this time (the top-up), not the prior balance.
              lastPurchaseAmount: amount,
            }
          : {}),
      },
    });
  }

  /**
   * Atomically records an idempotency key and decrements the balance.
   *
   * A duplicate key returns the current balance without applying another
   * decrement. Recording the key and moving the balance share a transaction,
   * so a crash cannot leave one committed without the other.
   */
  async consumeOnce(
    ctx: OwnershipContext,
    amount: number,
    ref: CreditDebitReference,
  ): Promise<{ credit: Credit; debited: boolean }> {
    try {
      const credit = await this.prisma.$transaction(async (tx) => {
        // The cast keeps this package buildable before `prisma generate` runs
        // in a fresh checkout; the generated client contains this model after
        // the migration/schema update is applied.
        const debitTx = tx as unknown as CreditDebitTransactionClient;
        const ownershipFilter = buildOwnershipFilter(ctx);
        let existing = await tx.credit.findFirst({
          where: ownershipFilter,
        });
        if (!existing) {
          existing = await tx.credit.create({
            data: {
              amount: 0,
              user: ctx.organizationId
                ? undefined
                : { connect: { id: ctx.userId } },
              organization: ctx.organizationId
                ? { connect: { id: ctx.organizationId } }
                : undefined,
            },
          });
        }

        const creditAfterDebit = await tx.credit.update({
          where: { id: existing.id },
          data: { amount: { increment: -amount } },
        });

        await debitTx.creditDebit.create({
          data: {
            userId: ctx.userId ?? null,
            organizationId: ctx.organizationId ?? null,
            amount,
            balanceBefore: creditAfterDebit.amount + amount,
            balanceAfter: creditAfterDebit.amount,
            idempotencyKey: ref.idempotencyKey,
            source: ref.source,
          },
        });

        return creditAfterDebit;
      });

      return { credit, debited: true };
    } catch (error) {
      if (!this.isDuplicateDebitKey(error)) {
        throw error;
      }
      return {
        credit: await this.getOrCreateCredit(ctx),
        debited: false,
      };
    }
  }

  /**
   * Atomically records an idempotency key and increments the balance.
   *
   * The credit mirror of `consumeOnce`, for grants that are NOT Stripe
   * purchases (offer rewards, promotional credits). The unique key and the
   * increment share a transaction, so a retried approval, a double-clicked
   * button, or two processes racing on the same grant can only ever add the
   * amount once. `granted: false` means the key was already spent.
   */
  async grantOnce(
    ctx: OwnershipContext,
    amount: number,
    ref: CreditGrantReference,
  ): Promise<{ credit: Credit; granted: boolean }> {
    try {
      const credit = await this.prisma.$transaction(async (tx) => {
        const ownershipFilter = buildOwnershipFilter(ctx);
        let existing = await tx.credit.findFirst({ where: ownershipFilter });
        if (!existing) {
          existing = await tx.credit.create({
            data: {
              amount: 0,
              user: ctx.organizationId
                ? undefined
                : { connect: { id: ctx.userId } },
              organization: ctx.organizationId
                ? { connect: { id: ctx.organizationId } }
                : undefined,
            },
          });
        }

        const creditAfterGrant = await tx.credit.update({
          where: { id: existing.id },
          data: { amount: { increment: amount } },
        });

        await tx.creditGrant.create({
          data: {
            userId: ctx.userId ?? null,
            organizationId: ctx.organizationId ?? null,
            amount,
            balanceBefore: creditAfterGrant.amount - amount,
            balanceAfter: creditAfterGrant.amount,
            idempotencyKey: ref.idempotencyKey,
            source: ref.source,
            metadata: (ref.metadata ?? undefined) as never,
          },
        });

        return creditAfterGrant;
      });

      return { credit, granted: true };
    } catch (error) {
      if (!this.isDuplicateDebitKey(error)) {
        throw error;
      }
      return {
        credit: await this.getOrCreateCredit(ctx),
        granted: false,
      };
    }
  }

  /**
   * Atomically records a completed Stripe top-up and increments the balance.
   *
   * The purchase counterpart of `grantOnce`. The `CreditTopup` row and the
   * balance move share ONE transaction: recording the row first and crediting
   * afterwards (as this used to do across two calls) means a crash in between
   * leaves a ledger row for money the customer never received — and the Stripe
   * replay that would have fixed it sees the row and skips the credit.
   *
   * Uniqueness comes from `stripeCheckoutSessionId` / `stripePaymentIntentId`,
   * so a replayed `checkout.session.completed` returns `credited: false` with
   * the balance untouched.
   */
  async topupOnce(
    ctx: OwnershipContext,
    amount: number,
    ref: CreditTopupReference,
  ): Promise<{ credit: Credit; credited: boolean }> {
    try {
      const credit = await this.prisma.$transaction(async (tx) => {
        const ownershipFilter = buildOwnershipFilter(ctx);
        let existing = await tx.credit.findFirst({ where: ownershipFilter });
        if (!existing) {
          existing = await tx.credit.create({
            data: {
              amount: 0,
              user: ctx.organizationId
                ? undefined
                : { connect: { id: ctx.userId } },
              organization: ctx.organizationId
                ? { connect: { id: ctx.organizationId } }
                : undefined,
            },
          });
        }

        // Written before the increment so a replayed Stripe event aborts the
        // transaction on the unique constraint, leaving the balance alone.
        await tx.creditTopup.create({
          data: {
            userId: ctx.userId ?? null,
            organizationId: ctx.organizationId ?? null,
            amount,
            amountCents: Math.round(amount * 100),
            stripeCheckoutSessionId: ref.stripeCheckoutSessionId,
            stripePaymentIntentId: ref.stripePaymentIntentId,
            source: ref.source ?? null,
            status: "completed",
          },
        });

        return tx.credit.update({
          where: { id: existing.id },
          data: {
            amount: { increment: amount },
            lastPurchaseDate: new Date(),
            // The amount added this time (the top-up), not the prior balance.
            lastPurchaseAmount: amount,
          },
        });
      });

      return { credit, credited: true };
    } catch (error) {
      if (!this.isDuplicateTopupRef(error)) {
        throw error;
      }
      return {
        credit: await this.getOrCreateCredit(ctx),
        credited: false,
      };
    }
  }

  async getBalance(ctx: OwnershipContext): Promise<number> {
    const ownershipFilter = buildOwnershipFilter(ctx);
    const credit = await this.prisma.credit.findFirst({
      where: ownershipFilter,
    });
    return credit?.amount ?? 0;
  }

  async getCredit(ctx: OwnershipContext): Promise<Credit | null> {
    const ownershipFilter = buildOwnershipFilter(ctx);
    return this.prisma.credit.findFirst({ where: ownershipFilter });
  }

  /**
   * A P2002 on the top-up's Stripe columns means the webhook was replayed. A
   * P2002 raised anywhere else in that transaction — two requests racing to
   * create the same workspace's `Credit` row — must NOT be read as "already
   * credited", or a real top-up would be silently dropped.
   */
  private isDuplicateTopupRef(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      return false;
    }
    const target = error.meta?.target;
    const columns = Array.isArray(target) ? target.join(",") : String(target);
    return (
      columns.includes("stripeCheckoutSessionId") ||
      columns.includes("stripePaymentIntentId")
    );
  }

  /** Shared by `consumeOnce` and `grantOnce` — both ledgers key on the same column. */
  private isDuplicateDebitKey(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      return false;
    }
    const target = error.meta?.target;
    return Array.isArray(target)
      ? target.includes("idempotencyKey")
      : String(target).includes("idempotencyKey");
  }
}
