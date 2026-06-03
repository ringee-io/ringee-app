import { Injectable } from "@nestjs/common";
import { DashboardRepository } from "@ringee/database";
import { DashboardContext } from "@ringee/platform";

export type DashboardWidgetDataType =
  | "kpis"
  | "outcome-funnel"
  | "outcomes-over-time"
  | "best-time-of-day"
  | "calls-by-outcome"
  | "recent-high-value"
  | "upcoming-meetings"
  | "upcoming-callbacks"
  | "agent-performance";

@Injectable()
export class DashboardService {
  constructor(private repo: DashboardRepository) {}

  kpis(ctx: DashboardContext) {
    return this.repo.getKpis(ctx);
  }

  outcomeFunnel(ctx: DashboardContext) {
    return this.repo.getOutcomeFunnel(ctx);
  }

  outcomesOverTime(ctx: DashboardContext) {
    return this.repo.getOutcomesOverTime(ctx);
  }

  bestTimeOfDay(ctx: DashboardContext) {
    return this.repo.getBestTimeOfDay(ctx);
  }

  callsByOutcome(ctx: DashboardContext) {
    return this.repo.getCallsByOutcome(ctx);
  }

  recentHighValueCalls(ctx: DashboardContext, limit = 10): Promise<unknown[]> {
    return this.repo.getRecentHighValueCalls(ctx, limit) as Promise<unknown[]>;
  }

  upcomingMeetings(ctx: DashboardContext, limit = 10) {
    return this.repo.getUpcomingMeetings(ctx, limit);
  }

  upcomingCallbacks(ctx: DashboardContext, limit = 10) {
    return this.repo.getUpcomingCallbacks(ctx, limit);
  }

  agentPerformance(ctx: DashboardContext) {
    return this.repo.getAgentPerformance(ctx);
  }

  /**
   * Returns all data needed by a single widget by type.
   */
  async widget(
    type: DashboardWidgetDataType,
    ctx: DashboardContext,
  ): Promise<unknown> {
    switch (type) {
      case "kpis":
        return this.kpis(ctx);
      case "outcome-funnel":
        return this.outcomeFunnel(ctx);
      case "outcomes-over-time":
        return this.outcomesOverTime(ctx);
      case "best-time-of-day":
        return this.bestTimeOfDay(ctx);
      case "calls-by-outcome":
        return this.callsByOutcome(ctx);
      case "recent-high-value":
        return this.recentHighValueCalls(ctx);
      case "upcoming-meetings":
        return this.upcomingMeetings(ctx);
      case "upcoming-callbacks":
        return this.upcomingCallbacks(ctx);
      case "agent-performance":
        return this.agentPerformance(ctx);
    }
  }
}
