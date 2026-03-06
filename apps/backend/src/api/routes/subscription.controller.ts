import { Controller, Get } from "@nestjs/common";
import { CurrentUser } from "@ringee/platform";
import { SubscriptionService } from "@ringee/services";

interface CurrentUserData {
    id: string;
}

@Controller("subscriptions")
export class SubscriptionController {
    constructor(
        private readonly subscriptionService: SubscriptionService,
    ) { }

    @Get("available")
    async getAvailableSubscription(
        @CurrentUser() user: CurrentUserData,
    ): Promise<{ hasAvailable: boolean; count: number }> {
        const subscription = await this.subscriptionService.findUnassignedByUserId(user.id);

        return {
            hasAvailable: subscription?.status === "active",
            count: subscription ? 1 : 0,
        };
    }
}
