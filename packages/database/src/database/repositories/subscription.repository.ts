import { Injectable } from "@nestjs/common";
import { Prisma, Subscription, SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class SubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    stripeSubscriptionId: string;
    stripeCustomerId: string;
    userId: string;
    status?: SubscriptionStatus;
    currentPeriodEnd?: Date;
  }): Promise<Subscription> {
    return this.prisma.subscription.create({
      data: {
        stripeSubscriptionId: data.stripeSubscriptionId,
        stripeCustomerId: data.stripeCustomerId,
        userId: data.userId,
        status: data.status ?? SubscriptionStatus.incomplete,
        currentPeriodEnd: data.currentPeriodEnd,
      },
    });
  }

  async findByStripeId(
    stripeSubscriptionId: string,
  ): Promise<Subscription | null> {
    return this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
    });
  }

  /**
   * How many subscriptions this user has ever had, cancelled ones included.
   * Only the organization plan is stored here, so zero means the user has
   * never subscribed before.
   */
  async countByUserId(userId: string): Promise<number> {
    return this.prisma.subscription.count({ where: { userId } });
  }

  /**
   * True when `create` lost a race to another writer inserting the same
   * `stripeSubscriptionId` — two deliveries of one Stripe event. The unique
   * index is what actually serializes them; this just lets the caller tell that
   * conflict apart from a real failure.
   */
  isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    );
  }

  async findUnassignedByUserId(userId: string): Promise<Subscription | null> {
    return this.prisma.subscription.findFirst({
      where: {
        userId,
        organizationId: null,
        status: SubscriptionStatus.active,
      },
    });
  }

  async findActiveByOrganizationId(
    organizationId: string,
  ): Promise<Subscription | null> {
    return this.prisma.subscription.findFirst({
      where: {
        organizationId,
        status: SubscriptionStatus.active,
      },
    });
  }

  async assignToOrganization(
    subscriptionId: string,
    organizationId: string,
  ): Promise<Subscription> {
    return this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { organizationId },
    });
  }

  async updateStatus(
    stripeSubscriptionId: string,
    status: SubscriptionStatus,
    currentPeriodEnd?: Date,
  ): Promise<Subscription> {
    return this.prisma.subscription.update({
      where: { stripeSubscriptionId },
      data: {
        status,
        currentPeriodEnd,
      },
    });
  }
}
