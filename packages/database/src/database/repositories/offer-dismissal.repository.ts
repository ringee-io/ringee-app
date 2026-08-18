import { Injectable } from "@nestjs/common";
import { OfferDismissal } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class OfferDismissalRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * All of this user's dismissals for the offers under consideration, fetched
   * once per request alongside their participations.
   */
  async findForUser(
    offerIds: string[],
    userId: string,
  ): Promise<OfferDismissal[]> {
    if (offerIds.length === 0) return [];
    return this.prisma.offerDismissal.findMany({
      where: { offerId: { in: offerIds }, userId },
    });
  }

  /**
   * Dismissing again restarts the snooze window rather than erroring, so the
   * "show again after N hours" clock is always measured from the last "not now".
   */
  async dismiss(offerId: string, userId: string): Promise<OfferDismissal> {
    const dismissedAt = new Date();
    return this.prisma.offerDismissal.upsert({
      where: { offerId_userId: { offerId, userId } },
      create: { offerId, userId, dismissedAt },
      update: { dismissedAt },
    });
  }
}
