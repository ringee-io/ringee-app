import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import {
  CallerIdRotationRepository,
  NumberPurchasedRepository,
  PoolMemberWithNumber,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import { resolveRegion } from "./destination-region";

/** Why a particular caller ID was returned — surfaced to UIs and logs. */
export const RotationReason = {
  DISABLED: "rotation_disabled",
  UNPARSEABLE: "unparseable_destination",
  ROTATED: "rotated",
  FALLBACK_DEFAULT_FOR_COUNTRY: "fallback_default_for_country",
  NO_CALLER_ID_FOR_COUNTRY: "no_caller_id_for_country",
  ALL_OVER_CAP: "all_over_cap",
} as const;

export type RotationReasonValue =
  (typeof RotationReason)[keyof typeof RotationReason];

export interface SelectResult {
  /** The number to present, or null when rotation can offer none for the country. */
  phoneNumber: string | null;
  /** The NumberPurchased id behind `phoneNumber`, when known. */
  numberId: string | null;
  /** True only when the rotation engine actively chose this number. */
  rotated: boolean;
  reason: RotationReasonValue;
}

export interface RotationSettingsView {
  enabled: boolean;
  strategy: "local_presence" | "balanced";
  defaultDailyCap: number;
}

export interface PoolMemberView {
  numberId: string;
  phoneNumber: string;
  isoCountry: string;
  kind: string;
  areaCode: string | null;
  rotationStatus: string;
  participating: boolean;
  /** Effective cap (override or workspace default). */
  dailyCap: number;
  /** The per-number override, null when inheriting the default. */
  dailyCapOverride: number | null;
  usedToday: number;
  healthScore: number;
  lastUsedAt: Date | null;
  coolingUntil: Date | null;
}

export interface NumberReportRow {
  numberId: string;
  phoneNumber: string;
  isoCountry: string;
  rotationStatus: string;
  healthScore: number;
  calls: number;
  answered: number;
  shortCalls: number;
  answerRate: number;
}

const DEFAULT_DAILY_CAP = 50;
const VALID_STRATEGIES = ["local_presence", "balanced"] as const;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Caller-ID rotation (local presence) engine. The single backend authority for
 * which owned number is presented on each outbound call. The frontend never
 * decides — it uses whatever `selectForDial` returns. See the feature spec for
 * the a→e selection priority.
 */
@Injectable()
export class CallerIdRotationService {
  private readonly logger = new Logger(CallerIdRotationService.name);

  constructor(
    private readonly rotationRepo: CallerIdRotationRepository,
    private readonly numberRepo: NumberPurchasedRepository,
  ) {}

  /** UTC midnight for "today" — the key for daily caps and usage rows. */
  private today(): Date {
    const d = new Date();
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
  }

  // ===========================================================================
  // Selection — called by all three dial points
  // ===========================================================================

  /**
   * Decide which caller ID to present for `destination`.
   *
   * When rotation is OFF (or the destination can't be parsed) this returns the
   * caller's existing fixed `fallback` unchanged, so behavior is identical to
   * before the feature. When ON it applies the spec's priority order and only
   * ever returns a number that belongs to the workspace and matches the
   * destination's country.
   */
  async selectForDial(
    ctx: OwnershipContext,
    destination: string,
    fallback: { phoneNumber: string | null; numberId?: string | null },
    opts: { allowOverCap?: boolean; restrictToNumberIds?: string[] } = {},
  ): Promise<SelectResult> {
    const settings = await this.rotationRepo.findSettings(ctx);
    if (!settings?.enabled) {
      return {
        phoneNumber: fallback.phoneNumber,
        numberId: fallback.numberId ?? null,
        rotated: false,
        reason: RotationReason.DISABLED,
      };
    }

    const { country, areaCode } = resolveRegion(destination);
    if (!country) {
      // Can't apply the hard country filter → never risk a wrong-country
      // number; keep the existing fixed caller ID.
      return {
        phoneNumber: fallback.phoneNumber,
        numberId: fallback.numberId ?? null,
        rotated: false,
        reason: RotationReason.UNPARSEABLE,
      };
    }

    let eligible = await this.rotationRepo.findEligibleMembers(ctx, country);
    // Campaign-scoped rotation: restrict the pool to the numbers chosen for the
    // campaign (empty/undefined → the whole workspace pool).
    const restrict =
      opts.restrictToNumberIds && opts.restrictToNumberIds.length > 0
        ? new Set(opts.restrictToNumberIds)
        : null;
    if (restrict) {
      eligible = eligible.filter((m) => restrict.has(m.numberId));
    }
    if (eligible.length === 0) {
      return this.fallbackForCountry(ctx, country, restrict);
    }

    // Daily-cap filter.
    const today = this.today();
    const usage = await this.rotationRepo.usageForNumbers(
      eligible.map((m) => m.numberId),
      today,
    );
    const capOf = (m: PoolMemberWithNumber) =>
      m.dailyCap ?? settings.defaultDailyCap;
    const underCap = eligible.filter(
      (m) => (usage.get(m.numberId)?.count ?? 0) < capOf(m),
    );

    let pool = underCap;
    if (underCap.length === 0) {
      if (!opts.allowOverCap) {
        return {
          phoneNumber: null,
          numberId: null,
          rotated: false,
          reason: RotationReason.ALL_OVER_CAP,
        };
      }
      pool = eligible; // manual override: ignore caps
    }

    // Local-presence preference (soft): same area code first, else same country.
    let subset = pool;
    if (settings.strategy === "local_presence" && areaCode) {
      const sameArea = pool.filter(
        (m) => m.areaCode && m.areaCode === areaCode,
      );
      if (sameArea.length > 0) subset = sameArea;
    }

    const pick = this.rank(subset)[0];
    await this.rotationRepo.markUsed(pick.numberId);
    return {
      phoneNumber: pick.number.phoneNumber,
      numberId: pick.numberId,
      rotated: true,
      reason: RotationReason.ROTATED,
    };
  }

  /** Best health, then least-recently-used (nulls first). */
  private rank(members: PoolMemberWithNumber[]): PoolMemberWithNumber[] {
    return [...members].sort((a, b) => {
      if (b.healthScore !== a.healthScore) return b.healthScore - a.healthScore;
      const at = a.lastUsedAt ? a.lastUsedAt.getTime() : 0;
      const bt = b.lastUsedAt ? b.lastUsedAt.getTime() : 0;
      return at - bt;
    });
  }

  /**
   * No participating/active number for the country: use the workspace's default
   * number *of that country* if one exists (never another country's number);
   * otherwise signal that the call should be blocked with a clear message.
   */
  private async fallbackForCountry(
    ctx: OwnershipContext,
    country: string,
    restrict?: Set<string> | null,
  ): Promise<SelectResult> {
    const rotatable = await this.numberRepo.findRotatable(ctx);
    const sameCountry = rotatable.find(
      (n) => n.isoCountry === country && (!restrict || restrict.has(n.id)),
    );
    if (sameCountry) {
      return {
        phoneNumber: sameCountry.phoneNumber,
        numberId: sameCountry.id,
        rotated: false,
        reason: RotationReason.FALLBACK_DEFAULT_FOR_COUNTRY,
      };
    }
    return {
      phoneNumber: null,
      numberId: null,
      rotated: false,
      reason: RotationReason.NO_CALLER_ID_FOR_COUNTRY,
    };
  }

  // ===========================================================================
  // Per-call accounting (called from the call webhook handlers)
  // ===========================================================================

  /**
   * Resolve which owned number an outbound call presents (by its `fromNumber`)
   * and bump today's call count for caps + reporting. Returns the NumberPurchased
   * id so the caller can stamp `Call.callerIdId` for audit.
   */
  async registerOutboundCall(
    ctx: OwnershipContext,
    fromNumber: string,
  ): Promise<string | null> {
    const owned = await this.numberRepo.findOwnedByPhone(ctx, fromNumber);
    if (!owned) return null;
    await this.rotationRepo
      .incrementUsage(owned.id, this.today(), "count")
      .catch((e) =>
        this.logger.warn(`Failed to bump call count for ${owned.id}: ${e}`),
      );
    return owned.id;
  }

  async registerAnswered(numberId: string): Promise<void> {
    await this.rotationRepo
      .incrementUsage(numberId, this.today(), "answered")
      .catch(() => undefined);
  }

  async registerShortCall(numberId: string): Promise<void> {
    await this.rotationRepo
      .incrementUsage(numberId, this.today(), "shortCalls")
      .catch(() => undefined);
  }

  // ===========================================================================
  // Settings + pool management (API)
  // ===========================================================================

  async getSettings(ctx: OwnershipContext): Promise<RotationSettingsView> {
    const s = await this.rotationRepo.findSettings(ctx);
    return {
      enabled: s?.enabled ?? false,
      strategy:
        (s?.strategy as RotationSettingsView["strategy"]) ?? "local_presence",
      defaultDailyCap: s?.defaultDailyCap ?? DEFAULT_DAILY_CAP,
    };
  }

  async updateSettings(
    ctx: OwnershipContext,
    patch: { enabled?: boolean; strategy?: string; defaultDailyCap?: number },
  ): Promise<RotationSettingsView> {
    if (
      patch.strategy !== undefined &&
      !VALID_STRATEGIES.includes(patch.strategy as never)
    ) {
      throw new BadRequestException(
        `strategy must be one of ${VALID_STRATEGIES.join(", ")}`,
      );
    }
    if (patch.defaultDailyCap !== undefined && patch.defaultDailyCap < 0) {
      throw new BadRequestException("defaultDailyCap must be >= 0");
    }

    await this.rotationRepo.upsertSettings(ctx, patch);
    // Turning rotation on materializes a pool row for every owned number so the
    // config screen shows them immediately.
    if (patch.enabled) await this.ensurePool(ctx);
    return this.getSettings(ctx);
  }

  async listPool(ctx: OwnershipContext): Promise<PoolMemberView[]> {
    await this.ensurePool(ctx);
    const [settings, members] = await Promise.all([
      this.rotationRepo.findSettings(ctx),
      this.rotationRepo.listPoolMembers(ctx),
    ]);
    const defaultCap = settings?.defaultDailyCap ?? DEFAULT_DAILY_CAP;
    const usage = await this.rotationRepo.usageForNumbers(
      members.map((m) => m.numberId),
      this.today(),
    );
    return members.map((m) => ({
      numberId: m.numberId,
      phoneNumber: m.number.phoneNumber,
      isoCountry: m.number.isoCountry,
      kind: m.number.kind,
      areaCode: m.areaCode,
      rotationStatus: m.rotationStatus,
      participating: m.participating,
      dailyCap: m.dailyCap ?? defaultCap,
      dailyCapOverride: m.dailyCap,
      usedToday: usage.get(m.numberId)?.count ?? 0,
      healthScore: m.healthScore,
      lastUsedAt: m.lastUsedAt,
      coolingUntil: m.coolingUntil,
    }));
  }

  async updatePoolMember(
    ctx: OwnershipContext,
    numberId: string,
    patch: {
      participating?: boolean;
      dailyCap?: number | null;
      status?: "active" | "disabled";
    },
  ): Promise<PoolMemberView> {
    const member = await this.rotationRepo.findPoolMemberByNumberId(numberId);
    if (!member || !this.ownsMember(ctx, member)) {
      throw new BadRequestException("Number is not in this workspace's pool");
    }
    if (patch.dailyCap != null && patch.dailyCap < 0) {
      throw new BadRequestException("dailyCap must be >= 0");
    }

    const data: Record<string, unknown> = {};
    if (patch.participating !== undefined)
      data.participating = patch.participating;
    if (patch.dailyCap !== undefined) data.dailyCap = patch.dailyCap;
    if (patch.status === "disabled") data.rotationStatus = "disabled";
    if (patch.status === "active") {
      // Manual re-enable clears cooling; flagged numbers also return to active.
      data.rotationStatus = "active";
      data.coolingUntil = null;
      data.flaggedAt = null;
    }

    await this.rotationRepo.updatePoolMember(numberId, data);
    const list = await this.listPool(ctx);
    return list.find((m) => m.numberId === numberId)!;
  }

  async getReporting(
    ctx: OwnershipContext,
    windowDays = 7,
  ): Promise<NumberReportRow[]> {
    const members = await this.rotationRepo.listPoolMembers(ctx);
    const since = new Date(this.today());
    since.setUTCDate(since.getUTCDate() - windowDays);
    return Promise.all(
      members.map(async (m) => {
        const u = await this.rotationRepo.usageSince(m.numberId, since);
        return {
          numberId: m.numberId,
          phoneNumber: m.number.phoneNumber,
          isoCountry: m.number.isoCountry,
          rotationStatus: m.rotationStatus,
          healthScore: m.healthScore,
          calls: u.count,
          answered: u.answered,
          shortCalls: u.shortCalls,
          answerRate: u.count > 0 ? u.answered / u.count : 0,
        };
      }),
    );
  }

  // ===========================================================================
  // Health & cooling (Temporal schedule)
  // ===========================================================================

  /**
   * Recompute every pool member's health score from a moving window and apply
   * automatic active⇄cooling transitions. `flagged`/`disabled` are never touched
   * here (carrier/manual only).
   */
  async recomputeHealth(): Promise<{
    evaluated: number;
    cooled: number;
    recovered: number;
  }> {
    const windowDays = envInt("CALLER_ID_HEALTH_WINDOW_DAYS", 7);
    const minScore = envInt("CALLER_ID_HEALTH_MIN_SCORE", 50);
    const coolingDays = envInt("CALLER_ID_COOLING_DAYS", 3);

    const since = new Date(this.today());
    since.setUTCDate(since.getUTCDate() - windowDays);
    const members = await this.rotationRepo.listMembersForHealthRecompute();

    let cooled = 0;
    let recovered = 0;
    const now = new Date();

    for (const m of members) {
      const u = await this.rotationRepo.usageSince(m.numberId, since);
      if (u.count === 0) continue; // no signal in the window — leave as is

      const answerRate = u.answered / u.count;
      const shortRatio = u.answered > 0 ? u.shortCalls / u.answered : 0;
      const score = Math.max(
        0,
        Math.min(
          100,
          Math.round(100 * (0.7 * answerRate + 0.3 * (1 - shortRatio))),
        ),
      );

      const data: Record<string, unknown> = { healthScore: score };
      if (m.rotationStatus === "active" && score < minScore) {
        const coolingUntil = new Date(now);
        coolingUntil.setUTCDate(coolingUntil.getUTCDate() + coolingDays);
        data.rotationStatus = "cooling";
        data.coolingUntil = coolingUntil;
        cooled++;
      } else if (
        m.rotationStatus === "cooling" &&
        score >= minScore &&
        m.coolingUntil &&
        m.coolingUntil <= now
      ) {
        data.rotationStatus = "active";
        data.coolingUntil = null;
        recovered++;
      }
      await this.rotationRepo.updatePoolMember(m.numberId, data);
    }

    return { evaluated: members.length, cooled, recovered };
  }

  // ===========================================================================
  // Internals
  // ===========================================================================

  /** Create a pool row for every owned number that doesn't have one yet. */
  private async ensurePool(ctx: OwnershipContext): Promise<void> {
    const [rotatable, existing] = await Promise.all([
      this.numberRepo.findRotatable(ctx),
      this.rotationRepo.listPoolMembers(ctx),
    ]);
    const have = new Set(existing.map((m) => m.numberId));
    const missing = rotatable.filter((n) => !have.has(n.id));
    await Promise.all(
      missing.map((n) =>
        this.rotationRepo.createPoolMember(ctx, n.id, {
          areaCode: resolveRegion(n.phoneNumber).areaCode,
        }),
      ),
    );
  }

  private ownsMember(
    ctx: OwnershipContext,
    member: { userId: string | null; organizationId: string | null },
  ): boolean {
    return ctx.organizationId
      ? member.organizationId === ctx.organizationId
      : member.userId === ctx.userId && !member.organizationId;
  }
}
