import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CallOutcome, CallStatus, MeetingStatus, Prisma } from "@prisma/client";
import { DashboardContext } from "@ringee/platform";

/**
 * Build ownership filter for dashboard queries.
 *
 * For personal scope: always filter by userId + organizationId IS NULL
 * For organization scope (admins): filter by organizationId, optionally narrowing
 * to a specific member. Non-admins are always restricted to their own data.
 */
function buildDashboardFilter(ctx: DashboardContext): Prisma.CallWhereInput {
  if (!ctx.organizationId || ctx.scope === "personal") {
    return { userId: ctx.userId, organizationId: null };
  }

  if (ctx.isOrgAdmin) {
    if (ctx.filterMemberId) {
      return {
        userId: ctx.filterMemberId,
        organizationId: ctx.organizationId,
      };
    }
    return { organizationId: ctx.organizationId };
  }

  return { userId: ctx.userId, organizationId: ctx.organizationId };
}

function buildMeetingFilter(ctx: DashboardContext): Prisma.MeetingWhereInput {
  if (!ctx.organizationId || ctx.scope === "personal") {
    return { userId: ctx.userId, organizationId: null };
  }

  if (ctx.isOrgAdmin) {
    if (ctx.filterMemberId) {
      return {
        userId: ctx.filterMemberId,
        organizationId: ctx.organizationId,
      };
    }
    return { organizationId: ctx.organizationId };
  }

  return { userId: ctx.userId, organizationId: ctx.organizationId };
}

function dateRange(ctx: DashboardContext) {
  if (ctx.dateRange) return ctx.dateRange;
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);
  return { start, end };
}

const ANSWERED_STATUSES: CallStatus[] = [
  CallStatus.answered,
  CallStatus.recording,
  CallStatus.completed,
];

@Injectable()
export class DashboardRepository {
  constructor(private prisma: PrismaService) {}

  /**
   * Returns outcome-based KPI counts for the requested period.
   */
  async getKpis(ctx: DashboardContext) {
    const owner = buildDashboardFilter(ctx);
    const meetingOwner = buildMeetingFilter(ctx);
    const { start, end } = dateRange(ctx);

    const callBaseWhere: Prisma.CallWhereInput = {
      ...owner,
      startedAt: { gte: start, lte: end },
      ...(ctx.campaignId
        ? { callAttempts: { some: { campaignId: ctx.campaignId } } }
        : {}),
      ...(ctx.outcome ? { outcome: ctx.outcome as CallOutcome } : {}),
    };

    const countByOutcome = (outcome: CallOutcome) =>
      this.prisma.call.count({
        where: { ...callBaseWhere, outcome },
      });

    const [
      totalCalls,
      answeredCalls,
      meetingBooked,
      sales,
      interested,
      followUps,
      notInterested,
      noAnswer,
      voicemail,
      wrongNumber,
      gatekeeper,
      meetingsScheduled,
      avgDurationAgg,
    ] = await Promise.all([
      this.prisma.call.count({ where: callBaseWhere }),
      this.prisma.call.count({
        where: {
          ...callBaseWhere,
          OR: [
            { status: { in: ANSWERED_STATUSES } },
            { answeredAt: { not: null } },
          ],
        },
      }),
      countByOutcome(CallOutcome.meeting_booked),
      countByOutcome(CallOutcome.sale),
      countByOutcome(CallOutcome.interested),
      countByOutcome(CallOutcome.follow_up),
      countByOutcome(CallOutcome.not_interested),
      countByOutcome(CallOutcome.no_answer),
      countByOutcome(CallOutcome.voicemail),
      countByOutcome(CallOutcome.wrong_number),
      countByOutcome(CallOutcome.gatekeeper),
      this.prisma.meeting.count({
        where: {
          ...meetingOwner,
          scheduledAt: { gte: start, lte: end },
        },
      }),
      this.prisma.call.aggregate({
        where: {
          ...callBaseWhere,
          durationSeconds: { not: null },
        },
        _avg: { durationSeconds: true },
      }),
    ]);

    const conversionRate = answeredCalls > 0 ? (sales / answeredCalls) * 100 : 0;
    const meetingRate =
      answeredCalls > 0 ? (meetingsScheduled / answeredCalls) * 100 : 0;
    const positiveOutcomeRate =
      answeredCalls > 0
        ? ((sales + meetingBooked + interested) / answeredCalls) * 100
        : 0;
    const answerRate =
      totalCalls > 0 ? (answeredCalls / totalCalls) * 100 : 0;

    return {
      totalCalls,
      answeredCalls,
      meetingsBooked: meetingsScheduled,
      meetingOutcomeNoEvent: Math.max(meetingBooked - meetingsScheduled, 0),
      sales,
      interested,
      followUps,
      notInterested,
      noAnswer,
      voicemail,
      wrongNumber,
      gatekeeper,
      conversionRate: round(conversionRate),
      meetingRate: round(meetingRate),
      positiveOutcomeRate: round(positiveOutcomeRate),
      answerRate: round(answerRate),
      averageDuration: round(avgDurationAgg._avg.durationSeconds ?? 0),
      rangeStart: start.toISOString(),
      rangeEnd: end.toISOString(),
    };
  }

