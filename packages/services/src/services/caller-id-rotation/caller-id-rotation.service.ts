import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import {
  CallerIdRotationRepository,
  NumberPurchasedRepository,
  PoolMemberWithNumber,
  OutboundSource,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import { resolveRegion } from "./destination-region";
import { NumberPurchasedService } from "../number.purchased.service";
import { apiConfiguration } from "@ringee/configuration";

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
  callingCode: string | null;
  state: string | null;
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
 * decides — it uses whatever `selectForDial` returns.
 */
@Injectable()
export class CallerIdRotationService {
  constructor(
    private readonly rotationRepo: CallerIdRotationRepository,
    private readonly numberRepo: NumberPurchasedRepository,
    private readonly numbers: NumberPurchasedService,
  ) {}

  /** UTC midnight for "today" — the key for daily caps and usage rows. */
  private today(): Date {
    const d = new Date();
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
  }

  // ===========================================================================
  // Selection — shared by every rotation-aware dial surface
  // ===========================================================================

  /**
   * Decide which caller ID to present for `destination`.
   *
   * When rotation is OFF (or the destination can't be parsed), preserve the
   * existing fixed fallback after checking its authorization. When ON, apply
   * country/calling-plan matching, caps, local presence and health to the
   * workspace's eligible numbers. A refusal must never be replaced by a fixed
   * number by a caller.
   */
  async selectForDial(
    ctx: OwnershipContext,
    destination: string,
    fallback: { phoneNumber: string | null; numberId?: string | null },
    opts: {
      allowOverCap?: boolean;
      restrictToNumberIds?: string[];
      source?: OutboundSource;
    } = {},
  ): Promise<SelectResult> {
    const [settings, allowed] = await Promise.all([
      this.rotationRepo.findSettings(ctx),
      this.numbers.listOutboundCallerIds(ctx, {
        source: opts.source ?? "web",
        userId: ctx.userId,
      }),
    ]);
    // Even the fixed fallback must be authorized for this workspace, member,
    // and surface. A client-supplied id is not an ownership claim.
    const fixed = allowed.find(
      (n) =>
        n.phoneNumber === fallback.phoneNumber &&
        (!fallback.numberId || n.id === fallback.numberId),
    );
    const publicFallback =
      !fallback.numberId &&
      fallback.phoneNumber === apiConfiguration.RINGEE_PUBLIC_CALLER_ID;
    const fixedResult = (reason: RotationReasonValue): SelectResult => ({
      phoneNumber:
        fixed?.phoneNumber ?? (publicFallback ? fallback.phoneNumber : null),
      numberId: fixed?.id ?? null,
      rotated: false,
      reason,
    });
    if (!settings?.enabled) return fixedResult(RotationReason.DISABLED);

    const destinationRegion = resolveRegion(destination);
    const { country, callingCode, areaCode, state } = destinationRegion;
    if (!callingCode) return fixedResult(RotationReason.UNPARSEABLE);

    // New purchases/verified IDs join without reopening the settings screen.
    await this.ensurePool(ctx);
    const allowedIds = new Set(allowed.map((n) => n.id));
    const restrict = opts.restrictToNumberIds?.length
      ? new Set(opts.restrictToNumberIds)
      : null;

    // A compare-and-set claim prevents simultaneous workspace callers from
    // consuming the same LRU snapshot. Re-read caps and health on contention.
    for (let attempt = 0; attempt < 5; attempt++) {
      const members = await this.rotationRepo.findEligibleMembers(ctx);
      const eligible = members.filter((m) => {
        if (
          !allowedIds.has(m.numberId) ||
          (restrict && !restrict.has(m.numberId))
        )
          return false;
        const region = resolveRegion(m.number.phoneNumber);
        if (region.callingCode !== callingCode) return false;
        // Shared/non-geographic destinations (e.g. +1 800, +800) are matched
        // by their calling plan. Geographic countries sharing +1 or +7 remain
        // separate; US must never accidentally include CA, DO, PR, etc.
        return (
          !country ||
          (region.country ?? m.number.isoCountry.toUpperCase()) === country
        );
      });
      if (!eligible.length) {
        return {
          phoneNumber: null,
          numberId: null,
          rotated: false,
          reason: RotationReason.NO_CALLER_ID_FOR_COUNTRY,
        };
      }
      const usage = await this.rotationRepo.usageForNumbers(
        eligible.map((m) => m.numberId),
        this.today(),
      );
      const underCap = eligible.filter(
        (m) =>
          (usage.get(m.numberId)?.count ?? 0) <
          (m.dailyCap ?? settings.defaultDailyCap),
      );
      if (!underCap.length && !opts.allowOverCap) {
        return {
          phoneNumber: null,
          numberId: null,
          rotated: false,
          reason: RotationReason.ALL_OVER_CAP,
        };
      }
      const pool = underCap.length ? underCap : eligible;
      let subset = pool;
      if (settings.strategy === "local_presence") {
        const regions = new Map(
          pool.map((m) => [m.numberId, resolveRegion(m.number.phoneNumber)]),
        );
        const sameArea = areaCode
          ? pool.filter((m) => regions.get(m.numberId)?.areaCode === areaCode)
          : [];
        const sameState = state
          ? pool.filter((m) => regions.get(m.numberId)?.state === state)
          : [];
        subset = sameArea.length
          ? sameArea
          : sameState.length
            ? sameState
            : pool;
      }
      const pick = this.rank(subset)[0];
      if (await this.rotationRepo.markUsed(pick.numberId, pick.lastUsedAt)) {
        return {
          phoneNumber: pick.number.phoneNumber,
          numberId: pick.numberId,
          rotated: true,
          reason: RotationReason.ROTATED,
        };
      }
    }
    throw new ConflictException("Caller ID selection is busy. Please retry.");
  }

  /** Best health, then least-recently-used (nulls first), with stable ties. */
  private rank(members: PoolMemberWithNumber[]): PoolMemberWithNumber[] {
    return [...members].sort((a, b) => {
      if (b.healthScore !== a.healthScore) return b.healthScore - a.healthScore;
      const at = a.lastUsedAt ? a.lastUsedAt.getTime() : 0;
      const bt = b.lastUsedAt ? b.lastUsedAt.getTime() : 0;
      return at - bt || a.numberId.localeCompare(b.numberId);
    });
  }

  // ===========================================================================
  // Per-call accounting (called from the call webhook handlers)
  // ===========================================================================

  /**
   * Resolve the owned number for Call.callerIdId audit. Usage is derived from
   * persisted calls by the repository, so repeated webhooks cannot inflate it.
   */
  async registerOutboundCall(
    ctx: OwnershipContext,
    fromNumber: string,
  ): Promise<string | null> {
    return (
      (await this.numberRepo.findOwnedByPhone(ctx, fromNumber))?.id ?? null
    );
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
    if (patch.enabled !== undefined && typeof patch.enabled !== "boolean") {
      throw new BadRequestException("enabled must be a boolean");
    }
    if (
      patch.defaultDailyCap !== undefined &&
      (!Number.isInteger(patch.defaultDailyCap) ||
        patch.defaultDailyCap < 0 ||
        patch.defaultDailyCap > 2147483647)
    ) {
      throw new BadRequestException(
        "defaultDailyCap must be a non-negative 32-bit integer",
      );
    }

    await this.rotationRepo.upsertSettings(ctx, {
      enabled: patch.enabled,
      strategy: patch.strategy,
      defaultDailyCap: patch.defaultDailyCap,
    });
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
    return members.map((m) => {
      const region = resolveRegion(m.number.phoneNumber);
      return {
        numberId: m.numberId,
        phoneNumber: m.number.phoneNumber,
        isoCountry: region.country ?? m.number.isoCountry.toUpperCase(),
        kind: m.number.kind,
        areaCode: region.areaCode,
        callingCode: region.callingCode,
        state: region.state,
        rotationStatus: m.rotationStatus,
        participating: m.participating,
        dailyCap: m.dailyCap ?? defaultCap,
        dailyCapOverride: m.dailyCap,
        usedToday: usage.get(m.numberId)?.count ?? 0,
        healthScore: m.healthScore,
        lastUsedAt: m.lastUsedAt,
        coolingUntil: m.coolingUntil,
      };
    });
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
    const member = await this.rotationRepo.findPoolMemberByNumberId(
      numberId,
      ctx,
    );
    if (!member || !this.ownsMember(ctx, member)) {
      throw new BadRequestException("Number is not in this workspace's pool");
    }
    if (
      patch.dailyCap != null &&
      (!Number.isInteger(patch.dailyCap) ||
        patch.dailyCap < 0 ||
        patch.dailyCap > 2147483647)
    ) {
      throw new BadRequestException(
        "dailyCap must be a non-negative 32-bit integer",
      );
    }
    if (
      patch.participating !== undefined &&
      typeof patch.participating !== "boolean"
    ) {
      throw new BadRequestException("participating must be a boolean");
    }
    if (
      patch.status !== undefined &&
      patch.status !== "active" &&
      patch.status !== "disabled"
    ) {
      throw new BadRequestException("status must be active or disabled");
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
    if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 365) {
      throw new BadRequestException(
        "windowDays must be an integer between 1 and 365",
      );
    }
    const members = await this.rotationRepo.listPoolMembers(ctx);
    const since = new Date(this.today());
    since.setUTCDate(since.getUTCDate() - Math.max(0, windowDays - 1));
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
    since.setUTCDate(since.getUTCDate() - Math.max(0, windowDays - 1));
    const members = await this.rotationRepo.listMembersForHealthRecompute();

    let cooled = 0;
    let recovered = 0;
    const now = new Date();

    for (const m of members) {
      const sampleSince =
        m.coolingUntil && m.coolingUntil > since ? m.coolingUntil : since;
      const u = await this.rotationRepo.usageSince(m.numberId, sampleSince);
      // An expired cooling period must allow fresh observations: an excluded
      // number cannot improve its answer rate while it receives no calls.
      if (
        m.rotationStatus === "cooling" &&
        m.coolingUntil &&
        m.coolingUntil <= now
      ) {
        await this.rotationRepo.updatePoolMember(m.numberId, {
          rotationStatus: "active",
          // Retain the end of the rest period as the next sample's lower
          // bound, so old failed calls do not immediately cool it again.
          healthScore: 100,
        });
        recovered++;
        continue;
      }
      if (u.count === 0) continue;

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
