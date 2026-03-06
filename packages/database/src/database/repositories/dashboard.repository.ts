import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { subMonths, subWeeks } from "date-fns";
import { CallStatus } from "@prisma/client";
import { DashboardContext } from "@ringee/platform";

/**
 * Build ownership filter for dashboard queries.
 * 
 * For org admins:
 * - No filterMemberId: show all org data
 * - With filterMemberId: show only that member's data
 * 
 * For org members:
 * - Always filter by their own userId
 * 
 * For personal accounts:
 * - Filter by userId with organizationId = null
 */
function buildDashboardFilter(ctx: DashboardContext) {
  // Personal account (no org)
  if (!ctx.organizationId) {
    return {
      userId: ctx.userId,
      organizationId: null,
    };
  }

  // Org admin: can see all org data or filter by member
  if (ctx.isOrgAdmin) {
    if (ctx.filterMemberId) {
      return {
        userId: ctx.filterMemberId,
        organizationId: ctx.organizationId,
      };
    }
    // Show all org data (no userId filter)
    return {
      organizationId: ctx.organizationId,
    };
  }

  // Org member: only their own data
  return {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
  };
}

@Injectable()
export class DashboardRepository {
  constructor(private prisma: PrismaService) { }

  async getOverview(ctx: DashboardContext, start: Date, end: Date) {
    const ownershipFilter = buildDashboardFilter(ctx);

    const [total, answered, missed, avg] = await Promise.all([
      this.prisma.call.count({
        where: { ...ownershipFilter, createdAt: { gte: start, lte: end } },
      }),
      this.prisma.call.count({
        where: {
          ...ownershipFilter,
          status: CallStatus.completed,
          createdAt: { gte: start, lte: end },
        },
      }),
      this.prisma.call.count({
        where: {
          ...ownershipFilter,
          status: { not: CallStatus.completed },
          createdAt: { gte: start, lte: end },
        },
      }),
      this.prisma.call.aggregate({
        where: {
          ...ownershipFilter,
          createdAt: { gte: start, lte: end },
          durationSeconds: { not: null },
        },
        _avg: { durationSeconds: true },
      }),
    ]);

    const prevStart = subMonths(start, 1);
    const prevEnd = start;

    const prevAvg = await this.prisma.call.aggregate({
      where: {
        ...ownershipFilter,
        createdAt: { gte: prevStart, lte: prevEnd },
        durationSeconds: { not: null },
      },
      _avg: { durationSeconds: true },
    });

    const currentDuration = avg._avg.durationSeconds ?? 0;
    const previousDuration = prevAvg._avg.durationSeconds ?? 0;

    const durationChange =
      previousDuration > 0
        ? ((currentDuration - previousDuration) / previousDuration) * 100
        : 0;

    const lastWeekStart = subWeeks(end, 1);
    const prevWeekStart = subWeeks(end, 2);

    const [currentWeek, previousWeek] = await Promise.all([
      this.prisma.call.count({
        where: { ...ownershipFilter, createdAt: { gte: lastWeekStart, lte: end } },
      }),
      this.prisma.call.count({
        where: {
          ...ownershipFilter,
          createdAt: { gte: prevWeekStart, lte: lastWeekStart },
        },
      }),
    ]);

    const weeklyGrowth =
      previousWeek === 0
        ? 0
        : ((currentWeek - previousWeek) / previousWeek) * 100;

    const lastMonthStart = subMonths(end, 1);
    const prevMonthStart = subMonths(end, 2);

    const [currentMonth, previousMonth] = await Promise.all([
      this.prisma.call.count({
        where: { ...ownershipFilter, createdAt: { gte: lastMonthStart, lte: end } },
      }),
      this.prisma.call.count({
        where: {
          ...ownershipFilter,
          createdAt: { gte: prevMonthStart, lte: lastMonthStart },
        },
      }),
    ]);

    const growthRate =
      previousMonth === 0
        ? 0
        : ((currentMonth - previousMonth) / previousMonth) * 100;

    const answerRate = total > 0 ? (answered / total) * 100 : 0;
    const missedRate = total > 0 ? (missed / total) * 100 : 0;

    return {
      total,
      answered,
      missed,
      averageDuration: parseFloat((currentDuration || 0).toFixed(1)),
      durationChange: parseFloat(durationChange.toFixed(1)),
      weeklyGrowth: parseFloat(weeklyGrowth.toFixed(1)),
      growthRate: parseFloat(growthRate.toFixed(1)),
      answerRate: parseFloat(answerRate.toFixed(1)),
      missedRate: parseFloat(missedRate.toFixed(1)),
    };
  }

