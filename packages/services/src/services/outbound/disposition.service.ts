import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CallOutcome,
  Disposition,
  DispositionCategory,
  DispositionRepository,
  type CampaignDispositionSources,
  type DispositionConflict,
  type WorkspaceDispositionData,
} from "@ringee/database";
import type { OwnershipContext } from "@ringee/platform";
import { CampaignService } from "../campaign.service";

/** What a disposition makes the campaign dialer do with its lead. */
interface OutcomeBehaviour {
  category: DispositionCategory;
  triggersCompletion: boolean;
  triggersRetry: boolean;
  triggersCallback: boolean;
  triggersDnc: boolean;
}

function behaviour(
  category: DispositionCategory,
  triggers: Partial<Omit<OutcomeBehaviour, "category">> = {},
): OutcomeBehaviour {
  return {
    category,
    triggersCompletion: false,
    triggersRetry: false,
    triggersCallback: false,
    triggersDnc: false,
    ...triggers,
  };
}

/**
 * How a workspace disposition drives the campaign dialer, decided by what it
 * means (DISP-002). These are the triggers campaigns were always seeded with
 * for the same outcome, so "Demo booked" (meeting_booked) completes a lead the
 * way the seeded "Meeting Booked" did. The outcomes no seed carried follow
 * their nearest seeded sibling.
 */
export const OUTCOME_BEHAVIOUR: Record<CallOutcome, OutcomeBehaviour> = {
  meeting_booked: behaviour(DispositionCategory.positive, {
    triggersCompletion: true,
  }),
  sale: behaviour(DispositionCategory.positive, { triggersCompletion: true }),
  interested: behaviour(DispositionCategory.positive, {
    triggersCallback: true,
  }),
  follow_up: behaviour(DispositionCategory.neutral, {
    triggersCallback: true,
  }),
  callback_scheduled: behaviour(DispositionCategory.neutral, {
    triggersCallback: true,
  }),
  gatekeeper: behaviour(DispositionCategory.neutral, { triggersRetry: true }),
  not_interested: behaviour(DispositionCategory.negative),
  wrong_number: behaviour(DispositionCategory.negative, { triggersDnc: true }),
  no_answer: behaviour(DispositionCategory.no_contact, { triggersRetry: true }),
  voicemail: behaviour(DispositionCategory.no_contact, { triggersRetry: true }),
  no_conversation: behaviour(DispositionCategory.no_contact, {
    triggersRetry: true,
  }),
};

/**
 * The dispositions a workspace starts with (DISP-003): the outcomes the manual
 * post-call view always offered, in its order, so nothing changes on screen
 * until the workspace edits them. Their code is the outcome itself.
 */
const WORKSPACE_DEFAULTS: {
  outcome: CallOutcome;
  label: string;
  color: string;
}[] = [
  {
    outcome: CallOutcome.meeting_booked,
    label: "Meeting Booked",
    color: "#10B981",
  },
  { outcome: CallOutcome.sale, label: "Sale", color: "#16A34A" },
  { outcome: CallOutcome.interested, label: "Interested", color: "#3B82F6" },
  { outcome: CallOutcome.follow_up, label: "Follow Up", color: "#F59E0B" },
  {
    outcome: CallOutcome.callback_scheduled,
    label: "Callback",
    color: "#D97706",
  },
  {
    outcome: CallOutcome.not_interested,
    label: "Not Interested",
    color: "#64748B",
  },
  { outcome: CallOutcome.no_answer, label: "No Answer", color: "#6B7280" },
  { outcome: CallOutcome.voicemail, label: "Voicemail", color: "#A855F7" },
  {
    outcome: CallOutcome.wrong_number,
    label: "Wrong Number",
    color: "#EF4444",
  },
  { outcome: CallOutcome.gatekeeper, label: "Gatekeeper", color: "#F97316" },
];

/** The most dispositions a campaign may pick; more is not a usable dialer. */
export const MAX_CAMPAIGN_DISPOSITIONS = 30;

