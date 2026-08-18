import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CLAIM_CONSUMING_STATUSES,
  Offer,
  OfferDismissalRepository,
  OfferEventType,
  OfferParticipation,
  OfferParticipationRepository,
  OfferPlacement,
  OfferRepository,
  Prisma,
} from "@ringee/database";
import { CurrentUserData, OwnershipContext } from "@ringee/platform";
import { OfferAnalyticsService } from "./offer-analytics.service";
import { OfferActionService } from "./offer-action.service";
import { OfferContextBuilder } from "./offer-context.builder";
import { OfferEligibilityEngine } from "./offer-eligibility.engine";
import { OfferPresenter } from "./offer.presenter";
import { OfferRewardCalculator } from "./offer-reward.calculator";
import { OfferRewardService } from "./offer-reward.service";
import { offerWindowFailure } from "./offer-window";
import {
  OfferEligibilityContext,
  OfferFrequencyConfig,
  PresentedOffer,
  readConfig,
} from "./offer.types";

const MS_PER_HOUR = 3_600_000;

/**
 * Entry point for everything a signed-in user does with offers.
 *
 * Orchestration only: eligibility, rewards, actions, copy and analytics each
 * live in their own collaborator. Nothing here knows what any individual offer
 * is — an offer is rows and JSON, and this class is the same code for all of
 * them.
 */
@Injectable()
export class OfferService {
  constructor(
    private readonly offers: OfferRepository,
    private readonly participations: OfferParticipationRepository,
    private readonly dismissals: OfferDismissalRepository,
    private readonly contextBuilder: OfferContextBuilder,
    private readonly eligibility: OfferEligibilityEngine,
    private readonly rewards: OfferRewardCalculator,
    private readonly rewardService: OfferRewardService,
    private readonly actions: OfferActionService,
    private readonly presenter: OfferPresenter,
    private readonly analytics: OfferAnalyticsService,
  ) {}

  /**
   * Offers this user can see right now, highest priority first.
   *
   * The whole pass is a fixed number of queries: one context (cached), one
   * catalogue read, one participation read, one dismissal read — then pure
   * in-memory evaluation for every offer. Adding offers does not add queries.
   */
  async listAvailable(
    user: CurrentUserData,
    options?: { placement?: OfferPlacement; limit?: number },
  ): Promise<PresentedOffer[]> {
    const ctx = this.ownership(user);
    const context = await this.contextBuilder.build(ctx, {
      role: user.activeOrgRole ?? null,
    });
    if (!context) return [];

    const candidates = await this.offers.findRenderable({
      placement: options?.placement,
      audienceTypes: this.eligibility.audienceTypesFor(context),
      now: context.now,
    });
    if (candidates.length === 0) return [];

    const offerIds = candidates.map((offer) => offer.id);
    const [myParticipations, myDismissals, globalClaims] = await Promise.all([
      this.participations.findForUserAcrossOffers(offerIds, ctx.userId),
      this.dismissals.findForUser(offerIds, ctx.userId),
      this.participations.countClaimsByOffer(offerIds),
    ]);

    const participationsByOffer = new Map<string, OfferParticipation[]>();
    for (const participation of myParticipations) {
      const list = participationsByOffer.get(participation.offerId) ?? [];
      list.push(participation);
      participationsByOffer.set(participation.offerId, list);
    }
    const dismissedAtByOffer = new Map(
      myDismissals.map((d) => [d.offerId, d.dismissedAt]),
    );

    const visible: Offer[] = [];
    for (const offer of candidates) {
      const mine = participationsByOffer.get(offer.id) ?? [];
      // The catalogue query already filtered on this; re-checking in memory
      // costs nothing and closes the gap between a cached read and "now".
      if (offerWindowFailure(offer, context.now)) continue;
      if (
        this.isSnoozed(offer, dismissedAtByOffer.get(offer.id), context.now)
      ) {
        continue;
      }
      if (!this.canStillClaim(offer, mine, globalClaims.get(offer.id) ?? 0)) {
        // Already claimed offers stay visible while the claim is in flight, so
        // the user can see "submitted / pending review" instead of a banner
        // that silently disappears.
        if (!this.hasPendingClaim(mine)) continue;
      }
      if (!this.eligibility.evaluate(offer, context).eligible) continue;
      visible.push(offer);
    }

    if (visible.length === 0) return [];

    // Only now do we pay for the per-offer "who else has claimed" lookup, and
    // only for organizations, where the potential reward depends on it.
    const presented = await Promise.all(
      visible.map(async (offer) =>
        this.presentOffer({
          offer,
          context,
          participations: participationsByOffer.get(offer.id) ?? [],
        }),
      ),
    );

    const sorted = presented.sort((a, b) => b.priority - a.priority);
    // TOP_BANNER shows one offer today. Returning a list (already ordered)
    // keeps a carousel a frontend change rather than an API change.
    return options?.limit ? sorted.slice(0, options.limit) : sorted;
  }

