import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Offer,
  OfferAudienceType,
  OfferEventType,
  OfferParticipationRepository,
  OfferParticipationStatus,
  OfferPlacement,
  OfferRepository,
  OfferStatus,
  ParticipationWithActor,
  Prisma,
} from "@ringee/database";
import { OfferAnalyticsService } from "./offer-analytics.service";
import { OfferRewardService } from "./offer-reward.service";

export interface AdminOfferRow {
  id: string;
  slug: string;
  name: string;
  internalName: string | null;
  status: OfferStatus;
  placement: OfferPlacement;
  audienceType: OfferAudienceType;
  priority: number;
  requiresApproval: boolean;
  startsAt: string | null;
  endsAt: string | null;
  participants: number;
  completed: number;
  rewardsIssued: number;
  creditsIssued: number;
  impressions: number;
  dismissals: number;
  pendingApproval: number;
  createdAt: string;
}

export interface AdminOfferDetail extends AdminOfferRow {
  title: string;
  description: string | null;
  maxClaims: number | null;
  maxClaimsPerUser: number;
  eligibilityConfig: unknown;
  actionConfig: unknown;
  rewardConfig: unknown;
  displayConfig: unknown;
  frequencyConfig: unknown;
  events: Record<OfferEventType, number>;
  /** submissions ÷ impressions and rewards ÷ submissions, as percentages. */
  conversion: { clickThrough: number; submission: number; completion: number };
}

export interface AdminParticipationRow {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  organizationId: string | null;
  organizationName: string | null;
  status: OfferParticipationStatus;
  submissionData: unknown;
  rewardAmount: number | null;
  rewardCurrency: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rewardedAt: string | null;
  approvedBy: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

export interface OfferWriteInput {
  slug: string;
  name: string;
  internalName?: string | null;
  title: string;
  description?: string | null;
  status?: OfferStatus;
  placement?: OfferPlacement;
  priority?: number;
  audienceType?: OfferAudienceType;
  eligibilityConfig?: unknown;
  actionConfig?: unknown;
  rewardConfig?: unknown;
  displayConfig?: unknown;
  frequencyConfig?: unknown;
  startsAt?: Date | null;
  endsAt?: Date | null;
  maxClaims?: number | null;
  maxClaimsPerUser?: number;
  requiresApproval?: boolean;
}

/**
 * Backoffice-facing operations.
 *
 * Offers are authored as data through this service, which is what makes "ship a
 * new promotion without a deploy" true: the create/update path takes the same
 * JSON the engine reads, so a future visual editor is a UI on top of these
 * methods rather than new domain code.
 */
@Injectable()
export class OfferAdminService {
  constructor(
    private readonly offers: OfferRepository,
    private readonly participations: OfferParticipationRepository,
    private readonly rewardService: OfferRewardService,
    private readonly analytics: OfferAnalyticsService,
  ) {}