/** Whether a value is one of the canonical `CallOutcome`s. */
export function isCallOutcome(value: unknown): value is CallOutcome {
  return (
    typeof value === "string" &&
    (Object.values(CallOutcome) as string[]).includes(value)
  );
}

/**
 * The canonical outcome a disposition means. Workspace dispositions always
 * carry one. A campaign disposition seeded before they existed carries none:
 * its code is the outcome when it names one, and a custom code means none.
 */
export function canonicalOutcomeOf(
  disposition: Pick<Disposition, "canonicalOutcome" | "code">,
): CallOutcome | null {
  if (disposition.canonicalOutcome) return disposition.canonicalOutcome;
  return isCallOutcome(disposition.code) ? disposition.code : null;
}

/**
 * `"Demo booked!"` → `demo_booked`. The stable handle the campaign dialer and
 * its per-code analytics use; it is chosen once and survives renames.
 */
export function dispositionCodeFrom(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48)
    .replace(/_+$/g, "");
  return slug || "disposition";
}

/**
 * Whether a campaign may record this disposition at all: one of its own, or
 * one of the workspace it belongs to. Never another campaign's or workspace's.
 */
export function dispositionBelongsToCampaign(
  disposition: Pick<Disposition, "campaignId" | "organizationId" | "userId">,
  campaignId: string,
  workspace: OwnershipContext,
): boolean {
  if (disposition.campaignId) return disposition.campaignId === campaignId;
  return workspace.organizationId
    ? disposition.organizationId === workspace.organizationId
    : disposition.organizationId === null &&
        disposition.userId === workspace.userId;
}

/** A workspace disposition, with what the management screen needs to know. */
export type WorkspaceDispositionView = Disposition & {
  /** Named by a call or a campaign attempt: it can be deactivated, not deleted. */
  inUse: boolean;
  /** How many campaigns picked it. */
  campaignCount: number;
};

/**
 * Where a campaign's dispositions come from (DISP-004):
 * - `campaign`: workspace dispositions picked for it;
 * - `legacy`: the ones it was seeded with before workspace dispositions;
 * - `workspace`: neither, so it uses the workspace's default set.
 */
export type CampaignDispositionMode = "campaign" | "legacy" | "workspace";

export interface CampaignDispositionSet {
  mode: CampaignDispositionMode;
  /** Every one carries its resolved `canonicalOutcome`. */
  dispositions: Disposition[];
}

/** A disposition a person can record, and the outcome recording it writes. */
export interface SelectableDisposition {
  disposition: Disposition;
  outcome: CallOutcome;
}

export interface CreateDispositionInput {
  name: string;
  description?: string | null;
  color?: string | null;
  canonicalOutcome: string;
  isDefault?: boolean;
  isActive?: boolean;
}

export type UpdateDispositionInput = Partial<CreateDispositionInput>;

/** A campaign's own disposition, through the pre-workspace campaign endpoints. */
export interface CreateDispositionDto {
  code: string;
  label: string;
  category: DispositionCategory;
  color?: string;
  sortOrder?: number;
  triggersRetry?: boolean;
  triggersCompletion?: boolean;
  triggersDnc?: boolean;
  triggersCallback?: boolean;
}

export type UpdateCampaignDispositionDto = Partial<
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

const CAMPAIGN_PATCH_KEYS = [
  "label",
  "color",
  "sortOrder",
  "triggersRetry",
  "triggersCompletion",
  "triggersDnc",
  "triggersCallback",
  "isActive",
] as const satisfies readonly (keyof UpdateCampaignDispositionDto)[];

/**
 * What every reader gets: the row with the outcome it means filled in, so a
 * campaign's pre-workspace disposition reads like any other.
 */
function toView(disposition: Disposition): Disposition {
  return { ...disposition, canonicalOutcome: canonicalOutcomeOf(disposition) };
}

