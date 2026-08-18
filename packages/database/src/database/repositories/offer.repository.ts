import { Injectable } from "@nestjs/common";
import {
  Offer,
  OfferAudienceType,
  OfferPlacement,
  OfferStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";

export interface OfferListFilter {
  status?: OfferStatus;
  placement?: OfferPlacement;
  search?: string;
  page?: number;
  pageSize?: number;
}

/** Funnel counters for one offer, aggregated for the backoffice list. */
export interface OfferStats {
  participants: number;
  completed: number;
  rewarded: number;
  creditsIssued: number;
  impressions: number;
  dismissals: number;
  clicks: number;
  submissions: number;
  approvals: number;
  rejections: number;
}

@Injectable()
export class OfferRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every offer that could render right now for the given audience: ACTIVE,
   * inside its date window, and matching the placement. Ordered by priority so
   * a single-slot placement can just take the first eligible one.
   *
   * Intentionally does no per-user work — the caller evaluates eligibility
   * against a context built once per request.
   */
  async findRenderable(params: {
    placement?: OfferPlacement;
    audienceTypes: OfferAudienceType[];
    now: Date;
  }): Promise<Offer[]> {
    return this.prisma.offer.findMany({
      where: {
        status: OfferStatus.ACTIVE,
        ...(params.placement ? { placement: params.placement } : {}),
        audienceType: { in: params.audienceTypes },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: params.now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: params.now } }] },
        ],
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });
  }

  async findById(id: string): Promise<Offer | null> {
    return this.prisma.offer.findUnique({ where: { id } });
  }

  async findBySlug(slug: string): Promise<Offer | null> {
    return this.prisma.offer.findUnique({ where: { slug } });
  }

  /** Accepts either form so deep links and seeds can use the readable slug. */
  async findByIdOrSlug(idOrSlug: string): Promise<Offer | null> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        idOrSlug,
      );
    return isUuid ? this.findById(idOrSlug) : this.findBySlug(idOrSlug);
  }

  async list(
    filter: OfferListFilter,
  ): Promise<{ items: Offer[]; total: number }> {
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 25));
    const where: Prisma.OfferWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.placement ? { placement: filter.placement } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: "insensitive" } },
              {
                internalName: { contains: filter.search, mode: "insensitive" },
              },
              { slug: { contains: filter.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.offer.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.offer.count({ where }),
    ]);

    return { items, total };
  }

  async create(data: Prisma.OfferUncheckedCreateInput): Promise<Offer> {
    return this.prisma.offer.create({ data });
  }

  async update(
    id: string,
    data: Prisma.OfferUncheckedUpdateInput,
  ): Promise<Offer> {
    return this.prisma.offer.update({ where: { id }, data });
  }

  /** Idempotent create-or-update by slug, used by seeds. */
  async upsertBySlug(
    slug: string,
    data: Omit<Prisma.OfferUncheckedCreateInput, "slug">,
  ): Promise<Offer> {
    return this.prisma.offer.upsert({
      where: { slug },
      create: { ...data, slug },
      update: data,
    });
  }

  /**
   * Hard delete. Participations, dismissals and events cascade with it, so the
   * caller is responsible for refusing when that history matters.
   */
  async delete(id: string): Promise<void> {
    await this.prisma.offer.delete({ where: { id } });
  }

  /**
   * Funnel counters for a set of offers in two grouped queries (never one query
   * per offer), so the backoffice list stays flat as offers accumulate.
   */
  async statsFor(offerIds: string[]): Promise<Map<string, OfferStats>> {
    const empty = (): OfferStats => ({
      participants: 0,
      completed: 0,
      rewarded: 0,
      creditsIssued: 0,
      impressions: 0,
      dismissals: 0,
      clicks: 0,
      submissions: 0,
      approvals: 0,
      rejections: 0,
    });

    const result = new Map<string, OfferStats>(
      offerIds.map((id) => [id, empty()]),
    );
    if (offerIds.length === 0) return result;

    const [participations, events] = await Promise.all([
      this.prisma.offerParticipation.groupBy({
        by: ["offerId", "status"],
        where: { offerId: { in: offerIds } },
        _count: { _all: true },
        _sum: { rewardAmount: true },
      }),
      this.prisma.offerEvent.groupBy({
        by: ["offerId", "type"],
        where: { offerId: { in: offerIds } },
        _count: { _all: true },
      }),
    ]);

    for (const row of participations) {
      const stats = result.get(row.offerId);
      if (!stats) continue;
      const count = row._count._all;
      stats.participants += count;
      if (row.status === "COMPLETED" || row.status === "REWARDED") {
        stats.completed += count;
      }
      if (row.status === "REWARDED") {
        stats.rewarded += count;
        stats.creditsIssued += row._sum.rewardAmount ?? 0;
      }
    }

    for (const row of events) {
      const stats = result.get(row.offerId);
      if (!stats) continue;
      const count = row._count._all;
      switch (row.type) {
        case "IMPRESSION":
          stats.impressions += count;
          break;
        case "DISMISSED":
          stats.dismissals += count;
          break;
        case "CLICKED":
          stats.clicks += count;
          break;
        case "SUBMITTED":
          stats.submissions += count;
          break;
        case "APPROVED":
          stats.approvals += count;
          break;
        case "REJECTED":
          stats.rejections += count;
          break;
        default:
          break;
      }
    }

    return result;
  }
}
