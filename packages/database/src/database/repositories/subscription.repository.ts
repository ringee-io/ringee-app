import { Injectable } from "@nestjs/common";
import { Subscription, SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class SubscriptionRepository {
    constructor(private readonly prisma: PrismaService) { }

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

    async findByStripeId(stripeSubscriptionId: string): Promise<Subscription | null> {
        return this.prisma.subscription.findUnique({
            where: { stripeSubscriptionId },
        });
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

    async findActiveByOrganizationId(organizationId: string): Promise<Subscription | null> {
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