export const DISPOSITION_NAME_MAX = 60;
export const DISPOSITION_DESCRIPTION_MAX = 300;

/** Spacing is not part of a name. Empty, or longer than a button can show, is refused. */
function cleanName(value: string | undefined): string {
  const name = (value ?? "").trim().replace(/\s+/g, " ");
  if (!name) throw new BadRequestException("A disposition needs a name");
  if (name.length > DISPOSITION_NAME_MAX) {
    throw new BadRequestException(
      `A disposition name can be at most ${DISPOSITION_NAME_MAX} characters`,
    );
  }
  return name;
}

function cleanDescription(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (text && text.length > DISPOSITION_DESCRIPTION_MAX) {
    throw new BadRequestException(
      `A description can be at most ${DISPOSITION_DESCRIPTION_MAX} characters`,
    );
  }
  return text ? text : null;
}

function isConflict<T>(
  value: T | DispositionConflict,
): value is DispositionConflict {
  return typeof value === "object" && value !== null && "conflict" in value;
}

/**
 * Dispositions: what a person picks after a call, and the canonical outcome it
 * means (DISP-001). The single owner of
 * - the workspace's own list — CRUD, order, defaults, created on first use;
 * - which dispositions a campaign's dialer shows;
 * - turning a picked disposition into the outcome a call records.
 *
 * Every workspace method scopes by `OwnershipContext` itself; campaign methods
 * check the campaign is the caller's through `CampaignService`.
 */
@Injectable()
export class DispositionService {
  constructor(
    private readonly dispositionRepo: DispositionRepository,
    private readonly campaigns: CampaignService,
  ) {}

  /** The canonical outcomes a disposition may map to — the Prisma enum, nothing else. */
  outcomes(): CallOutcome[] {
    return Object.values(CallOutcome);
  }

  // ── The workspace's own list ─────────────────────────────────────────────

  /**
   * Creates the workspace's defaults the first time anything reads its
   * dispositions. A workspace that never uses them gets no rows, and one that
   * deleted or deactivated defaults does not get them back.
   */
  private async ensureDefaults(ctx: OwnershipContext): Promise<void> {
    await this.dispositionRepo.seedWorkspaceIfEmpty(
      ctx,
      WORKSPACE_DEFAULTS.map((seed, sortOrder) => ({
        code: seed.outcome,
        label: seed.label,
        color: seed.color,
        canonicalOutcome: seed.outcome,
        ...OUTCOME_BEHAVIOUR[seed.outcome],
        sortOrder,
        isActive: true,
        isDefault: true,
        isSystem: true,
      })),
    );
  }

  /** Every workspace disposition, active or not, in order, with its usage. */
  async list(ctx: OwnershipContext): Promise<WorkspaceDispositionView[]> {
    await this.ensureDefaults(ctx);
    const rows = await this.dispositionRepo.listForWorkspace(ctx);
    const usage = await this.dispositionRepo.usage(rows.map((row) => row.id));
    return rows.map((row) => ({
      ...toView(row),
      inUse: usage.inUse.has(row.id),
      campaignCount: usage.campaignCounts.get(row.id) ?? 0,
    }));
  }

  /** The active dispositions, which a campaign or an agent may pick from. */
  async listActive(ctx: OwnershipContext): Promise<Disposition[]> {
    await this.ensureDefaults(ctx);
    const rows = await this.dispositionRepo.listForWorkspace(ctx, {
      activeOnly: true,
    });
    return rows.map(toView);
  }

  /**
   * The workspace's default set: what the manual dialer offers, and what a
   * campaign without its own selection uses. Active dispositions marked
   * default — or every active one when none is, so the set is never empty.
   */
  async listDefaults(ctx: OwnershipContext): Promise<Disposition[]> {
    const active = await this.listActive(ctx);
    const defaults = active.filter((d) => d.isDefault);
    return defaults.length > 0 ? defaults : active;
  }

