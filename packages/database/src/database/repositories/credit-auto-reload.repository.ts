import { Injectable } from "@nestjs/common";
import { CreditAutoReload } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";

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
        user: ctx.organizationId
          ? undefined
          : { connect: { id: ctx.userId } },
        organization: ctx.organizationId
          ? { connect: { id: ctx.organizationId } }
          : undefined,
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