  async getCallsPerDay(ctx: DashboardContext, from: Date) {
    const filter = buildDashboardFilter(ctx);

    // Build SQL WHERE conditions dynamically based on filter
    if (filter.organizationId && filter.userId) {
      // Admin filtering by specific member OR org member viewing their own data
      return this.prisma.$queryRaw<
        { date: string; answered: number; missed: number }[]
      >`
        SELECT
          DATE("startedAt") AS date,
          COUNT(*) FILTER (WHERE "status" = 'completed')::int AS answered,
          COUNT(*) FILTER (WHERE "status" != 'completed')::int AS missed
        FROM "Call"
        WHERE "userId" = ${filter.userId}::uuid
          AND "organizationId" = ${filter.organizationId}::uuid
          AND "startedAt" >= ${from}
        GROUP BY DATE("startedAt")
        ORDER BY DATE("startedAt") ASC
      `;
    }

    if (filter.organizationId && !filter.userId) {
      // Admin viewing all org data (no specific member filter)
      return this.prisma.$queryRaw<
        { date: string; answered: number; missed: number }[]
      >`
        SELECT
          DATE("startedAt") AS date,
          COUNT(*) FILTER (WHERE "status" = 'completed')::int AS answered,
          COUNT(*) FILTER (WHERE "status" != 'completed')::int AS missed
        FROM "Call"
        WHERE "organizationId" = ${filter.organizationId}::uuid
          AND "startedAt" >= ${from}
        GROUP BY DATE("startedAt")
        ORDER BY DATE("startedAt") ASC
      `;
    }

    // Personal calls (no organization)
    return this.prisma.$queryRaw<
      { date: string; answered: number; missed: number }[]
    >`
      SELECT
        DATE("startedAt") AS date,
        COUNT(*) FILTER (WHERE "status" = 'completed')::int AS answered,
        COUNT(*) FILTER (WHERE "status" != 'completed')::int AS missed
      FROM "Call"
      WHERE "userId" = ${filter.userId}::uuid
        AND "organizationId" IS NULL
        AND "startedAt" >= ${from}
      GROUP BY DATE("startedAt")
      ORDER BY DATE("startedAt") ASC
    `;
  }

  async getCallsPerMonth(ctx: DashboardContext, from: Date) {
    const filter = buildDashboardFilter(ctx);

    if (filter.organizationId && filter.userId) {
      // Admin filtering by specific member OR org member viewing their own data
      return this.prisma.$queryRaw<
        { month: string; answered: number; missed: number }[]
      >`
        SELECT
          TO_CHAR("startedAt", 'Mon') AS month,
          COUNT(*) FILTER (WHERE "status" = 'completed')::int AS answered,
          COUNT(*) FILTER (WHERE "status" != 'completed')::int AS missed
        FROM "Call"
        WHERE "userId" = ${filter.userId}::uuid
          AND "organizationId" = ${filter.organizationId}::uuid
          AND "startedAt" >= ${from}
        GROUP BY month
        ORDER BY MIN("startedAt") ASC
      `;
    }

    if (filter.organizationId && !filter.userId) {
      // Admin viewing all org data (no specific member filter)
      return this.prisma.$queryRaw<
        { month: string; answered: number; missed: number }[]
      >`
        SELECT
          TO_CHAR("startedAt", 'Mon') AS month,
          COUNT(*) FILTER (WHERE "status" = 'completed')::int AS answered,
          COUNT(*) FILTER (WHERE "status" != 'completed')::int AS missed
        FROM "Call"
        WHERE "organizationId" = ${filter.organizationId}::uuid
          AND "startedAt" >= ${from}
        GROUP BY month
        ORDER BY MIN("startedAt") ASC
      `;
    }

    // Personal calls (no organization)
    return this.prisma.$queryRaw<
      { month: string; answered: number; missed: number }[]
    >`
      SELECT
        TO_CHAR("startedAt", 'Mon') AS month,
        COUNT(*) FILTER (WHERE "status" = 'completed')::int AS answered,
        COUNT(*) FILTER (WHERE "status" != 'completed')::int AS missed
      FROM "Call"
      WHERE "userId" = ${filter.userId}::uuid
        AND "organizationId" IS NULL
        AND "startedAt" >= ${from}
      GROUP BY month
      ORDER BY MIN("startedAt") ASC
    `;
  }