  /** Full detail for one offer, including the caller's participation. */
  async getForUser(
    user: CurrentUserData,
    idOrSlug: string,
  ): Promise<PresentedOffer> {
    const ctx = this.ownership(user);
    const { offer, context } = await this.loadRenderable(user, idOrSlug);
    const mine = await this.participations.findForUser(offer.id, ctx.userId);
    return this.presentOffer({ offer, context, participations: mine });
  }

  /** Opens a claim so a multi-step action can be resumed and measured. */
  async start(
    user: CurrentUserData,
    idOrSlug: string,
  ): Promise<PresentedOffer> {
    const ctx = this.ownership(user);
    const { offer, context } = await this.loadRenderable(user, idOrSlug);
    this.assertEligible(offer, context);

    const participation = await this.openClaim(offer, ctx);

    this.analytics.record({
      offerId: offer.id,
      type: "STARTED",
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
      participationId: participation.id,
      placement: offer.placement,
    });

    return this.presentOffer({
      offer,
      context,
      participations: [participation],
    });
  }

  /**
   * Accepts the user's action payload.
   *
   * Everything that decides the outcome — eligibility, caps, the reward amount,
   * the destination wallet — is recomputed here from server state. The client
   * contributes only `submissionData`.
   */
  async submit(
    user: CurrentUserData,
    idOrSlug: string,
    submissionData: Record<string, unknown> | undefined,
  ): Promise<PresentedOffer> {
    const ctx = this.ownership(user);
    const { offer, context } = await this.loadRenderable(user, idOrSlug);
    this.assertEligible(offer, context);

    const normalized = this.actions.normalize(offer, submissionData);
    const participation = await this.openClaim(offer, ctx);

    if (
      participation.submittedAt &&
      participation.status !== "REJECTED" &&
      participation.status !== "STARTED"
    ) {
      throw new ConflictException("You have already submitted this offer.");
    }

    // An offer that needs a human sits in PENDING_APPROVAL; one that does not
    // completes immediately and pays out below.
    const nextStatus = offer.requiresApproval
      ? "PENDING_APPROVAL"
      : "COMPLETED";

    let submitted: OfferParticipation;
    try {
      submitted = await this.participations.recordSubmission({
        id: participation.id,
        submissionData: normalized.data as Prisma.InputJsonValue,
        submissionFingerprint: normalized.fingerprint,
        status: nextStatus,
      });
    } catch (error) {
      if (this.isDuplicateSubmission(error)) {
        throw new ConflictException(
          "That has already been submitted for this offer.",
        );
      }
      throw error;
    }

    this.analytics.record({
      offerId: offer.id,
      type: "SUBMITTED",
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
      participationId: submitted.id,
      placement: offer.placement,
    });

    if (!offer.requiresApproval) {
      const execution = await this.rewardService.execute({
        offer,
        participation: submitted,
      });
      submitted = execution.participation;
      if (execution.granted) {
        this.analytics.record({
          offerId: offer.id,
          type: "REWARDED",
          userId: ctx.userId,
          organizationId: ctx.organizationId ?? null,
          participationId: submitted.id,
          placement: offer.placement,
          metadata: {
            amount: execution.amount,
            currency: execution.currency,
          },
        });
      }
    }

    return this.presentOffer({
      offer,
      context,
      participations: [submitted],
    });
  }

