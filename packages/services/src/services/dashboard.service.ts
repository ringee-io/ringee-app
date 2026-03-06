import { Injectable } from "@nestjs/common";
import { Call, DashboardRepository } from "@ringee/database";
import { DashboardContext } from "@ringee/platform";
import { subMonths } from "date-fns";

@Injectable()
export class DashboardService {
  constructor(private repo: DashboardRepository) { }

  overview(ctx: DashboardContext) {
    const end = new Date();
    const start = subMonths(end, 6);
    return this.repo.getOverview(ctx, start, end);
  }

  callsPerDay(ctx: DashboardContext) {
    return this.repo.getCallsPerDay(ctx, subMonths(new Date(), 3));
  }

  callsPerMonth(ctx: DashboardContext) {
    return this.repo.getCallsPerMonth(ctx, subMonths(new Date(), 6));
  }

  getCallsByPeriod(ctx: DashboardContext) {
    return this.repo.getCallsByPeriod(ctx, subMonths(new Date(), 6));
  }

  recentCalls(ctx: DashboardContext): Promise<Call[]> {
    return this.repo.getRecentCalls(ctx, 5);
  }
}
