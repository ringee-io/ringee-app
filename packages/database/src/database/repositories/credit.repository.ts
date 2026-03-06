import { Injectable } from "@nestjs/common";
import { Credit } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";

@Injectable()
export class CreditRepository {
  constructor(private readonly prisma: PrismaService) { }

  async getOrCreateCredit(ctx: OwnershipContext): Promise<Credit> {
    const ownershipFilter = buildOwnershipFilter(ctx);
    let credit = await this.prisma.credit.findFirst({
      where: ownershipFilter,
    });

    if (!credit) {
      credit = await this.prisma.credit.create({
        data: {
          amount: 0,
          user: ctx.organizationId ? undefined : { connect: { id: ctx.userId } },
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

    const newBalance = existing.amount + amount;

    return this.prisma.credit.update({
      where: { id: existing.id },
      data: {
        amount: newBalance,
        ...(amount > 0
          ? {
            lastPurchaseDate: new Date(),
            lastPurchaseAmount: existing.amount,
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
}
