import { Injectable, Logger } from "@nestjs/common";
import { SubscriptionRepository, SubscriptionStatus } from "@ringee/database";

@Injectable()
export class SubscriptionService {
    private readonly logger = new Logger(SubscriptionService.name);

    constructor(
        private readonly subscriptionRepository: SubscriptionRepository,
    ) { }

    async createFromStripe(
        stripeSubscriptionId: string,
        stripeCustomerId: string,
        userId: string,
        currentPeriodEnd?: Date,
    ) {
        this.logger.log(`Creating subscription for user ${userId}`);
        return this.subscriptionRepository.create({
            stripeSubscriptionId,
            stripeCustomerId,
            userId,
            status: SubscriptionStatus.active,
            currentPeriodEnd,
        });
    }

    async findUnassignedByUserId(userId: string) {
        return this.subscriptionRepository.findUnassignedByUserId(userId);
    }

    async assignToOrganization(userId: string, organizationId: string) {
        const subscription = await this.subscriptionRepository.findUnassignedByUserId(userId);
        if (!subscription) {
            this.logger.warn(`No unassigned subscription found for user ${userId}`);
            return null;
        }

        this.logger.log(`Assigning subscription ${subscription.id} to org ${organizationId}`);
        return this.subscriptionRepository.assignToOrganization(subscription.id, organizationId);
    }

    async hasActiveUnassignedSubscription(userId: string): Promise<boolean> {
        const subscription = await this.subscriptionRepository.findUnassignedByUserId(userId);
        return !!subscription;
    }

    async updateStatus(
        stripeSubscriptionId: string,
        status: SubscriptionStatus,
        currentPeriodEnd?: Date,
    ) {
        return this.subscriptionRepository.updateStatus(stripeSubscriptionId, status, currentPeriodEnd);
    }
}