  /** "Not now". Hides the offer for a while; never a claim and never terminal. */
  async dismiss(user: CurrentUserData, idOrSlug: string): Promise<void> {
    const ctx = this.ownership(user);
    const offer = await this.offers.findByIdOrSlug(idOrSlug);
    if (!offer) throw new NotFoundException("Offer not found.");

    const frequency = readConfig<OfferFrequencyConfig>(offer.frequencyConfig);
    if (frequency.dismissible === false) {
      throw new ForbiddenException("This offer cannot be dismissed.");
    }

    await this.dismissals.dismiss(offer.id, ctx.userId);
    this.analytics.record({
      offerId: offer.id,
      type: "DISMISSED",
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
      placement: offer.placement,
    });
  }

  /**
   * Records a funnel event the client is the only witness to (the banner
   * actually rendered, the CTA was clicked). Deliberately narrow: the client
   * may name an event but can never assert eligibility or reward facts.
   */
  async track(
    user: CurrentUserData,
    idOrSlug: string,
    event: "impression" | "clicked",
  ): Promise<void> {
    const ctx = this.ownership(user);
    const offer = await this.offers.findByIdOrSlug(idOrSlug);
    if (!offer) throw new NotFoundException("Offer not found.");

    const type: OfferEventType =
      event === "impression" ? "IMPRESSION" : "CLICKED";

    this.analytics.record({
      offerId: offer.id,
      type,
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
      placement: offer.placement,
    });
  }

  // ── internals ───────────────────────────────────────────────────

  private ownership(user: CurrentUserData): OwnershipContext {
    return { userId: user.id, organizationId: user.activeOrgId ?? null };
  }

  private async loadRenderable(
    user: CurrentUserData,
    idOrSlug: string,
  ): Promise<{ offer: Offer; context: OfferEligibilityContext }> {
    const offer = await this.offers.findByIdOrSlug(idOrSlug);
    if (!offer) throw new NotFoundException("Offer not found.");

    const context = await this.contextBuilder.build(this.ownership(user), {
      role: user.activeOrgRole ?? null,
    });
    if (!context) throw new NotFoundException("Offer not found.");

    this.assertLive(offer, context.now);
    return { offer, context };
  }

  /** Status and date window are checked server-side on every single call. */
  private assertLive(offer: Offer, now: Date): void {
    switch (offerWindowFailure(offer, now)) {
      case "status":
        throw new ForbiddenException("This offer is not available.");
      case "not_started":
        throw new ForbiddenException("This offer has not started yet.");
      case "ended":
        throw new ForbiddenException("This offer has ended.");
      default:
        return;
    }
  }

  private assertEligible(offer: Offer, context: OfferEligibilityContext): void {
    if (!this.eligibility.evaluate(offer, context).eligible) {
      // The reason is diagnostic only: the user must not learn the thresholds.
      throw new ForbiddenException("You are not eligible for this offer.");
    }
  }

