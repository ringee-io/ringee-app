import { Injectable, Logger } from "@nestjs/common";
import {
  Subscription,
  SubscriptionRepository,
  SubscriptionStatus,
} from "@ringee/database";

export interface CreatedSubscription {
  subscription: Subscription;
  /**
   * True only on the insert that gave this user their very first subscription.
   * A replayed Stripe webhook and a re-subscribe both report `false`, so it is
   * safe to hang a one-time welcome off it.
   */
  isFirstEver: boolean;
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
  ) {}

  /**
   * Records an organization subscription Stripe has just created. Safe to
   * replay: Stripe redelivers `customer.subscription.created`, and the second
   * delivery must return the existing row rather than insert a duplicate or
   * re-announce the subscription as new.
   */
  async createFromStripe(
    stripeSubscriptionId: string,
    stripeCustomerId: string,
    userId: string,
    currentPeriodEnd?: Date,
  ): Promise<CreatedSubscription> {
    const existing =
      await this.subscriptionRepository.findByStripeId(stripeSubscriptionId);
    if (existing) {
      this.logger.log(
        `↩️ Subscription ${stripeSubscriptionId} already recorded for user ${userId}`,
      );
      return { subscription: existing, isFirstEver: false };
    }

    // Read before the insert: afterwards this user always has at least one.
    const priorSubscriptions =
      await this.subscriptionRepository.countByUserId(userId);

    this.logger.log(`Creating subscription for user ${userId}`);
    try {
      const subscription = await this.subscriptionRepository.create({
        stripeSubscriptionId,
        stripeCustomerId,
        userId,
        status: SubscriptionStatus.active,
        currentPeriodEnd,
      });

      return { subscription, isFirstEver: priorSubscriptions === 0 };
    } catch (err) {
      // Two deliveries of the same event raced past the lookup above. The
      // unique index on `stripeSubscriptionId` let exactly one of them insert,
      // so the loser reports the winner's row — and does NOT claim the welcome,
      // which the winner has already taken.
      if (!this.subscriptionRepository.isUniqueViolation(err)) throw err;

      const winner =
        await this.subscriptionRepository.findByStripeId(stripeSubscriptionId);
      if (!winner) throw err;

      this.logger.log(
        `↩️ Subscription ${stripeSubscriptionId} was recorded concurrently for user ${userId}`,
      );
      return { subscription: winner, isFirstEver: false };
    }
  }

  async findUnassignedByUserId(userId: string) {
    return this.subscriptionRepository.findUnassignedByUserId(userId);
  }

  async assignToOrganization(userId: string, organizationId: string) {
    const subscription =
      await this.subscriptionRepository.findUnassignedByUserId(userId);
    if (!subscription) {
      this.logger.warn(`No unassigned subscription found for user ${userId}`);
      return null;
    }

    this.logger.log(
      `Assigning subscription ${subscription.id} to org ${organizationId}`,
    );
    return this.subscriptionRepository.assignToOrganization(
      subscription.id,
      organizationId,
    );
  }

  async hasActiveUnassignedSubscription(userId: string): Promise<boolean> {
    const subscription =
      await this.subscriptionRepository.findUnassignedByUserId(userId);
    return !!subscription;
  }

  async updateStatus(
    stripeSubscriptionId: string,
    status: SubscriptionStatus,
    currentPeriodEnd?: Date,
  ) {
    return this.subscriptionRepository.updateStatus(
      stripeSubscriptionId,
      status,
      currentPeriodEnd,
    );
  }
}
