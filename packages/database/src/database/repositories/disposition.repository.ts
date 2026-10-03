import { Injectable } from "@nestjs/common";
import {
  CallOutcome,
  Disposition,
  DispositionCategory,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";
import {
  OwnershipContext,
  buildOwnershipData,
  buildOwnershipFilter,
} from "@ringee/platform";
import { lockWorkspace } from "./calendar.repository";

/** What a workspace disposition is written with. The service derives the rest. */
export interface WorkspaceDispositionData {
  label: string;
  description?: string | null;
  color?: string | null;
  canonicalOutcome: CallOutcome;
  category: DispositionCategory;
  triggersRetry: boolean;
  triggersCompletion: boolean;
  triggersDnc: boolean;
  triggersCallback: boolean;
  isActive?: boolean;
  isDefault?: boolean;
  isSystem?: boolean;
}

/** A seeded default: its code and place are fixed by the service. */
export interface WorkspaceDispositionSeed extends WorkspaceDispositionData {
  code: string;
  sortOrder: number;
}

/**
 * A write the workspace's invariants refuse (DISP-003): another disposition
 * already has the name, or it would leave the workspace with none active.
 */
export interface DispositionConflict {
  conflict: "name" | "last_active";
}

/** Where a campaign's dispositions can come from (DISP-004). */
export interface CampaignDispositionSources {
  /** The campaign's workspace, which owns the dispositions it may pick. */
  owner: OwnershipContext;
  /** Workspace dispositions picked for the campaign, in its order. */
  picked: Disposition[];
  /** The campaign's own, pre-workspace dispositions that are still active. */
  legacy: Disposition[];
}

/** How each workspace disposition is used, for the management screen. */
export interface DispositionUsage {
  /** Named by a call or a campaign attempt: history depends on it. */
  inUse: Set<string>;
  /** How many campaigns picked each one. */
  campaignCounts: Map<string, number>;
}

/** Legacy campaign-owned dispositions: what a campaign was seeded with. */
interface CampaignDispositionData {
  campaignId: string;
  code: string;
  label: string;
  category: DispositionCategory;
  color?: string;
  sortOrder?: number;
  triggersRetry?: boolean;
  triggersCompletion?: boolean;
  triggersDnc?: boolean;
  triggersCallback?: boolean;
  isSystem?: boolean;
}

type CampaignDispositionPatch = Partial<
  Pick<
    Disposition,
    | "label"
    | "color"
    | "sortOrder"
    | "triggersRetry"
    | "triggersCompletion"
    | "triggersDnc"
    | "triggersCallback"
    | "isActive"
  >
>;

const BY_POSITION = [
  { sortOrder: "asc" },
  { createdAt: "asc" },
] satisfies Prisma.DispositionOrderByWithRelationInput[];

/** Names compare the way a person reads them: case and spacing do not count. */
function nameKey(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/** `base`, else `base_2`, `base_3`… — the first one nobody has. */
function freeCode(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Dispositions. Two kinds of row share the table: a workspace's own
 * (`campaignId` null, scoped by `buildOwnershipFilter`) and the ones a campaign
 * was seeded with before workspace dispositions existed (`campaignId` set,
 * scoped by the campaign). Every workspace read and write below filters on
 * both, so a campaign's row is never mistaken for a workspace's and another
 * workspace's row matches nothing.
 */
@Injectable()
export class DispositionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private workspace(ctx: OwnershipContext): Prisma.DispositionWhereInput {
    return { campaignId: null, ...buildOwnershipFilter(ctx) };
  }

  // ── Workspace dispositions ───────────────────────────────────────────────

  listForWorkspace(
    ctx: OwnershipContext,
    options: { activeOnly?: boolean } = {},
  ): Promise<Disposition[]> {
    return this.prisma.disposition.findMany({
      where: {
        ...this.workspace(ctx),
        ...(options.activeOnly ? { isActive: true } : {}),
      },
      orderBy: BY_POSITION,
    });
  }

  findForWorkspace(
    ctx: OwnershipContext,
    id: string,
  ): Promise<Disposition | null> {
    return this.prisma.disposition.findFirst({
      where: { id, ...this.workspace(ctx) },
    });
  }

  findManyForWorkspace(
    ctx: OwnershipContext,
    ids: string[],
  ): Promise<Disposition[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.disposition.findMany({
      where: { id: { in: ids }, ...this.workspace(ctx) },
    });
  }

  /**
   * Creates the workspace's default dispositions, unless it already has any —
   * including inactive ones, which are a choice the workspace made. The
   * workspace row lock is what keeps two concurrent first reads from seeding
   * twice (the same serialization `CalendarRepository.ensureDefault` uses).
   */
  async seedWorkspaceIfEmpty(
    ctx: OwnershipContext,
    seeds: WorkspaceDispositionSeed[],
  ): Promise<boolean> {
    const existing = await this.prisma.disposition.findFirst({
      where: this.workspace(ctx),
      select: { id: true },
    });
    if (existing) return false;

    return this.prisma.$transaction(async (tx) => {
      await lockWorkspace(tx, ctx);
      const current = await tx.disposition.findFirst({
        where: this.workspace(ctx),
        select: { id: true },
      });
      if (current) return false;
      await tx.disposition.createMany({
        data: seeds.map((seed) => ({
          ...buildOwnershipData(ctx),
          campaignId: null,
          ...seed,
        })),
      });
      return true;
    });
  }

  /**
   * Creates a workspace disposition under the workspace lock, so two requests
   * cannot both take the same name. Its code is `codeBase`, or the first free
   * `codeBase_N`; it goes after every existing disposition.
   */
  async createForWorkspace(
    ctx: OwnershipContext,
    data: WorkspaceDispositionData,
    codeBase: string,
  ): Promise<Disposition | DispositionConflict> {
    return this.prisma.$transaction(async (tx) => {
      await lockWorkspace(tx, ctx);
      const siblings = await tx.disposition.findMany({
        where: this.workspace(ctx),
        select: { label: true, code: true, sortOrder: true },
      });
      const key = nameKey(data.label);
      if (siblings.some((row) => nameKey(row.label) === key)) {
        return { conflict: "name" as const };
      }
      const last = siblings.reduce(
        (max, row) => Math.max(max, row.sortOrder),
        -1,
      );
      return tx.disposition.create({
        data: {
          ...buildOwnershipData(ctx),
          campaignId: null,
          ...data,
          code: freeCode(codeBase, new Set(siblings.map((row) => row.code))),
          sortOrder: last + 1,
        },
      });
    });
  }

  /**
   * Scoped update: a row in another workspace — or a campaign's own row —
   * matches nothing and reads as `null`. Under the workspace lock, like a
   * create: a rename is checked against the other names, and deactivating is
   * refused when no other disposition would stay active — so two admins
   * deactivating the last two at once cannot both win.
   */
  async updateForWorkspace(
    ctx: OwnershipContext,
    id: string,
    data: Partial<WorkspaceDispositionData>,
  ): Promise<Disposition | DispositionConflict | null> {
    return this.prisma.$transaction(async (tx) => {
      await lockWorkspace(tx, ctx);
      if (data.label !== undefined) {
        const key = nameKey(data.label);
        const clash = await tx.disposition.findMany({
          where: { ...this.workspace(ctx), id: { not: id } },
          select: { label: true },
        });
        if (clash.some((row) => nameKey(row.label) === key)) {
          return { conflict: "name" as const };
        }
      }
      if (data.isActive === false && !(await this.anotherActive(tx, ctx, id))) {
        return { conflict: "last_active" as const };
      }
      const { count } = await tx.disposition.updateMany({
        where: { id, ...this.workspace(ctx) },
        data,
      });
      if (count === 0) return null;
      return tx.disposition.findFirst({
        where: { id, ...this.workspace(ctx) },
      });
    });
  }

  /**
   * Puts the given dispositions in this order. Ids outside the workspace match
   * nothing. One batch, so the order lands whole or not at all; each statement
   * keeps `buildOwnershipFilter` rather than a hand-written raw-SQL predicate.
   */
  async reorderWorkspace(ctx: OwnershipContext, ids: string[]): Promise<void> {
    await this.prisma.$transaction(
      ids.map((id, sortOrder) =>
        this.prisma.disposition.updateMany({
          where: { id, ...this.workspace(ctx) },
          data: { sortOrder },
        }),
      ),
    );
  }

  /**
   * Hard delete. The service only calls it for a disposition nothing names.
   * Like a deactivation, refused under the workspace lock when it would leave
   * no disposition active.
   */
  async deleteForWorkspace(
    ctx: OwnershipContext,
    id: string,
  ): Promise<boolean | DispositionConflict> {
    return this.prisma.$transaction(async (tx) => {
      await lockWorkspace(tx, ctx);
      const row = await tx.disposition.findFirst({
        where: { id, ...this.workspace(ctx) },
        select: { isActive: true },
      });
      if (!row) return false;
      if (row.isActive && !(await this.anotherActive(tx, ctx, id))) {
        return { conflict: "last_active" as const };
      }
      const { count } = await tx.disposition.deleteMany({
        where: { id, ...this.workspace(ctx) },
      });
      return count === 1;
    });
  }

  /** Whether the workspace has an active disposition other than `id`. */
  private async anotherActive(
    tx: Prisma.TransactionClient,
    ctx: OwnershipContext,
    id: string,
  ): Promise<boolean> {
    const other = await tx.disposition.findFirst({
      where: { ...this.workspace(ctx), isActive: true, id: { not: id } },
      select: { id: true },
    });
    return other !== null;
  }

  /** Whether any call or campaign attempt names this disposition. */
  async isInUse(id: string): Promise<boolean> {
    const [call, attempt] = await Promise.all([
      this.prisma.call.findFirst({
        where: { dispositionId: id },
        select: { id: true },
      }),
      this.prisma.callAttempt.findFirst({
        where: { dispositionId: id },
        select: { id: true },
      }),
    ]);
    return Boolean(call || attempt);
  }

  async usage(ids: string[]): Promise<DispositionUsage> {
    if (ids.length === 0) {
      return { inUse: new Set(), campaignCounts: new Map() };
    }
    const where = { dispositionId: { in: ids } };
    const [calls, attempts, links] = await Promise.all([
      this.prisma.call.groupBy({ by: ["dispositionId"], where }),
      this.prisma.callAttempt.groupBy({ by: ["dispositionId"], where }),
      this.prisma.campaignDisposition.groupBy({
        by: ["dispositionId"],
        where,
        _count: { _all: true },
      }),
    ]);
    const inUse = new Set<string>();
    for (const row of [...calls, ...attempts]) {
      if (row.dispositionId) inUse.add(row.dispositionId);
    }
    return {
      inUse,
      campaignCounts: new Map(
        links.map((row) => [row.dispositionId, row._count._all]),
      ),
    };
  }

  // ── A campaign's dispositions ────────────────────────────────────────────

  /**
   * Everything a campaign's disposition set is resolved from, in one read: the
   * workspace it belongs to, the workspace dispositions picked for it and its
   * own pre-workspace ones. Null when the campaign does not exist.
   */
  async findCampaignSources(
    campaignId: string,
  ): Promise<CampaignDispositionSources | null> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        userId: true,
        organizationId: true,
        dispositionSet: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { disposition: true },
        },
        dispositions: { where: { isActive: true }, orderBy: BY_POSITION },
      },
    });
    if (!campaign) return null;
    return {
      owner: {
        userId: campaign.userId,
        organizationId: campaign.organizationId,
      },
      picked: campaign.dispositionSet.map((link) => link.disposition),
      legacy: campaign.dispositions,
    };
  }

  /**
   * An active disposition a campaign may record: one of its own, or one of its
   * workspace's. Its own wins when both carry the code being looked up.
   */
  findActiveForCampaign(
    campaignId: string,
    owner: OwnershipContext,
    pick: { id: string } | { code: string },
  ): Promise<Disposition | null> {
    return this.prisma.disposition.findFirst({
      where: {
        ...pick,
        isActive: true,
        OR: [{ campaignId }, this.workspace(owner)],
      },
      orderBy: { campaignId: { sort: "asc", nulls: "last" } },
    });
  }

  /**
   * Replaces the workspace dispositions picked for a campaign, in this order.
   * An empty list means "use the workspace's default set". Either way the
   * campaign stops using the dispositions it was seeded with: they are
   * deactivated (kept, because attempts in its history name them). The
   * campaign row lock keeps two concurrent saves from interleaving.
   */
  async replaceCampaignSet(
    campaignId: string,
    dispositionIds: string[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "Campaign" WHERE "id" = ${campaignId}::uuid FOR UPDATE
      `;
      await tx.campaignDisposition.deleteMany({ where: { campaignId } });
      if (dispositionIds.length > 0) {
        await tx.campaignDisposition.createMany({
          data: dispositionIds.map((dispositionId, sortOrder) => ({
            campaignId,
            dispositionId,
            sortOrder,
          })),
        });
      }
      await tx.disposition.updateMany({
        where: { campaignId, isActive: true },
        data: { isActive: false },
      });
    });
  }

  // ── Legacy campaign-owned dispositions ───────────────────────────────────

  createForCampaign(data: CampaignDispositionData): Promise<Disposition> {
    return this.prisma.disposition.create({ data });
  }

  /** Scoped to the campaign: another campaign's row matches nothing. */
  async updateForCampaign(
    campaignId: string,
    id: string,
    data: CampaignDispositionPatch,
  ): Promise<Disposition | null> {
    const { count } = await this.prisma.disposition.updateMany({
      where: { id, campaignId },
      data,
    });
    if (count === 0) return null;
    return this.prisma.disposition.findFirst({ where: { id, campaignId } });
  }
}
