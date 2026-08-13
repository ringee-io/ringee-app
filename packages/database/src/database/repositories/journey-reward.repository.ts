import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";

/**
 * Journey stage rewards — the redemption ledger behind `/dashboard/journey`.
 *
 * A claim and its wallet credit are committed in one transaction, and the
 * ownership+stage unique constraint on `JourneyRewardClaim` is the idempotency
 * lock: a double-click, a retried request or two admins redeeming at once can
 * never pay the same stage reward twice.
 */

export interface JourneyRewardClaimRecord {
  id: string;
  userId: string | null;
  organizationId: string | null;
  stageId: string;
  amount: number;
  claimedByUserId: string | null;
  createdAt: Date;
}

// The cast keeps this package buildable before `prisma generate` runs in a
// fresh checkout; the generated client contains this model after the schema
// update is applied.
type JourneyRewardClaimDelegate = {
  findMany(input: {
    where: Record<string, unknown>;
  }): Promise<JourneyRewardClaimRecord[]>;
  create(input: {
    data: {
      userId: string | null;
      organizationId: string | null;
      stageId: string;
      amount: number;
      claimedByUserId: string | null;
    };
  }): Promise<JourneyRewardClaimRecord>;
};

type JourneyRewardClient = { journeyRewardClaim: JourneyRewardClaimDelegate };

@Injectable()
export class JourneyRewardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listClaims(ctx: OwnershipContext): Promise<JourneyRewardClaimRecord[]> {
    return (
      this.prisma as unknown as JourneyRewardClient
    ).journeyRewardClaim.findMany({ where: buildOwnershipFilter(ctx) });
  }

  /**
   * Atomically records the claim and credits the workspace wallet.
   *
   * A duplicate claim (same workspace, same stage) returns `claimed: false`
   * with the untouched balance instead of paying again.
   */
  async claimOnce(
    ctx: OwnershipContext,
    input: { stageId: string; amount: number; claimedByUserId: string },
  ): Promise<{ claimed: boolean; balance: number }> {
    try {
      const balance = await this.prisma.$transaction(async (tx) => {
        await (tx as unknown as JourneyRewardClient).journeyRewardClaim.create({
          data: {
            userId: ctx.organizationId ? null : ctx.userId,
            organizationId: ctx.organizationId ?? null,
            stageId: input.stageId,
            amount: input.amount,
            claimedByUserId: input.claimedByUserId,
          },
        });

        // Same get-or-create semantics as CreditRepository, minus the
        // purchase stamps — a reward is not a top-up.
        const ownershipFilter = buildOwnershipFilter(ctx);
        let credit = await tx.credit.findFirst({ where: ownershipFilter });
        if (!credit) {
          credit = await tx.credit.create({
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

        const updated = await tx.credit.update({
          where: { id: credit.id },
          data: { amount: { increment: input.amount } },
        });

        return updated.amount;
      });

      return { claimed: true, balance };
    } catch (error) {
      if (!this.isDuplicateClaim(error)) {
        throw error;
      }
      const credit = await this.prisma.credit.findFirst({
        where: buildOwnershipFilter(ctx),
      });
      return { claimed: false, balance: credit?.amount ?? 0 };
    }
  }

  private isDuplicateClaim(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      return false;
    }
    const target = error.meta?.target;
    return Array.isArray(target)
      ? target.includes("stageId")
      : String(target).includes("stageId");
  }
}
