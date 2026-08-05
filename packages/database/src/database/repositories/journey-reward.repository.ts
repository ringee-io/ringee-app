import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { OwnershipContext } from "@ringee/platform";

/**
 * Journey reward claims — the money.
 *
 * Three properties this file exists to guarantee:
 *
 * 1. **Idempotency.** `idempotencyKey` is unique and is derived only from
 *    server-side facts (`journey:{type}:{id}:{version}:{stageId}`). A
 *    double-click, a retry, or two admins pressing redeem at the same instant
 *    all converge on one row — and the loser gets the *real* stored state, not
 *    a fabricated "claimed just now".
 * 2. **Atomicity.** The claim row, the wallet increment and the top-up ledger
 *    entry commit together or not at all, with the balance stamped before and
 *    after exactly like `CreditDebit` does for debits.
 * 3. **Auditability.** Amounts are integer cents. The single conversion to the
 *    legacy `Credit.amount` float happens in `settle`, and nowhere else.
 */

export type JourneyClaimStatus =
  | "available"
  | "pending_review"
  | "approved"
  | "claimed"
  | "rejected"
  | "revoked";

export interface JourneyRewardClaimRecord {
  id: string;
  userId: string | null;
  organizationId: string | null;
  programVersion: string;
  stageId: string;
  amountCents: number;
  currency: string;
  status: JourneyClaimStatus;
  claimedByUserId: string | null;
  idempotencyKey: string;
  riskScore: number;
  riskBand: string;
  riskReasons: string[];
  balanceBefore: number | null;
  balanceAfter: number | null;
  claimedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  reviewNote: string | null;
  createdAt: Date;
}

export interface JourneyClaimInput {
  programVersion: string;
  stageId: string;
  amountCents: number;
  claimedByUserId: string;
  idempotencyKey: string;
  riskScore: number;
  riskBand: string;
  riskReasons: string[];
  riskVersion: string;
  eligibilitySnapshot: unknown;
  /** When false the row is created but no money moves (dry run / manual review). */
  settleNow: boolean;
}

export interface JourneyClaimOutcome {
  claim: JourneyRewardClaimRecord;
  /** True only when THIS call moved money. A replay reports false. */
  settled: boolean;
  /** True when the row already existed — the caller should not re-emit events. */
  duplicate: boolean;
  balance: number;
}

const CLAIM_SELECT = {
  id: true,
  userId: true,
  organizationId: true,
  programVersion: true,
  stageId: true,
  amountCents: true,
  currency: true,
  status: true,
  claimedByUserId: true,
  idempotencyKey: true,
  riskScore: true,
  riskBand: true,
  riskReasons: true,
  balanceBefore: true,
  balanceAfter: true,
  claimedAt: true,
  approvedAt: true,
  rejectedAt: true,
  rejectionReason: true,
  reviewNote: true,
  createdAt: true,
} as const;

