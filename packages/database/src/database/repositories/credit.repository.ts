import { Injectable } from "@nestjs/common";
import { Credit } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";

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
}
