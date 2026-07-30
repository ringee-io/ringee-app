import { Injectable } from "@nestjs/common";
import { Credit, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";

export interface CreditDebitReference {
  idempotencyKey: string;
  source: string;
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
