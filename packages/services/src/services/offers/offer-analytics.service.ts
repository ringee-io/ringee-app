import { Injectable, Logger } from "@nestjs/common";
import {
  OfferEventInput,
  OfferEventRepository,
  OfferEventType,
  OfferPlacement,
} from "@ringee/database";

/**
 * Funnel recorder. Ringee has no product-analytics pipeline, so conversion data
 * is persisted here: eligible → impression → click → start → submit → approve →
 * reward, plus dismissals.
 *
 * Recording never blocks or fails the user action that produced it — a lost
 * metric is always cheaper than a failed claim.
 */
@Injectable()
export class OfferAnalyticsService {
  private readonly logger = new Logger(OfferAnalyticsService.name);

  constructor(private readonly events: OfferEventRepository) {}

  record(input: OfferEventInput): void {
    this.events.record(input).catch((error) => {
      this.logger.warn(`Failed to record offer event: ${String(error)}`);
    });
  }

  recordMany(inputs: OfferEventInput[]): void {
    if (inputs.length === 0) return;
    this.events.recordMany(inputs).catch((error) => {
      this.logger.warn(`Failed to record offer events: ${String(error)}`);
    });
  }

  async countsByType(offerId: string): Promise<Record<OfferEventType, number>> {
    const rows = await this.events.countsByType(offerId);
    const counts = {
      IMPRESSION: 0,
      CLICKED: 0,
      DISMISSED: 0,
      STARTED: 0,
      SUBMITTED: 0,
      APPROVED: 0,
      REJECTED: 0,
      REWARDED: 0,
    } as Record<OfferEventType, number>;
    for (const row of rows) counts[row.type] = row.count;
    return counts;
  }
}

export type { OfferEventType, OfferPlacement };