  async create(
    ctx: OwnershipContext,
    input: CreateDispositionInput,
  ): Promise<Disposition> {
    await this.ensureDefaults(ctx);
    const name = cleanName(input.name);
    const outcome = this.requireOutcome(input.canonicalOutcome);

    const created = await this.dispositionRepo.createForWorkspace(
      ctx,
      {
        label: name,
        description: cleanDescription(input.description),
        color: input.color ?? null,
        canonicalOutcome: outcome,
        ...OUTCOME_BEHAVIOUR[outcome],
        isActive: input.isActive ?? true,
        isDefault: input.isDefault ?? true,
      },
      dispositionCodeFrom(name),
    );
    if (isConflict(created)) throw this.conflict(created, name);
    return toView(created);
  }

  /**
   * Edits a workspace disposition. What it *means* is fixed once a call or an
   * attempt recorded it (DISP-006): analytics already counted those under the
   * old outcome, so a new meaning is a new disposition.
   */
  async update(
    ctx: OwnershipContext,
    id: string,
    input: UpdateDispositionInput,
  ): Promise<Disposition> {
    const current = await this.requireOwn(ctx, id);
    const patch: Partial<WorkspaceDispositionData> = {};

    if (input.name !== undefined) patch.label = cleanName(input.name);
    if (input.description !== undefined) {
      patch.description = cleanDescription(input.description);
    }
    if (input.color !== undefined) patch.color = input.color;
    if (input.isDefault !== undefined) patch.isDefault = input.isDefault;

    if (input.canonicalOutcome !== undefined) {
      const outcome = this.requireOutcome(input.canonicalOutcome);
      if (outcome !== current.canonicalOutcome) {
        if (await this.dispositionRepo.isInUse(id)) {
          throw new ConflictException(
            "This disposition is already recorded on calls, so what it maps to can no longer change. Create a new disposition and deactivate this one.",
          );
        }
        Object.assign(patch, {
          canonicalOutcome: outcome,
          ...OUTCOME_BEHAVIOUR[outcome],
        });
      }
    }

    // Deactivating the last active one is refused inside the write, under
    // the workspace lock (DISP-003).
    if (input.isActive !== undefined && input.isActive !== current.isActive) {
      patch.isActive = input.isActive;
    }

    const updated = await this.dispositionRepo.updateForWorkspace(
      ctx,
      id,
      patch,
    );
    if (isConflict(updated)) throw this.conflict(updated, patch.label);
    if (!updated) throw new NotFoundException("Disposition not found");
    return toView(updated);
  }

  /** Puts the workspace's dispositions in this order. The list must name every one. */
  async reorder(
    ctx: OwnershipContext,
    ids: string[],
  ): Promise<WorkspaceDispositionView[]> {
    const rows = await this.dispositionRepo.listForWorkspace(ctx);
    const known = new Set(rows.map((row) => row.id));
    const unique = new Set(ids);
    if (
      unique.size !== ids.length ||
      ids.length !== known.size ||
      ids.some((id) => !known.has(id))
    ) {
      throw new BadRequestException(
        "The new order must list each of the workspace's dispositions exactly once",
      );
    }
    await this.dispositionRepo.reorderWorkspace(ctx, ids);
    return this.list(ctx);
  }

  /**
   * Deletes a disposition nothing names yet. One that a call or an attempt
   * recorded is history: it can be deactivated, never deleted (DISP-006).
   * Campaigns that picked it simply stop showing it.
   */
  async remove(ctx: OwnershipContext, id: string): Promise<{ deleted: true }> {
    await this.requireOwn(ctx, id);
    if (await this.dispositionRepo.isInUse(id)) {
      throw new ConflictException(
        "This disposition is recorded on calls. Deactivate it instead, so their history keeps it.",
      );
    }
    const deleted = await this.dispositionRepo.deleteForWorkspace(ctx, id);
    if (isConflict(deleted)) throw this.conflict(deleted);
    if (!deleted) throw new NotFoundException("Disposition not found");
    return { deleted: true };
  }