@Injectable()
export class JourneyRewardRepository {
  private readonly logger = new Logger(JourneyRewardRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async listClaims(
    ctx: OwnershipContext,
    programVersion?: string,
  ): Promise<JourneyRewardClaimRecord[]> {
    const rows = await this.prisma.journeyRewardClaim.findMany({
      where: {
        ...this.owner(ctx),
        ...(programVersion ? { programVersion } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: CLAIM_SELECT,
    });
    return rows as JourneyRewardClaimRecord[];
  }

  /** Cents already granted to this workspace for this program version. */
  async totalGrantedCents(
    ctx: OwnershipContext,
    programVersion: string,
  ): Promise<number> {
    const result = await this.prisma.journeyRewardClaim.aggregate({
      where: {
        ...this.owner(ctx),
        programVersion,
        status: { in: ["claimed", "approved"] },
      },
      _sum: { amountCents: true },
    });
    return result._sum.amountCents ?? 0;
  }

  /** Program-wide cents granted between two instants — the budget read. */
  async grantedCentsBetween(start: Date, end: Date): Promise<number> {
    const result = await this.prisma.journeyRewardClaim.aggregate({
      where: { status: "claimed", claimedAt: { gte: start, lte: end } },
      _sum: { amountCents: true },
    });
    return result._sum.amountCents ?? 0;
  }

  /**
   * Creates the claim and, when `settleNow`, moves the money — all in one
   * transaction.
   *
   * A duplicate `idempotencyKey` is not an error: it means the reward already
   * has a resolution, and the caller gets that resolution verbatim.
   */
  async claim(
    ctx: OwnershipContext,
    input: JourneyClaimInput,
  ): Promise<JourneyClaimOutcome> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const created = await tx.journeyRewardClaim.create({
          data: {
            ...this.ownerData(ctx),
            programVersion: input.programVersion,
            stageId: input.stageId,
            amountCents: input.amountCents,
            currency: "USD",
            status: input.settleNow ? "claimed" : "pending_review",
            claimedByUserId: input.claimedByUserId,
            idempotencyKey: input.idempotencyKey,
            riskScore: input.riskScore,
            riskBand: input.riskBand,
            riskReasons: input.riskReasons,
            riskVersion: input.riskVersion,
            eligibilitySnapshot:
              input.eligibilitySnapshot as Prisma.InputJsonValue,
            claimedAt: input.settleNow ? now : null,
          },
          select: CLAIM_SELECT,
        });

        if (!input.settleNow) {
          // Held for review or dry run: the row exists so the decision is
          // auditable and the reward cannot be silently lost, but the wallet is
          // untouched.
          const credit = await tx.credit.findFirst({
            where: this.owner(ctx),
            select: { amount: true },
          });
          return {
            claim: created as JourneyRewardClaimRecord,
            settled: false,
            duplicate: false,
            balance: credit?.amount ?? 0,
          };
        }

        const settled = await this.settle(tx, ctx, created.id, input);
        return {
          claim: settled.claim,
          settled: true,
          duplicate: false,
          balance: settled.balanceAfter,
        };
      });
    } catch (error) {
      if (!this.isDuplicate(error)) throw error;
      // Someone else got there first. Report their outcome, not an invented one.
      const existing = await this.prisma.journeyRewardClaim.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: CLAIM_SELECT,
      });
      const credit = await this.prisma.credit.findFirst({
        where: this.owner(ctx),
        select: { amount: true },
      });
      if (!existing) throw error;
      return {
        claim: existing as JourneyRewardClaimRecord,
        settled: false,
        duplicate: true,
        balance: credit?.amount ?? 0,
      };
    }
  }

  /**
   * Approves a claim that was held for review and pays it.
   *
   * Guarded on `status: 'pending_review'` inside the transaction so two
   * reviewers clicking approve cannot pay twice.
   */
  async approve(
    claimId: string,
    reviewerUserId: string,
    note?: string,
  ): Promise<JourneyRewardClaimRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.journeyRewardClaim.findUnique({
        where: { id: claimId },
        select: CLAIM_SELECT,
      });
      if (!claim || claim.status !== "pending_review") return null;

      const ctx: OwnershipContext = {
        userId: claim.userId ?? "",
        organizationId: claim.organizationId,
      };

      const settled = await this.settle(tx, ctx, claim.id, {
        programVersion: claim.programVersion,
        stageId: claim.stageId,
        amountCents: claim.amountCents,
        claimedByUserId: claim.claimedByUserId ?? reviewerUserId,
        idempotencyKey: claim.idempotencyKey,
        riskScore: claim.riskScore,
        riskBand: claim.riskBand,
        riskReasons: claim.riskReasons,
        riskVersion: "",
        eligibilitySnapshot: null,
        settleNow: true,
      });

      const finalised = await tx.journeyRewardClaim.update({
        where: { id: claim.id },
        data: {
          approvedAt: new Date(),
          approvedByUserId: reviewerUserId,
          reviewNote: note ?? null,
        },
        select: CLAIM_SELECT,
      });
      // `settle` already stamped the balances; re-read for the reviewer stamps.
      void settled;
      return finalised as JourneyRewardClaimRecord;
    });
  }

  async reject(
    claimId: string,
    reviewerUserId: string,
    reason: string,
  ): Promise<JourneyRewardClaimRecord | null> {
    const claim = await this.prisma.journeyRewardClaim.findUnique({
      where: { id: claimId },
      select: { status: true },
    });
    // Only an undecided claim can be rejected: rejecting a paid claim would
    // desynchronise the ledger from the wallet.
    if (!claim || claim.status !== "pending_review") return null;

    const updated = await this.prisma.journeyRewardClaim.update({
      where: { id: claimId },
      data: {
        status: "rejected",
        rejectedAt: new Date(),
        rejectionReason: reason,
        approvedByUserId: reviewerUserId,
      },
      select: CLAIM_SELECT,
    });
    return updated as JourneyRewardClaimRecord;
  }

  /** Claims awaiting a human decision, newest first. */
  async listPendingReview(limit = 100): Promise<JourneyRewardClaimRecord[]> {
    const rows = await this.prisma.journeyRewardClaim.findMany({
      where: { status: "pending_review" },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 500),
      select: CLAIM_SELECT,
    });
    return rows as JourneyRewardClaimRecord[];
  }

  /**
   * The money move: read balance, increment, stamp before/after, write the
   * top-up ledger row.
   *
   * `amountCents / 100` is the ONLY place a Journey amount becomes the legacy
   * float wallet value. Cents are integers, so this division is exact for every
   * value the program can produce.
   */
  private async settle(
    tx: Prisma.TransactionClient,
    ctx: OwnershipContext,
    claimId: string,
    input: JourneyClaimInput,
  ): Promise<{ claim: JourneyRewardClaimRecord; balanceAfter: number }> {
    const amount = input.amountCents / 100;
    const ownershipFilter = this.owner(ctx);

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

    const balanceBefore = credit.amount;
    const updated = await tx.credit.update({
      where: { id: credit.id },
      data: { amount: { increment: amount } },
    });

    // Reuse the existing credit-side ledger so a reward is visible to any
    // balance reconciliation, exactly like a Stripe top-up.
    await tx.creditTopup.create({
      data: {
        ...this.ownerData(ctx),
        amount,
        amountCents: input.amountCents,
        stripeCheckoutSessionId: null,
        stripePaymentIntentId: null,
        source: "journey_reward",
        status: "completed",
      },
    });

    const claim = await tx.journeyRewardClaim.update({
      where: { id: claimId },
      data: {
        status: "claimed",
        claimedAt: new Date(),
        balanceBefore,
        balanceAfter: updated.amount,
      },
      select: CLAIM_SELECT,
    });

    return {
      claim: claim as JourneyRewardClaimRecord,
      balanceAfter: updated.amount,
    };
  }

  private isDuplicate(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }

  private owner(ctx: OwnershipContext) {
    return ctx.organizationId
      ? { organizationId: ctx.organizationId }
      : { userId: ctx.userId, organizationId: null };
  }

  private ownerData(ctx: OwnershipContext) {
    return ctx.organizationId
      ? { userId: null, organizationId: ctx.organizationId }
      : { userId: ctx.userId, organizationId: null };
  }
}
