import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import {
  Offer,
  OfferParticipation,
  OfferParticipationRepository,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import { CreditService } from "../credit.service";
import { OfferRewardCalculator } from "./offer-reward.calculator";
import { OfferRewardRule } from "./offer.types";

export interface RewardExecution {
  participation: OfferParticipation;
  /** False when the ledger had already recorded this reward. */
  granted: boolean;
  amount: number;
  currency: string;
}

/** Ledger `source` for every offer payout — one value, queryable, never branched on. */
export const OFFER_REWARD_SOURCE = "OFFER_REWARD";

/**
 * Executes an offer's reward — the only place an offer ever moves money.
 *
 * Idempotency is enforced by the database, not by checking-then-writing: the
 * grant is keyed `offer_reward:{participationId}` in the `CreditGrant` ledger,
 * whose unique index makes a second attempt a no-op regardless of what caused
 * it (double click, API retry, timeout, two admins approving at once, two
 * processes racing). The participation is stamped afterwards, so a crash
 * between the two leaves the money granted and the stamp recoverable on retry —
 * never the reverse, and never two payouts.
 */
@Injectable()
export class OfferRewardService {
  private readonly logger = new Logger(OfferRewardService.name);

  constructor(
    private readonly credits: CreditService,
    private readonly participations: OfferParticipationRepository,
    private readonly calculator: OfferRewardCalculator,
  ) {}

  static idempotencyKey(participationId: string): string {
    return `offer_reward:${participationId}`;
  }

  async execute(params: {
    offer: Offer;
    participation: OfferParticipation;
  }): Promise<RewardExecution> {
    const { offer, participation } = params;

    const workspaceType = participation.organizationId
      ? "organization"
      : "personal";
    const rule = this.calculator.ruleFor(offer, workspaceType);

    if (rule.type === "NONE" || !rule.amount || rule.amount <= 0) {
      // A rewardless offer still completes — it just never touches credits.
      const completed = await this.participations.transition({
        id: participation.id,
        from: ["APPROVED", "COMPLETED", "SUBMITTED", "PENDING_APPROVAL"],
        to: "COMPLETED",
        data: { completedAt: new Date() },
      });
      return {
        participation: completed ?? participation,
        granted: false,
        amount: 0,
        currency: rule.currency ?? "USD",
      };
    }

    const owner = this.resolveOwner(rule, participation);

    const { granted } = await this.credits.grantCreditsOnce(
      owner,
      rule.amount,
      {
        idempotencyKey: OfferRewardService.idempotencyKey(participation.id),
        source: OFFER_REWARD_SOURCE,
        metadata: {
          offerId: offer.id,
          offerSlug: offer.slug,
          participationId: participation.id,
        },
      },
    );

    if (!granted) {
      this.logger.warn(
        `Offer reward for participation ${participation.id} was already granted; skipping the credit.`,
      );
    }

    // Runs whether or not this attempt did the granting, so a retry that lost
    // the race still converges the participation to REWARDED.
    const rewarded = await this.participations.markRewarded({
      id: participation.id,
      rewardAmount: rule.amount,
      rewardCurrency: rule.currency ?? "USD",
    });

    return {
      participation: rewarded,
      granted,
      amount: rule.amount,
      currency: rule.currency ?? "USD",
    };
  }

  /**
   * The wallet the credit lands in. A participation carries the workspace it
   * was claimed from, so the destination is resolved from stored facts rather
   * than from whoever happens to be approving.
   */
  private resolveOwner(
    rule: OfferRewardRule,
    participation: OfferParticipation,
  ): OwnershipContext {
    const destination = rule.destination ?? "PERSONAL_WORKSPACE";

    if (destination === "PERSONAL_WORKSPACE") {
      return { userId: participation.userId, organizationId: null };
    }

    if (!participation.organizationId) {
      throw new BadRequestException(
        "This offer pays an organization, but the claim has no organization.",
      );
    }

    return {
      userId: participation.userId,
      organizationId: participation.organizationId,
    };
  }
}