  /**
   * The workspace disposition a person is recording, with the outcome it
   * means. Another workspace's disposition — or a campaign's own — reads as
   * missing; an inactive one can no longer be picked.
   */
  async resolveSelectable(
    ctx: OwnershipContext,
    id: string,
  ): Promise<SelectableDisposition> {
    const disposition = await this.requireOwn(ctx, id);
    if (!disposition.isActive) {
      throw new BadRequestException(
        "This disposition is inactive and can no longer be selected",
      );
    }
    const outcome = canonicalOutcomeOf(disposition);
    if (!outcome) {
      throw new BadRequestException("This disposition maps to no outcome");
    }
    return { disposition, outcome };
  }

  // ── A campaign's dispositions ────────────────────────────────────────────

  /**
   * The dispositions a campaign's dialer shows, in its order (DISP-004): the
   * workspace dispositions picked for it; else the ones it was seeded with
   * before workspace dispositions existed; else the workspace's default set.
   * For a campaign the caller already holds — the dialer, its webhooks.
   */
  async listByCampaign(campaignId: string): Promise<Disposition[]> {
    const sources = await this.dispositionRepo.findCampaignSources(campaignId);
    if (!sources) return [];
    return (await this.setFrom(sources)).dispositions;
  }

  /** A campaign's set and where it comes from, for the campaign screen. */
  async getCampaignSet(
    ctx: OwnershipContext,
    campaignId: string,
    options?: { requireMembershipForUserId?: string },
  ): Promise<CampaignDispositionSet> {
    await this.campaigns.getCampaignById(ctx, campaignId, options);
    const sources = await this.dispositionRepo.findCampaignSources(campaignId);
    if (!sources) throw new NotFoundException("Campaign not found");
    return this.setFrom(sources);
  }

  /**
   * Picks the workspace dispositions a campaign's dialer shows, in order. An
   * empty list returns it to the workspace's default set. Either way the
   * dispositions it was seeded with stop being used.
   */
  async setCampaignSet(
    ctx: OwnershipContext,
    campaignId: string,
    dispositionIds: string[],
  ): Promise<CampaignDispositionSet> {
    await this.campaigns.getCampaignById(ctx, campaignId);
    await this.assertPickable(ctx, dispositionIds);
    await this.dispositionRepo.replaceCampaignSet(campaignId, dispositionIds);
    return this.getCampaignSet(ctx, campaignId);
  }

  /**
   * Checks dispositions can be picked for a campaign: distinct, active, and
   * the workspace's own. Another workspace's id reads as missing.
   */
  async assertPickable(
    ctx: OwnershipContext,
    dispositionIds: string[],
  ): Promise<void> {
    if (new Set(dispositionIds).size !== dispositionIds.length) {
      throw new BadRequestException("A disposition can be picked only once");
    }
    if (dispositionIds.length > MAX_CAMPAIGN_DISPOSITIONS) {
      throw new BadRequestException(
        `A campaign can show at most ${MAX_CAMPAIGN_DISPOSITIONS} dispositions`,
      );
    }
    const found = await this.dispositionRepo.findManyForWorkspace(
      ctx,
      dispositionIds,
    );
    if (found.length !== dispositionIds.length) {
      throw new NotFoundException("Disposition not found");
    }
    if (found.some((d) => !d.isActive)) {
      throw new BadRequestException(
        "An inactive disposition cannot be picked for a campaign",
      );
    }
  }

  /**
   * The disposition an agent recorded for a campaign attempt. It must be in
   * the campaign's set — or, when an admin changed that set while the agent
   * was on the call, still an active disposition the campaign could use: its
   * own or its workspace's. Anything else reads as missing.
   */
  async resolveForCampaign(
    campaignId: string,
    pick: { id: string } | { code: string },
  ): Promise<Disposition | null> {
    const sources = await this.dispositionRepo.findCampaignSources(campaignId);
    if (!sources) return null;
    const { dispositions } = await this.setFrom(sources);
    const inSet = dispositions.find((d) =>
      "id" in pick ? d.id === pick.id : d.code === pick.code,
    );
    if (inSet) return inSet;
    return this.dispositionRepo.findActiveForCampaign(
      campaignId,
      sources.owner,
      pick,
    );
  }