  /**
   * Opens (or resumes) the caller's claim after re-checking the caps. The
   * `(offerId, userId, claimIndex)` unique key makes concurrent calls converge
   * on one row rather than creating two.
   */
  private async openClaim(
    offer: Offer,
    ctx: OwnershipContext,
  ): Promise<OfferParticipation> {
    const mine = await this.participations.findForUser(offer.id, ctx.userId);
    const globalClaims = await this.participations.countClaimsByOffer([
      offer.id,
    ]);

    if (!this.canStillClaim(offer, mine, globalClaims.get(offer.id) ?? 0)) {
      const open = this.openClaimOf(mine);
      if (open) return open;
      throw new ConflictException(
        "You have already claimed this offer, or it has reached its limit.",
      );
    }

    const claimIndex = mine.filter((p) =>
      CLAIM_CONSUMING_STATUSES.includes(p.status),
    ).length;

    return this.participations.openClaim({
      offerId: offer.id,
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
      claimIndex,
    });
  }

  /** The claim that is still in flight (started or awaiting review), if any. */
  private openClaimOf(
    participations: OfferParticipation[],
  ): OfferParticipation | undefined {
    return participations.find((p) =>
      ["STARTED", "SUBMITTED", "PENDING_APPROVAL", "APPROVED"].includes(
        p.status,
      ),
    );
  }

  private hasPendingClaim(participations: OfferParticipation[]): boolean {
    return participations.some((p) =>
      ["STARTED", "SUBMITTED", "PENDING_APPROVAL", "APPROVED"].includes(
        p.status,
      ),
    );
  }

  /**
   * Per-user and global claim caps. Rejected attempts do not count: a rejection
   * produced nothing, so the user may try again.
   */
  private canStillClaim(
    offer: Offer,
    mine: OfferParticipation[],
    globalClaims: number,
  ): boolean {
    const consumed = mine.filter((p) =>
      CLAIM_CONSUMING_STATUSES.includes(p.status),
    ).length;

    const frequency = readConfig<OfferFrequencyConfig>(offer.frequencyConfig);
    const perUserCap =
      frequency.mode === "RECURRING"
        ? Number.POSITIVE_INFINITY
        : Math.max(1, offer.maxClaimsPerUser);

    if (consumed >= perUserCap) return false;
    if (offer.maxClaims !== null && globalClaims >= offer.maxClaims) {
      return false;
    }
    return true;
  }

  /**
   * A dismissal hides the offer for `showAgainAfterHours`; without that value a
   * "not now" is permanent.
   */
  private isSnoozed(
    offer: Offer,
    dismissedAt: Date | undefined,
    now: Date,
  ): boolean {
    if (!dismissedAt) return false;

    const frequency = readConfig<OfferFrequencyConfig>(offer.frequencyConfig);
    const hours = frequency.showAgainAfterHours;
    if (!hours || hours <= 0) return true;

    return now.getTime() - dismissedAt.getTime() < hours * MS_PER_HOUR;
  }

  /**
   * Builds the response for one offer. The "who already claimed" lookup only
   * happens for organizations, where the remaining potential depends on it.
   */
  private async presentOffer(params: {
    offer: Offer;
    context: OfferEligibilityContext;
    participations: OfferParticipation[];
  }): Promise<PresentedOffer> {
    const { offer, context, participations } = params;

    const claimedUserIds =
      context.workspace.type === "organization"
        ? await this.participations.userIdsWithClaim(
            offer.id,
            context.members.map((m) => m.userId),
          )
        : new Set(
            participations.some((p) =>
              CLAIM_CONSUMING_STATUSES.includes(p.status),
            )
              ? [context.user.id]
              : [],
          );

    const reward = this.rewards.compute({ offer, context, claimedUserIds });

    return this.presenter.present({
      offer,
      context,
      reward,
      participation: this.latestParticipation(participations),
    });
  }

  private latestParticipation(
    participations: OfferParticipation[],
  ): OfferParticipation | null {
    if (participations.length === 0) return null;
    return [...participations].sort((a, b) => b.claimIndex - a.claimIndex)[0];
  }

  private isDuplicateSubmission(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      return false;
    }
    const target = error.meta?.target;
    return Array.isArray(target)
      ? target.includes("submissionFingerprint")
      : String(target).includes("submissionFingerprint");
  }
}