  async getCallsByPeriod(ctx: DashboardContext, from: Date) {
    const filter = buildDashboardFilter(ctx);
    let data: { period: string; total: number }[];

    if (filter.organizationId && filter.userId) {
      // Admin filtering by specific member OR org member viewing their own data
      data = await this.prisma.$queryRaw<{ period: string; total: number }[]>`
        SELECT
          CASE
            WHEN EXTRACT(HOUR FROM "startedAt") BETWEEN 6 AND 11 THEN 'morning'
            WHEN EXTRACT(HOUR FROM "startedAt") BETWEEN 12 AND 17 THEN 'afternoon'
            WHEN EXTRACT(HOUR FROM "startedAt") BETWEEN 18 AND 23 THEN 'evening'
            ELSE 'night'
          END AS period,
          COUNT(*)::int AS total
        FROM "Call"
        WHERE "userId" = ${filter.userId}::uuid
          AND "organizationId" = ${filter.organizationId}::uuid
          AND "startedAt" >= ${from}
        GROUP BY period
        ORDER BY period;
      `;
    } else if (filter.organizationId && !filter.userId) {
      // Admin viewing all org data (no specific member filter)
      data = await this.prisma.$queryRaw<{ period: string; total: number }[]>`
        SELECT
          CASE
            WHEN EXTRACT(HOUR FROM "startedAt") BETWEEN 6 AND 11 THEN 'morning'
            WHEN EXTRACT(HOUR FROM "startedAt") BETWEEN 12 AND 17 THEN 'afternoon'
            WHEN EXTRACT(HOUR FROM "startedAt") BETWEEN 18 AND 23 THEN 'evening'
            ELSE 'night'
          END AS period,
          COUNT(*)::int AS total
        FROM "Call"
        WHERE "organizationId" = ${filter.organizationId}::uuid
          AND "startedAt" >= ${from}
        GROUP BY period
        ORDER BY period;
      `;
    } else {
      // Personal calls (no organization)
      data = await this.prisma.$queryRaw<{ period: string; total: number }[]>`
        SELECT
          CASE
            WHEN EXTRACT(HOUR FROM "startedAt") BETWEEN 6 AND 11 THEN 'morning'
            WHEN EXTRACT(HOUR FROM "startedAt") BETWEEN 12 AND 17 THEN 'afternoon'
            WHEN EXTRACT(HOUR FROM "startedAt") BETWEEN 18 AND 23 THEN 'evening'
            ELSE 'night'
          END AS period,
          COUNT(*)::int AS total
        FROM "Call"
        WHERE "userId" = ${filter.userId}::uuid
          AND "organizationId" IS NULL
          AND "startedAt" >= ${from}
        GROUP BY period
        ORDER BY period;
      `;
    }

    const rangeStart = from;
    const rangeEnd = new Date();

    return { data, rangeStart, rangeEnd };
  }

  async getRecentCalls(ctx: DashboardContext, limit = 5) {
    const ownershipFilter = buildDashboardFilter(ctx);

    return this.prisma.call.findMany({
      where: ownershipFilter,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { contact: true },
    });
  }
}

