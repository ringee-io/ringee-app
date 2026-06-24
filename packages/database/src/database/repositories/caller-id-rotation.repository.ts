import { Injectable } from "@nestjs/common";
import {
  Prisma,
  CallerIdRotationSettings,
  CallerIdPoolMember,
  CallerIdDailyUsage,
  NumberPurchased,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";

export type PoolMemberWithNumber = CallerIdPoolMember & {
  number: NumberPurchased;
};

/**
 * Data access for caller-ID rotation: the per-workspace settings singleton,
 * the rotation pool members, and the per-number daily usage counters.
 */
@Injectable()
export class CallerIdRotationRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Settings (per-workspace singleton, mirrors CallRecordingSettings)
  // ---------------------------------------------------------------------------

  async findSettings(
    ctx: OwnershipContext,
  ): Promise<CallerIdRotationSettings | null> {
    if (ctx.organizationId) {
      return this.prisma.callerIdRotationSettings.findUnique({
        where: { organizationId: ctx.organizationId },
      });
    }
    return this.prisma.callerIdRotationSettings.findUnique({
      where: { userId: ctx.userId },
    });
  }

  async upsertSettings(
    ctx: OwnershipContext,
    data: {
      enabled?: boolean;
      strategy?: string;
      defaultDailyCap?: number;
    },
  ): Promise<CallerIdRotationSettings> {
    if (ctx.organizationId) {
      return this.prisma.callerIdRotationSettings.upsert({
        where: { organizationId: ctx.organizationId },
        create: {
          organization: { connect: { id: ctx.organizationId } },
          ...data,
        },
        update: data,
      });
    }
    return this.prisma.callerIdRotationSettings.upsert({
      where: { userId: ctx.userId },
      create: { user: { connect: { id: ctx.userId } }, ...data },
      update: data,
    });
  }

  // ---------------------------------------------------------------------------
  // Pool members
  // ---------------------------------------------------------------------------

  async listPoolMembers(
    ctx: OwnershipContext,
  ): Promise<PoolMemberWithNumber[]> {
    return this.prisma.callerIdPoolMember.findMany({
      where: buildOwnershipFilter(ctx),
      include: { number: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async findPoolMemberByNumberId(
    numberId: string,
  ): Promise<CallerIdPoolMember | null> {
    return this.prisma.callerIdPoolMember.findUnique({ where: { numberId } });
  }

  /**
   * Eligible candidates for selection: participating + active members of this
   * workspace whose number presents in `isoCountry` (the hard country filter).
   * Daily-cap filtering is applied in the service using `usageForNumbers`.
   */
  async findEligibleMembers(
    ctx: OwnershipContext,
    isoCountry: string,
  ): Promise<PoolMemberWithNumber[]> {
    return this.prisma.callerIdPoolMember.findMany({
      where: {
        ...buildOwnershipFilter(ctx),
        participating: true,
        rotationStatus: "active",
        number: { isoCountry, deletedAt: null },
      },
      include: { number: true },
    });
  }

  async createPoolMember(
    ctx: OwnershipContext,
    numberId: string,
    data: { areaCode?: string | null; dailyCap?: number | null } = {},
  ): Promise<CallerIdPoolMember> {
    return this.prisma.callerIdPoolMember.create({
      data: {
        number: { connect: { id: numberId } },
        user: { connect: { id: ctx.userId } },
        organization: ctx.organizationId
          ? { connect: { id: ctx.organizationId } }
          : undefined,
        areaCode: data.areaCode ?? null,
        dailyCap: data.dailyCap ?? null,
      },
    });
  }

  async updatePoolMember(
    numberId: string,
    data: Prisma.CallerIdPoolMemberUpdateInput,
  ): Promise<CallerIdPoolMember> {
    return this.prisma.callerIdPoolMember.update({
      where: { numberId },
      data,
    });
  }

  /** All members across every workspace that the health job should evaluate. */
  async listMembersForHealthRecompute(): Promise<PoolMemberWithNumber[]> {
    return this.prisma.callerIdPoolMember.findMany({
      where: { rotationStatus: { in: ["active", "cooling"] } },
      include: { number: true },
    });
  }

  // ---------------------------------------------------------------------------
  // Daily usage
  // ---------------------------------------------------------------------------

  /** Usage rows for a set of numbers on a given day, keyed by numberId. */
  async usageForNumbers(
    numberIds: string[],
    day: Date,
  ): Promise<Map<string, CallerIdDailyUsage>> {
    if (numberIds.length === 0) return new Map();
    const rows = await this.prisma.callerIdDailyUsage.findMany({
      where: { numberId: { in: numberIds }, day },
    });
    return new Map(rows.map((r) => [r.numberId, r]));
  }

  /** Mark a number as just selected (drives least-recently-used ordering). */
  async markUsed(numberId: string): Promise<void> {
    await this.prisma.callerIdPoolMember.update({
      where: { numberId },
      data: { lastUsedAt: new Date() },
    });
  }

  /**
   * Increment a daily counter for a number. `count` is bumped per outbound call
   * (the daily-cap + calls/day metric); `answered`/`shortCalls` track outcomes
   * for health scoring. Safe no-op semantics via upsert.
   */
  async incrementUsage(
    numberId: string,
    day: Date,
    field: "count" | "answered" | "shortCalls",
  ): Promise<void> {
    await this.prisma.callerIdDailyUsage.upsert({
      where: { numberId_day: { numberId, day } },
      create: { numberId, day, [field]: 1 },
      update: { [field]: { increment: 1 } },
    });
  }

  /** Aggregated usage for one number since `since` (health + reporting window). */
  async usageSince(
    numberId: string,
    since: Date,
  ): Promise<{ count: number; answered: number; shortCalls: number }> {
    const agg = await this.prisma.callerIdDailyUsage.aggregate({
      where: { numberId, day: { gte: since } },
      _sum: { count: true, answered: true, shortCalls: true },
    });
    return {
      count: agg._sum.count ?? 0,
      answered: agg._sum.answered ?? 0,
      shortCalls: agg._sum.shortCalls ?? 0,
    };
  }
}
