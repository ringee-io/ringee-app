import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserData,
  createDashboardContext,
  DashboardContext,
} from "@ringee/platform";
import { DashboardService, UserService } from "@ringee/services";

interface CommonFilterQuery {
  from?: string;
  to?: string;
  range?: string; // today | yesterday | 7d | 30d | this_month | last_month
  scope?: "personal" | "organization";
  memberId?: string;
  campaignId?: string;
  outcome?: string;
}

@Controller("dashboard")
export class DashboardController {
  constructor(
    private readonly service: DashboardService,
    private readonly userService: UserService,
  ) {}

  /**
   * Resolve a memberId param. Frontend now sends DB UUIDs directly via the
   * by-clerk-ids endpoint. Kept Clerk ID fallback for backward compatibility.
   */
  private async resolveMemberId(memberId?: string): Promise<string | null> {
    if (!memberId || memberId === "null" || memberId === "undefined")
      return null;

    if (memberId.startsWith("user_")) {
      const user = await this.userService.getByClerkId(memberId);
      return user?.id ?? null;
    }
    return memberId;
  }

  private async buildContext(
    user: CurrentUserData,
    q: CommonFilterQuery,
  ): Promise<DashboardContext> {
    const filterMemberId = await this.resolveMemberId(q.memberId);
    return createDashboardContext(user, {
      filterMemberId,
      scope: q.scope,
      dateRange: parseRange(q),
      campaignId: q.campaignId ?? null,
      outcome: q.outcome ?? null,
    });
  }

  @Get("kpis")
  async kpis(
    @CurrentUser() user: CurrentUserData,
    @Query() q: CommonFilterQuery,
  ) {
    return this.service.kpis(await this.buildContext(user, q));
  }

  @Get("outcome-funnel")
  async funnel(
    @CurrentUser() user: CurrentUserData,
    @Query() q: CommonFilterQuery,
  ) {
    return this.service.outcomeFunnel(await this.buildContext(user, q));
  }

  @Get("outcomes-over-time")
  async outcomesOverTime(
    @CurrentUser() user: CurrentUserData,
    @Query() q: CommonFilterQuery,
  ) {
    return this.service.outcomesOverTime(await this.buildContext(user, q));
  }

  @Get("best-time-of-day")
  async bestTimeOfDay(
    @CurrentUser() user: CurrentUserData,
    @Query() q: CommonFilterQuery,
  ) {
    return this.service.bestTimeOfDay(await this.buildContext(user, q));
  }

  @Get("calls-by-outcome")
  async callsByOutcome(
    @CurrentUser() user: CurrentUserData,
    @Query() q: CommonFilterQuery,
  ) {
    return this.service.callsByOutcome(await this.buildContext(user, q));
  }

  @Get("recent-high-value")
  async recentHighValue(
    @CurrentUser() user: CurrentUserData,
    @Query() q: CommonFilterQuery & { limit?: string },
  ) {
    const limit = q.limit ? Math.min(parseInt(q.limit, 10) || 10, 50) : 10;
    return this.service.recentHighValueCalls(
      await this.buildContext(user, q),
      limit,
    );
  }

  @Get("upcoming-meetings")
  async upcomingMeetings(
    @CurrentUser() user: CurrentUserData,
    @Query() q: CommonFilterQuery & { limit?: string },
  ) {
    const limit = q.limit ? Math.min(parseInt(q.limit, 10) || 10, 50) : 10;
    return this.service.upcomingMeetings(
      await this.buildContext(user, q),
      limit,
    );
  }

  @Get("upcoming-callbacks")
  async upcomingCallbacks(
    @CurrentUser() user: CurrentUserData,
    @Query() q: CommonFilterQuery & { limit?: string },
  ) {
    const limit = q.limit ? Math.min(parseInt(q.limit, 10) || 10, 50) : 10;
    return this.service.upcomingCallbacks(
      await this.buildContext(user, q),
      limit,
    );
  }

  @Get("agent-performance")
  async agentPerformance(
    @CurrentUser() user: CurrentUserData,
    @Query() q: CommonFilterQuery,
  ) {
    return this.service.agentPerformance(await this.buildContext(user, q));
  }
}

function parseRange(
  q: CommonFilterQuery,
): { start: Date; end: Date } | undefined {
  if (q.from && q.to) {
    const start = new Date(q.from);
    const end = new Date(q.to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException("Invalid from/to date");
    }
    return { start, end };
  }
  if (!q.range) return undefined;
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  switch (q.range) {
    case "today":
      return { start, end };
    case "yesterday": {
      start.setDate(start.getDate() - 1);
      const yEnd = new Date(start);
      yEnd.setHours(23, 59, 59, 999);
      return { start, end: yEnd };
    }
    case "7d":
      start.setDate(start.getDate() - 6);
      return { start, end };
    case "30d":
      start.setDate(start.getDate() - 29);
      return { start, end };
    case "this_month":
      start.setDate(1);
      return { start, end };
    case "last_month": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start: s, end: e };
    }
    default:
      return undefined;
  }
}
