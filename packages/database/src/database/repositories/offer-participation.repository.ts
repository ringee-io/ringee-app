import { Injectable } from "@nestjs/common";
import {
  OfferParticipation,
  OfferParticipationStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";

/**
 * A rejected attempt does not burn a claim: the user produced nothing, so they
 * may try again. `maxClaimsPerUser` therefore means "claims that stuck".
 */
export const CLAIM_CONSUMING_STATUSES: OfferParticipationStatus[] = [
  "ELIGIBLE",
  "STARTED",
  "SUBMITTED",
  "PENDING_APPROVAL",
  "APPROVED",
  "COMPLETED",
  "REWARDED",
];

export interface ParticipationWithActor extends OfferParticipation {
  userName: string | null;
  userEmail: string | null;
  organizationName: string | null;
}

export interface ParticipationListFilter {
  offerId: string;
  status?: OfferParticipationStatus;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class OfferParticipationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<OfferParticipation | null> {
    return this.prisma.offerParticipation.findUnique({ where: { id } });
  }

  /** Every claim this user holds on this offer, oldest first. */
  async findForUser(
    offerId: string,
    userId: string,
  ): Promise<OfferParticipation[]> {
    return this.prisma.offerParticipation.findMany({
      where: { offerId, userId },
      orderBy: { claimIndex: "asc" },
    });
  }

  /**
   * One query for every offer the caller might see, so `GET /offers/available`
   * does not fan out per offer.
   */
  async findForUserAcrossOffers(
    offerIds: string[],
    userId: string,
  ): Promise<OfferParticipation[]> {
    if (offerIds.length === 0) return [];
    return this.prisma.offerParticipation.findMany({
      where: { offerId: { in: offerIds }, userId },
    });
  }

  /** Cheap existence/size check — no actor lookups, unlike `listByOffer`. */
  async countByOffer(
    offerId: string,
    status?: OfferParticipationStatus,
  ): Promise<number> {
    return this.prisma.offerParticipation.count({
      where: { offerId, ...(status ? { status } : {}) },
    });
  }

  /** Global claim counts (excluding rejected) for the `maxClaims` cap. */
  async countClaimsByOffer(offerIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (offerIds.length === 0) return counts;

    const rows = await this.prisma.offerParticipation.groupBy({
      by: ["offerId"],
      where: {
        offerId: { in: offerIds },
        status: { in: CLAIM_CONSUMING_STATUSES },
      },
      _count: { _all: true },
    });
    for (const row of rows) counts.set(row.offerId, row._count._all);
    return counts;
  }

  /**
   * Which of `userIds` already hold a claim on this offer. Used to shrink an
   * organization's remaining potential reward as members claim theirs.
   */
  async userIdsWithClaim(
    offerId: string,
    userIds: string[],
  ): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await this.prisma.offerParticipation.groupBy({
      by: ["userId"],
      where: {
        offerId,
        userId: { in: userIds },
        status: { in: CLAIM_CONSUMING_STATUSES },
      },
    });
    return new Set(rows.map((r) => r.userId));
  }

  /**
   * Opens (or re-opens) this user's current claim. `claimIndex` is derived from
   * the claims they already hold, and the `(offerId, userId, claimIndex)`
   * unique key makes a double-click land on the same row instead of two.
   */
  async openClaim(params: {
    offerId: string;
    userId: string;
    organizationId: string | null;
    claimIndex: number;
  }): Promise<OfferParticipation> {
    const now = new Date();
    return this.prisma.offerParticipation.upsert({
      where: {
        offerId_userId_claimIndex: {
          offerId: params.offerId,
          userId: params.userId,
          claimIndex: params.claimIndex,
        },
      },
      create: {
        offerId: params.offerId,
        userId: params.userId,
        organizationId: params.organizationId,
        claimIndex: params.claimIndex,
        status: "STARTED",
        startedAt: now,
      },
      update: {},
    });
  }

  /**
   * Records a submission on an open claim. The `(offerId, submissionFingerprint)`
   * unique index rejects a value another participant already used — the caller
   * turns that into a "this has already been submitted" error.
   */
  async recordSubmission(params: {
    id: string;
    submissionData: Prisma.InputJsonValue;
    submissionFingerprint: string | null;
    status: OfferParticipationStatus;
  }): Promise<OfferParticipation> {
    const now = new Date();
    return this.prisma.offerParticipation.update({
      where: { id: params.id },
      data: {
        submissionData: params.submissionData,
        submissionFingerprint: params.submissionFingerprint,
        status: params.status,
        submittedAt: now,
        ...(params.status === "COMPLETED" ? { completedAt: now } : {}),
      },
    });
  }

  /**
   * Conditional state transition. Returns the updated row only if it was still
   * in one of `from`, so two concurrent approvals cannot both proceed — the
   * loser sees `null` and stops.
   */
  async transition(params: {
    id: string;
    from: OfferParticipationStatus[];
    to: OfferParticipationStatus;
    data?: Prisma.OfferParticipationUncheckedUpdateManyInput;
  }): Promise<OfferParticipation | null> {
    const { count } = await this.prisma.offerParticipation.updateMany({
      where: { id: params.id, status: { in: params.from } },
      data: { status: params.to, ...(params.data ?? {}) },
    });
    if (count === 0) return null;
    return this.findById(params.id);
  }

  /**
   * Stamps the reward outcome. Called after the credit ledger has already
   * accepted (or deduplicated) the grant, so it is safe to run more than once.
   */
  async markRewarded(params: {
    id: string;
    rewardAmount: number;
    rewardCurrency: string;
  }): Promise<OfferParticipation> {
    const now = new Date();
    return this.prisma.offerParticipation.update({
      where: { id: params.id },
      data: {
        status: "REWARDED",
        rewardAmount: params.rewardAmount,
        rewardCurrency: params.rewardCurrency,
        rewardedAt: now,
        completedAt: now,
      },
    });
  }

  /** Backoffice participants table: rows plus the actor names, paginated. */
  async listByOffer(filter: ParticipationListFilter): Promise<{
    items: ParticipationWithActor[];
    total: number;
  }> {
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 25));
    const where: Prisma.OfferParticipationWhereInput = {
      offerId: filter.offerId,
      ...(filter.status ? { status: filter.status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.offerParticipation.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.offerParticipation.count({ where }),
    ]);

    return { items: await this.withActors(rows), total };
  }

  /** One decorated row, whatever page it would have landed on. */
  async findWithActor(id: string): Promise<ParticipationWithActor | null> {
    const row = await this.findById(id);
    if (!row) return null;
    const [decorated] = await this.withActors([row]);
    return decorated;
  }

  /**
   * Attaches display names. OfferParticipation stores plain ids (it outlives
   * the actors), so they are resolved in two batched lookups rather than
   * relations — one pair of queries regardless of how many rows.
   */
  private async withActors(
    rows: OfferParticipation[],
  ): Promise<ParticipationWithActor[]> {
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const orgIds = [
      ...new Set(rows.map((r) => r.organizationId).filter(Boolean)),
    ] as string[];

    const [users, orgs] = await Promise.all([
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              emails: {
                where: { isPrimary: true },
                select: { email: true },
                take: 1,
              },
            },
          })
        : Promise.resolve([]),
      orgIds.length
        ? this.prisma.organization.findMany({
            where: { id: { in: orgIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    const userById = new Map(users.map((u) => [u.id, u]));
    const orgById = new Map(orgs.map((o) => [o.id, o]));

    return rows.map((row) => {
      const user = userById.get(row.userId);
      const name = user
        ? [user.firstName, user.lastName].filter(Boolean).join(" ").trim()
        : "";
      return {
        ...row,
        userName: name || null,
        userEmail: user?.emails?.[0]?.email ?? null,
        organizationName: row.organizationId
          ? (orgById.get(row.organizationId)?.name ?? null)
          : null,
      };
    });
  }
}
