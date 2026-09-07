import { Injectable } from "@nestjs/common";
import {
  Prisma,
  CallerIdRotationSettings,
  CallerIdPoolMember,
  NumberPurchased,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";

export type PoolMemberWithNumber = CallerIdPoolMember & {
  number: NumberPurchased;
};

/**
 * Data access for caller-ID rotation: the per-workspace settings singleton,
 * the rotation pool members, and usage aggregated from persisted calls.
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
    return this.prisma.callerIdRotationSettings.findFirst({
      where: { userId: ctx.userId, organizationId: null },
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
      where: {
        ...buildOwnershipFilter(ctx),
        number: { ...buildOwnershipFilter(ctx), deletedAt: null },
      },
      include: { number: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async findPoolMemberByNumberId(
    numberId: string,
    ctx: OwnershipContext,
  ): Promise<CallerIdPoolMember | null> {
    return this.prisma.callerIdPoolMember.findFirst({
      where: {
        numberId,
        ...buildOwnershipFilter(ctx),
        number: { ...buildOwnershipFilter(ctx), deletedAt: null },
      },
    });
  }

  /**
   * Eligible candidates for selection: participating + active members of this
   * workspace whose number presents in `isoCountry` (the hard country filter).
   * Daily-cap filtering is applied in the service using `usageForNumbers`.
   */
  async findEligibleMembers(
    ctx: OwnershipContext,
    isoCountry?: string,
  ): Promise<PoolMemberWithNumber[]> {
    return this.prisma.callerIdPoolMember.findMany({
      where: {
        ...buildOwnershipFilter(ctx),
        participating: true,
        rotationStatus: "active",
        number: { ...buildOwnershipFilter(ctx), isoCountry, deletedAt: null },
      },
      include: { number: true },
    });
  }

  async createPoolMember(
    ctx: OwnershipContext,
    numberId: string,
    data: { areaCode?: string | null; dailyCap?: number | null } = {},
  ): Promise<CallerIdPoolMember> {
    return this.prisma.callerIdPoolMember.upsert({
      where: { numberId },
      // Scalar relations and a non-empty no-op update permit a database-native
      // upsert. Nested connects can turn this into a racy read-then-create.
      update: { numberId },
      create: {
        numberId,
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
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
      where: {
        rotationStatus: { in: ["active", "cooling"] },
        number: { deletedAt: null },
      },
      include: { number: true },
    });
  }

  // ---------------------------------------------------------------------------
  // Daily usage
  // ---------------------------------------------------------------------------

  /** Call rows are the idempotent source: webhook redeliveries are not calls. */
  async usageForNumbers(
    numberIds: string[],
    day: Date,
  ): Promise<
    Map<string, { count: number; answered: number; shortCalls: number }>
  > {
    const until = new Date(day);
    until.setUTCDate(until.getUTCDate() + 1);
    return this.aggregateCallUsage(numberIds, day, until);
  }

  /** Mark a number as just selected (drives least-recently-used ordering). */
  async markUsed(
    numberId: string,
    previousLastUsedAt: Date | null,
  ): Promise<boolean> {
    const result = await this.prisma.callerIdPoolMember.updateMany({
      where: {
        numberId,
        lastUsedAt: previousLastUsedAt,
        participating: true,
        rotationStatus: "active",
      },
      data: {
        lastUsedAt: new Date(
          Math.max(Date.now(), (previousLastUsedAt?.getTime() ?? 0) + 1),
        ),
      },
    });
    return result.count === 1;
  }

  /** Aggregated usage for one number in the reporting / health window. */
  async usageSince(
    numberId: string,
    since: Date,
  ): Promise<{ count: number; answered: number; shortCalls: number }> {
    const usage = await this.aggregateCallUsage([numberId], since);
    return usage.get(numberId) ?? { count: 0, answered: 0, shortCalls: 0 };
  }

  /**
   * The old counters counted deliveries and dated answers at receipt time,
   * inflating caps/reputation on retries and splitting calls across midnight.
   * Read persisted calls, on their start day, through the indexed fromNumber.
   * Joining workspace ownership prevents reassigned numbers mixing tenants.
   */
  private async aggregateCallUsage(
    numberIds: string[],
    since: Date,
    until?: Date,
  ) {
    if (!numberIds.length)
      return new Map<
        string,
        { count: number; answered: number; shortCalls: number }
      >();
    const rows = await this.prisma.$queryRaw<
      Array<{
        numberId: string;
        count: number;
        answered: number;
        shortCalls: number;
      }>
    >(Prisma.sql`
      SELECT n.id AS "numberId", COUNT(*)::int AS count,
        COUNT(*) FILTER (WHERE c."answeredAt" IS NOT NULL)::int AS answered,
        COUNT(*) FILTER (WHERE c."answeredAt" IS NOT NULL AND c."endedAt" IS NOT NULL
          AND c."endedAt" >= c."answeredAt"
          AND c."endedAt" - c."answeredAt" < INTERVAL '5 seconds')::int AS "shortCalls"
      FROM "NumberPurchased" n
      JOIN "Call" c ON c."fromNumber" = n."phoneNumber"
        AND ((n."organizationId" IS NOT NULL AND c."organizationId" = n."organizationId")
          OR (n."organizationId" IS NULL AND c."organizationId" IS NULL AND c."userId" = n."userId"))
      WHERE n.id IN (${Prisma.join(numberIds.map((id) => Prisma.sql`${id}::uuid`))})
        AND c.direction = 'outbound' AND c."callControlId" IS NOT NULL
        AND COALESCE(c."startedAt", c."createdAt") >= (${since}::timestamptz AT TIME ZONE 'UTC')
        ${until ? Prisma.sql`AND COALESCE(c."startedAt", c."createdAt") < (${until}::timestamptz AT TIME ZONE 'UTC')` : Prisma.empty}
      GROUP BY n.id
    `);
    return new Map(rows.map((row) => [row.numberId, row]));
  }
}