  async list(filter: {
    status?: OfferStatus;
    placement?: OfferPlacement;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: AdminOfferRow[]; total: number }> {
    const { items, total } = await this.offers.list(filter);
    const rows = await this.decorate(items);
    return { items: rows, total };
  }

  async get(id: string): Promise<AdminOfferDetail> {
    const offer = await this.offers.findByIdOrSlug(id);
    if (!offer) throw new NotFoundException("Offer not found.");

    const [row] = await this.decorate([offer]);
    const events = await this.analytics.countsByType(offer.id);

    const pct = (numerator: number, denominator: number) =>
      denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;

    return {
      ...row,
      title: offer.title,
      description: offer.description,
      maxClaims: offer.maxClaims,
      maxClaimsPerUser: offer.maxClaimsPerUser,
      eligibilityConfig: offer.eligibilityConfig,
      actionConfig: offer.actionConfig,
      rewardConfig: offer.rewardConfig,
      displayConfig: offer.displayConfig,
      frequencyConfig: offer.frequencyConfig,
      events,
      conversion: {
        clickThrough: pct(events.CLICKED, events.IMPRESSION),
        submission: pct(events.SUBMITTED, events.IMPRESSION),
        completion: pct(events.REWARDED, events.SUBMITTED),
      },
    };
  }

  async listParticipations(params: {
    offerId: string;
    status?: OfferParticipationStatus;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: AdminParticipationRow[]; total: number }> {
    const offer = await this.offers.findByIdOrSlug(params.offerId);
    if (!offer) throw new NotFoundException("Offer not found.");

    const { items, total } = await this.participations.listByOffer({
      ...params,
      offerId: offer.id,
    });
    return { items: items.map((row) => this.toParticipationRow(row)), total };
  }

  /**
   * Returns the same decorated shape as `get`, not the raw row: the caller is a
   * detail view that expects the funnel counters alongside the configuration.
   */
  async create(
    input: OfferWriteInput,
    createdBy: string,
  ): Promise<AdminOfferDetail> {
    const existing = await this.offers.findBySlug(input.slug);
    if (existing) {
      throw new ConflictException(`An offer with slug "${input.slug}" exists.`);
    }
    const created = await this.offers.create({
      ...this.toWriteData(input),
      slug: input.slug,
      name: input.name,
      title: input.title,
      createdBy,
    });
    return this.get(created.id);
  }

  async update(
    id: string,
    input: Partial<OfferWriteInput>,
  ): Promise<AdminOfferDetail> {
    const offer = await this.offers.findByIdOrSlug(id);
    if (!offer) throw new NotFoundException("Offer not found.");

    if (input.slug && input.slug !== offer.slug) {
      const clash = await this.offers.findBySlug(input.slug);
      if (clash) {
        throw new ConflictException(
          `An offer with slug "${input.slug}" exists.`,
        );
      }
    }

    await this.offers.update(offer.id, this.toWriteData(input));
    return this.get(offer.id);
  }

  /**
   * Deletes an offer outright — but only one nobody has touched.
   *
   * Participations, and with them the reward audit trail, cascade on delete. An
   * offer that has ever been claimed is therefore refused: archiving takes it
   * out of circulation while keeping who was paid what. A never-claimed offer
   * (a draft, a mistake) has nothing to preserve and is removed for real.
   */
  async remove(id: string): Promise<{ deleted: true }> {
    const offer = await this.offers.findByIdOrSlug(id);
    if (!offer) throw new NotFoundException("Offer not found.");

    const participants = await this.participations.countByOffer(offer.id);
    if (participants > 0) {
      throw new ConflictException(
        `This offer has ${participants} participation${participants === 1 ? "" : "s"} and cannot be deleted. Archive it instead to take it out of circulation without losing the reward history.`,
      );
    }

    await this.offers.delete(offer.id);
    return { deleted: true };
  }

  /**
   * Approves a submission and pays out, in that order and exactly once.
   *
   * Step 1 is a conditional transition: only a participation still awaiting
   * review moves to APPROVED, so a second click (or a retried request, or a
   * second admin) finds nothing to transition and stops before any money moves.
   * Step 2 is independently idempotent through the credit ledger, so even a
   * transition that somehow ran twice cannot produce two grants.
   */
  async approve(
    participationId: string,
    adminId: string,
  ): Promise<AdminParticipationRow> {
    const participation = await this.participations.findById(participationId);
    if (!participation) {
      throw new NotFoundException("Participation not found.");
    }

    const offer = await this.offers.findById(participation.offerId);
    if (!offer) throw new NotFoundException("Offer not found.");

    const approved = await this.participations.transition({
      id: participation.id,
      from: ["SUBMITTED", "PENDING_APPROVAL"],
      to: "APPROVED",
      data: { approvedAt: new Date(), approvedBy: adminId },
    });

    if (!approved) {
      throw new ConflictException(
        "This submission is no longer awaiting approval.",
      );
    }

    this.analytics.record({
      offerId: offer.id,
      type: "APPROVED",
      userId: approved.userId,
      organizationId: approved.organizationId,
      participationId: approved.id,
      metadata: { adminId },
    });

    const execution = await this.rewardService.execute({
      offer,
      participation: approved,
    });

    if (execution.granted) {
      this.analytics.record({
        offerId: offer.id,
        type: "REWARDED",
        userId: approved.userId,
        organizationId: approved.organizationId,
        participationId: approved.id,
        metadata: {
          adminId,
          amount: execution.amount,
          currency: execution.currency,
        },
      });
    }

    return this.reload(execution.participation.id);
  }

  async reject(
    participationId: string,
    adminId: string,
    reason: string | null,
  ): Promise<AdminParticipationRow> {
    const participation = await this.participations.findById(participationId);
    if (!participation) {
      throw new NotFoundException("Participation not found.");
    }

    const rejected = await this.participations.transition({
      id: participation.id,
      from: ["SUBMITTED", "PENDING_APPROVAL"],
      to: "REJECTED",
      data: {
        rejectedAt: new Date(),
        approvedBy: adminId,
        rejectionReason: reason,
      },
    });

    if (!rejected) {
      throw new ConflictException(
        "This submission is no longer awaiting approval.",
      );
    }

    this.analytics.record({
      offerId: rejected.offerId,
      type: "REJECTED",
      userId: rejected.userId,
      organizationId: rejected.organizationId,
      participationId: rejected.id,
      metadata: { adminId, reason },
    });

    return this.reload(rejected.id);
  }

  // ── internals ───────────────────────────────────────────────────

  /**
   * Re-reads one participation by id. Targeted on purpose: paging through the
   * offer's participants to find it would fail for anyone outside the newest
   * page — after the reward had already been granted.
   */
  private async reload(id: string): Promise<AdminParticipationRow> {
    const row = await this.participations.findWithActor(id);
    if (!row) throw new NotFoundException("Participation not found.");
    return this.toParticipationRow(row);
  }

  /** Attaches funnel counters with grouped queries, never one query per offer. */
  private async decorate(offers: Offer[]): Promise<AdminOfferRow[]> {
    if (offers.length === 0) return [];

    const stats = await this.offers.statsFor(offers.map((o) => o.id));
    const pending = await Promise.all(
      offers.map(async (offer) => {
        const total = await this.participations.countByOffer(
          offer.id,
          "PENDING_APPROVAL",
        );
        return [offer.id, total] as const;
      }),
    );
    const pendingByOffer = new Map(pending);

    return offers.map((offer) => {
      const s = stats.get(offer.id);
      return {
        id: offer.id,
        slug: offer.slug,
        name: offer.name,
        internalName: offer.internalName,
        status: offer.status,
        placement: offer.placement,
        audienceType: offer.audienceType,
        priority: offer.priority,
        requiresApproval: offer.requiresApproval,
        startsAt: offer.startsAt?.toISOString() ?? null,
        endsAt: offer.endsAt?.toISOString() ?? null,
        participants: s?.participants ?? 0,
        completed: s?.completed ?? 0,
        rewardsIssued: s?.rewarded ?? 0,
        creditsIssued: s?.creditsIssued ?? 0,
        impressions: s?.impressions ?? 0,
        dismissals: s?.dismissals ?? 0,
        pendingApproval: pendingByOffer.get(offer.id) ?? 0,
        createdAt: offer.createdAt.toISOString(),
      };
    });
  }

  private toParticipationRow(
    row: ParticipationWithActor,
  ): AdminParticipationRow {
    return {
      id: row.id,
      userId: row.userId,
      userName: row.userName,
      userEmail: row.userEmail,
      organizationId: row.organizationId,
      organizationName: row.organizationName,
      status: row.status,
      submissionData: row.submissionData,
      rewardAmount: row.rewardAmount,
      rewardCurrency: row.rewardCurrency,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      rejectedAt: row.rejectedAt?.toISOString() ?? null,
      rewardedAt: row.rewardedAt?.toISOString() ?? null,
      approvedBy: row.approvedBy,
      rejectionReason: row.rejectionReason,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Only supplied keys are written, so PATCH never blanks unrelated config. */
  private toWriteData(
    input: Partial<OfferWriteInput>,
  ): Prisma.OfferUncheckedUpdateInput & Prisma.OfferUncheckedCreateInput {
    const json = (value: unknown) =>
      value === undefined ? undefined : (value as Prisma.InputJsonValue);

    if (input.endsAt && input.startsAt && input.endsAt <= input.startsAt) {
      throw new BadRequestException("endsAt must be after startsAt.");
    }

    return {
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.internalName !== undefined
        ? { internalName: input.internalName }
        : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.placement !== undefined ? { placement: input.placement } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.audienceType !== undefined
        ? { audienceType: input.audienceType }
        : {}),
      ...(input.eligibilityConfig !== undefined
        ? { eligibilityConfig: json(input.eligibilityConfig) }
        : {}),
      ...(input.actionConfig !== undefined
        ? { actionConfig: json(input.actionConfig) }
        : {}),
      ...(input.rewardConfig !== undefined
        ? { rewardConfig: json(input.rewardConfig) }
        : {}),
      ...(input.displayConfig !== undefined
        ? { displayConfig: json(input.displayConfig) }
        : {}),
      ...(input.frequencyConfig !== undefined
        ? { frequencyConfig: json(input.frequencyConfig) }
        : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
      ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
      ...(input.maxClaims !== undefined ? { maxClaims: input.maxClaims } : {}),
      ...(input.maxClaimsPerUser !== undefined
        ? { maxClaimsPerUser: input.maxClaimsPerUser }
        : {}),
      ...(input.requiresApproval !== undefined
        ? { requiresApproval: input.requiresApproval }
        : {}),
    } as Prisma.OfferUncheckedUpdateInput & Prisma.OfferUncheckedCreateInput;
  }
}
