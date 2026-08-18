import { Injectable } from "@nestjs/common";
import { OfferEventType, OfferPlacement, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

export interface OfferEventInput {
  offerId: string;
  type: OfferEventType;
  userId?: string | null;
  organizationId?: string | null;
  participationId?: string | null;
  placement?: OfferPlacement | null;
  metadata?: Prisma.InputJsonValue | null;
}

/**
 * Append-only funnel log. Ringee has no product-analytics pipeline, so the
 * conversion data lives here and the backoffice reads it directly.
 */
@Injectable()
export class OfferEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: OfferEventInput): Promise<void> {
    await this.prisma.offerEvent.create({
      data: {
        offerId: input.offerId,
        type: input.type,
        userId: input.userId ?? null,
        organizationId: input.organizationId ?? null,
        participationId: input.participationId ?? null,
        placement: input.placement ?? null,
        metadata: input.metadata ?? Prisma.DbNull,
      },
    });
  }

  async recordMany(inputs: OfferEventInput[]): Promise<void> {
    if (inputs.length === 0) return;
    await this.prisma.offerEvent.createMany({
      data: inputs.map((input) => ({
        offerId: input.offerId,
        type: input.type,
        userId: input.userId ?? null,
        organizationId: input.organizationId ?? null,
        participationId: input.participationId ?? null,
        placement: input.placement ?? null,
        metadata: input.metadata ?? Prisma.DbNull,
      })),
    });
  }

  /** Daily funnel series for one offer, used by the backoffice detail page. */
  async countsByType(
    offerId: string,
  ): Promise<Array<{ type: OfferEventType; count: number }>> {
    const rows = await this.prisma.offerEvent.groupBy({
      by: ["type"],
      where: { offerId },
      _count: { _all: true },
    });
    return rows.map((r) => ({ type: r.type, count: r._count._all }));
  }
}