  /**
   * Creates one of a campaign's own dispositions. Pre-workspace endpoint, kept
   * for API compatibility: the dashboard picks workspace dispositions instead.
   */
  async createForCampaign(
    ctx: OwnershipContext,
    campaignId: string,
    dto: CreateDispositionDto,
  ): Promise<Disposition> {
    await this.campaigns.getCampaignById(ctx, campaignId);
    const code = dto.code?.trim();
    if (!code) throw new BadRequestException("A disposition needs a code");
    const label = cleanName(dto.label);
    if (!Object.values(DispositionCategory).includes(dto.category)) {
      throw new BadRequestException("Invalid disposition category");
    }
    return this.dispositionRepo.createForCampaign({
      campaignId,
      code,
      label,
      category: dto.category,
      color: dto.color,
      sortOrder: dto.sortOrder,
      triggersRetry: dto.triggersRetry,
      triggersCompletion: dto.triggersCompletion,
      triggersDnc: dto.triggersDnc,
      triggersCallback: dto.triggersCallback,
    });
  }

  /** Edits one of a campaign's own dispositions; only these fields can change. */
  async updateForCampaign(
    ctx: OwnershipContext,
    campaignId: string,
    id: string,
    dto: UpdateCampaignDispositionDto,
  ): Promise<Disposition> {
    await this.campaigns.getCampaignById(ctx, campaignId);
    const patch: UpdateCampaignDispositionDto = {};
    for (const key of CAMPAIGN_PATCH_KEYS) {
      if (dto?.[key] !== undefined) Object.assign(patch, { [key]: dto[key] });
    }
    const updated = await this.dispositionRepo.updateForCampaign(
      campaignId,
      id,
      patch,
    );
    if (!updated) throw new NotFoundException("Disposition not found");
    return updated;
  }

  /** Retires one of a campaign's own dispositions. Its attempts keep naming it. */
  deactivateForCampaign(
    ctx: OwnershipContext,
    campaignId: string,
    id: string,
  ): Promise<Disposition> {
    return this.updateForCampaign(ctx, campaignId, id, { isActive: false });
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private async setFrom(
    sources: CampaignDispositionSources,
  ): Promise<CampaignDispositionSet> {
    const picked = sources.picked.filter((d) => d.isActive);
    if (picked.length > 0) {
      return { mode: "campaign", dispositions: picked.map(toView) };
    }
    if (sources.legacy.length > 0) {
      return { mode: "legacy", dispositions: sources.legacy.map(toView) };
    }
    return {
      mode: "workspace",
      dispositions: await this.listDefaults(sources.owner),
    };
  }

  private async requireOwn(
    ctx: OwnershipContext,
    id: string,
  ): Promise<Disposition> {
    const disposition = await this.dispositionRepo.findForWorkspace(ctx, id);
    if (!disposition) throw new NotFoundException("Disposition not found");
    return disposition;
  }

  private requireOutcome(value: string | undefined): CallOutcome {
    if (!isCallOutcome(value)) {
      throw new BadRequestException(
        `Maps to must be one of: ${this.outcomes().join(", ")}`,
      );
    }
    return value;
  }

  /**
   * The refusal for a write the workspace's invariants blocked. A workspace
   * always keeps one active disposition, or no dialer could record a call.
   */
  private conflict(
    refusal: DispositionConflict,
    name?: string,
  ): ConflictException {
    return new ConflictException(
      refusal.conflict === "name"
        ? `A disposition named "${name}" already exists in this workspace`
        : "A workspace needs at least one active disposition",
    );
  }
}
