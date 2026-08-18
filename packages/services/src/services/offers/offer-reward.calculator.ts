import { Injectable } from "@nestjs/common";
import { Offer } from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import { OfferEligibilityEngine } from "./offer-eligibility.engine";
import {
  OfferContextMember,
  OfferEligibilityContext,
  OfferRewardConfig,
  OfferRewardDestination,
  OfferRewardRule,
  OfferRewardType,
  PresentedReward,
  readConfig,
} from "./offer.types";

export interface RewardBreakdown extends PresentedReward {
  /** Members who satisfy the member rule right now. */
  eligibleParticipants: number;
  /** Of those, the ones who have not claimed yet. */
  remainingParticipants: number;
}

const DEFAULT_CURRENCY = "USD";

/**
 * Turns `rewardConfig` plus the shared context into concrete money.
 *
 * The per-claim amount is what THIS user can earn. `potentialAmount` is the
 * ceiling still on the table: for an organization, the per-member amount times
 * the members who qualify AND have not claimed — so it shrinks as the team
 * claims, instead of advertising money that is already gone.
 */
@Injectable()
export class OfferRewardCalculator {
  constructor(private readonly eligibility: OfferEligibilityEngine) {}

  /** Resolves the workspace-specific reward rule, or the flat one. */
  ruleFor(
    offer: Offer,
    workspaceType: "personal" | "organization",
  ): OfferRewardRule {
    const config = readConfig<OfferRewardConfig>(offer.rewardConfig);
    const variant =
      workspaceType === "organization" ? config.organization : config.personal;
    const rule = variant ?? config;

    return {
      type: (rule.type ?? "NONE") as OfferRewardType,
      amount: typeof rule.amount === "number" ? rule.amount : 0,
      currency: rule.currency ?? DEFAULT_CURRENCY,
      destination: (rule.destination ??
        (workspaceType === "organization"
          ? "ORGANIZATION"
          : "PERSONAL_WORKSPACE")) as OfferRewardDestination,
    };
  }

  /**
   * @param claimedUserIds users who already hold a claim on this offer, so the
   *   remaining potential excludes them.
   */
  compute(params: {
    offer: Offer;
    context: OfferEligibilityContext;
    claimedUserIds: Set<string>;
  }): RewardBreakdown {
    const { offer, context, claimedUserIds } = params;
    const rule = this.ruleFor(offer, context.workspace.type);
    const amount = rule.amount ?? 0;

    if (context.workspace.type !== "organization") {
      const alreadyClaimed = claimedUserIds.has(context.user.id);
      return {
        type: rule.type,
        amount,
        potentialAmount: alreadyClaimed ? 0 : amount,
        currency: rule.currency ?? DEFAULT_CURRENCY,
        destination: rule.destination ?? "PERSONAL_WORKSPACE",
        eligibleParticipants: 1,
        remainingParticipants: alreadyClaimed ? 0 : 1,
      };
    }

    // An organization only has potential if the team-level gate passes at all.
    const eligibleMembers: OfferContextMember[] =
      this.eligibility.workspaceQualifies(offer, context)
        ? this.eligibility.eligibleMembers(offer, context)
        : [];

    const remaining = eligibleMembers.filter(
      (member) => !claimedUserIds.has(member.userId),
    );

    return {
      type: rule.type,
      amount,
      potentialAmount: amount * remaining.length,
      currency: rule.currency ?? DEFAULT_CURRENCY,
      destination: rule.destination ?? "ORGANIZATION",
      eligibleParticipants: eligibleMembers.length,
      remainingParticipants: remaining.length,
    };
  }

  /**
   * Where the credit lands. `ORGANIZATION` pays the team wallet even though an
   * individual member earned it; `PERSONAL_WORKSPACE` always pays the person,
   * even when they claimed from within an organization.
   */
  destinationOwner(
    destination: OfferRewardDestination,
    ctx: OwnershipContext,
  ): OwnershipContext {
    switch (destination) {
      case "ORGANIZATION":
        return {
          userId: ctx.userId,
          organizationId: ctx.organizationId ?? null,
        };
      case "PERSONAL_WORKSPACE":
        return { userId: ctx.userId, organizationId: null };
      case "ACTIVE_WORKSPACE":
      default:
        return {
          userId: ctx.userId,
          organizationId: ctx.organizationId ?? null,
        };
    }
  }
}