  /**
   * Outcome funnel: Total → Answered → Interested → Meetings → Sales.
   */
  async getOutcomeFunnel(ctx: DashboardContext) {
    const kpis = await this.getKpis(ctx);
    return [
      { label: "Total Calls", value: kpis.totalCalls },
      { label: "Answered", value: kpis.answeredCalls },
      { label: "Interested", value: kpis.interested },
      { label: "Meetings Booked", value: kpis.meetingsBooked },
      { label: "Sales", value: kpis.sales },
    ];
  }

  /**
   * Outcomes over time grouped by day/week/month based on range length.
   */
  async getOutcomesOverTime(ctx: DashboardContext) {
    const owner = buildDashboardFilter(ctx);
    const { start, end } = dateRange(ctx);

    const days = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / 86_400_000),
    );
    const granularity: "day" | "week" | "month" =
      days <= 31 ? "day" : days <= 120 ? "week" : "month";

    const trunc =
      granularity === "day"
        ? "day"
        : granularity === "week"
          ? "week"
          : "month";

    const orgFilter = ctx.organizationId
      ? Prisma.sql`AND "organizationId" = ${ctx.organizationId}::uuid`
      : Prisma.sql`AND "organizationId" IS NULL`;

    const userFilter =
      "userId" in owner && owner.userId
        ? Prisma.sql`AND "userId" = ${owner.userId}::uuid`
        : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      {
        bucket: Date;
        sales: number;
        meeting_booked: number;
        interested: number;
        follow_up: number;
        no_answer: number;
      }[]
    >`
      SELECT
        DATE_TRUNC(${trunc}, "startedAt") AS bucket,
        COUNT(*) FILTER (WHERE outcome = 'sale')::int AS sales,
        COUNT(*) FILTER (WHERE outcome = 'meeting_booked')::int AS meeting_booked,
        COUNT(*) FILTER (WHERE outcome = 'interested')::int AS interested,
        COUNT(*) FILTER (WHERE outcome = 'follow_up')::int AS follow_up,
        COUNT(*) FILTER (WHERE outcome = 'no_answer')::int AS no_answer
      FROM "Call"
      WHERE "startedAt" IS NOT NULL
        AND "startedAt" >= ${start}
        AND "startedAt" <= ${end}
        ${userFilter}
        ${orgFilter}
      GROUP BY bucket
      ORDER BY bucket ASC
    `;

    return {
      granularity,
      data: rows.map((r) => ({
        bucket: r.bucket,
        sales: Number(r.sales),
        meetingsBooked: Number(r.meeting_booked),
        interested: Number(r.interested),
        followUps: Number(r.follow_up),
        noAnswer: Number(r.no_answer),
      })),
    };
  }

  /**
   * Best time of day — sales / meetings / interested per hour bucket (0-23).
   */
  async getBestTimeOfDay(ctx: DashboardContext) {
    const owner = buildDashboardFilter(ctx);
    const { start, end } = dateRange(ctx);

    const orgFilter = ctx.organizationId
      ? Prisma.sql`AND "organizationId" = ${ctx.organizationId}::uuid`
      : Prisma.sql`AND "organizationId" IS NULL`;

    const userFilter =
      "userId" in owner && owner.userId
        ? Prisma.sql`AND "userId" = ${owner.userId}::uuid`
        : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      {
        hour: number;
        sales: number;
        meetings: number;
        interested: number;
        total: number;
      }[]
    >`
      SELECT
        EXTRACT(HOUR FROM "startedAt")::int AS hour,
        COUNT(*) FILTER (WHERE outcome = 'sale')::int AS sales,
        COUNT(*) FILTER (WHERE outcome = 'meeting_booked')::int AS meetings,
        COUNT(*) FILTER (WHERE outcome = 'interested')::int AS interested,
        COUNT(*)::int AS total
      FROM "Call"
      WHERE "startedAt" IS NOT NULL
        AND "startedAt" >= ${start}
        AND "startedAt" <= ${end}
        ${userFilter}
        ${orgFilter}
      GROUP BY hour
      ORDER BY hour ASC
    `;

    const map = new Map(rows.map((r) => [Number(r.hour), r]));
    return Array.from({ length: 24 }, (_, hour) => {
      const r = map.get(hour);
      return {
        hour,
        sales: r ? Number(r.sales) : 0,
        meetings: r ? Number(r.meetings) : 0,
        interested: r ? Number(r.interested) : 0,
        total: r ? Number(r.total) : 0,
      };
    });
  }

  /**
   * Distribution of calls by outcome (for donut/horizontal bar chart).
   */
  async getCallsByOutcome(ctx: DashboardContext) {
    const owner = buildDashboardFilter(ctx);
    const { start, end } = dateRange(ctx);

    const grouped = await this.prisma.call.groupBy({
      by: ["outcome"],
      where: {
        ...owner,
        startedAt: { gte: start, lte: end },
        outcome: { not: null },
        ...(ctx.campaignId
          ? { callAttempts: { some: { campaignId: ctx.campaignId } } }
          : {}),
      },
      _count: { _all: true },
    });

    return grouped
      .map((g) => ({
        outcome: g.outcome as string,
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Recent high-value calls (sale, meeting_booked, interested, follow_up).
   */
  async getRecentHighValueCalls(ctx: DashboardContext, limit = 10) {
    const owner = buildDashboardFilter(ctx);
    const { start, end } = dateRange(ctx);

    return this.prisma.call.findMany({
      where: {
        ...owner,
        outcome: {
          in: [
            CallOutcome.sale,
            CallOutcome.meeting_booked,
            CallOutcome.interested,
            CallOutcome.follow_up,
          ],
        },
        startedAt: { gte: start, lte: end },
      },
      orderBy: { startedAt: "desc" },
      take: limit,
      include: {
        contact: { select: { id: true, firstName: true, lastName: true } },
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  /**
   * Upcoming meetings.
   */
  async getUpcomingMeetings(ctx: DashboardContext, limit = 10) {
    const meetingOwner = buildMeetingFilter(ctx);
    const now = new Date();

    return this.prisma.meeting.findMany({
      where: {
        ...meetingOwner,
        scheduledAt: { gte: now },
        status: { in: [MeetingStatus.scheduled, MeetingStatus.rescheduled] },
      },
      orderBy: { scheduledAt: "asc" },
      take: limit,
      include: {
        contact: { select: { id: true, firstName: true, lastName: true } },
        call: { select: { id: true, outcome: true } },
      },
    });
  }

  /**
   * Per-agent performance for organization dashboards.
   */
  async getAgentPerformance(ctx: DashboardContext) {
    if (!ctx.organizationId || !ctx.isOrgAdmin) return [];

    const { start, end } = dateRange(ctx);

    const rows = await this.prisma.$queryRaw<
      {
        userId: string;
        firstName: string | null;
        lastName: string | null;
        total: number;
        answered: number;
        meetings: number;
        sales: number;
        interested: number;
      }[]
    >`
      SELECT
        c."userId" AS "userId",
        u."firstName",
        u."lastName",
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE c.status IN ('answered','recording','completed')
             OR c."answeredAt" IS NOT NULL
        )::int AS answered,
        COUNT(*) FILTER (WHERE c.outcome = 'meeting_booked')::int AS meetings,
        COUNT(*) FILTER (WHERE c.outcome = 'sale')::int AS sales,
        COUNT(*) FILTER (WHERE c.outcome = 'interested')::int AS interested
      FROM "Call" c
      LEFT JOIN "User" u ON u.id = c."userId"
      WHERE c."organizationId" = ${ctx.organizationId}::uuid
        AND c."startedAt" >= ${start}
        AND c."startedAt" <= ${end}
        AND c."userId" IS NOT NULL
      GROUP BY c."userId", u."firstName", u."lastName"
      ORDER BY sales DESC, meetings DESC, total DESC
    `;

    return rows.map((r) => {
      const total = Number(r.total);
      const answered = Number(r.answered);
      const sales = Number(r.sales);
      const meetings = Number(r.meetings);
      const interested = Number(r.interested);
      return {
        userId: r.userId,
        name:
          [r.firstName, r.lastName].filter(Boolean).join(" ").trim() ||
          "Unknown",
        totalCalls: total,
        answeredCalls: answered,
        meetingsBooked: meetings,
        sales,
        interested,
        conversionRate: answered > 0 ? round((sales / answered) * 100) : 0,
        meetingRate: answered > 0 ? round((meetings / answered) * 100) : 0,
      };
    });
  }
}

function round(n: number): number {
  return parseFloat(n.toFixed(1));
}
