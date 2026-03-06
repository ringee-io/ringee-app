import { Controller, Get, Query } from "@nestjs/common";
import { CurrentUser, CurrentUserData, createDashboardContext } from "@ringee/platform";
import { DashboardService, UserService } from "@ringee/services";

@Controller("dashboard")
export class DashboardController {
  constructor(
    private readonly service: DashboardService,
    private readonly userService: UserService,
  ) { }

  /**
   * Resolve memberId to database userId
   * Frontend now sends DB UUIDs directly via the by-clerk-ids endpoint.
   * Kept Clerk ID fallback for backward compatibility (deprecated).
   */
  private async resolveMemberId(memberId?: string): Promise<string | null> {
    if (!memberId || memberId === 'null' || memberId === 'undefined') return null;

    // DEPRECATED: If it's a Clerk ID (starts with user_), resolve to database UUID
    // Frontend should now send DB UUIDs directly to avoid this lookup
    if (memberId.startsWith('user_')) {
      console.warn(`[DEPRECATED] Received Clerk ID ${memberId}. Frontend should send DB UUID instead.`);
      const user = await this.userService.getByClerkId(memberId);
      return user?.id ?? null;
    }

    // DB UUID - use directly (no DB lookup needed!)
    return memberId;
  }

  @Get("overview")
  async overview(
    @CurrentUser() user: CurrentUserData,
    @Query("memberId") memberId?: string,
  ) {
    const resolvedMemberId = await this.resolveMemberId(memberId);
    const ctx = createDashboardContext(user, resolvedMemberId);
    return this.service.overview(ctx);
  }

  @Get("calls-per-day")
  async callsPerDay(
    @CurrentUser() user: CurrentUserData,
    @Query("memberId") memberId?: string,
  ) {
    const resolvedMemberId = await this.resolveMemberId(memberId);
    const ctx = createDashboardContext(user, resolvedMemberId);
    return this.service.callsPerDay(ctx);
  }

  @Get("calls-per-month")
  async callsPerMonth(
    @CurrentUser() user: CurrentUserData,
    @Query("memberId") memberId?: string,
  ) {
    const resolvedMemberId = await this.resolveMemberId(memberId);
    const ctx = createDashboardContext(user, resolvedMemberId);
    return this.service.callsPerMonth(ctx);
  }

  @Get("calls-by-period")
  async callsByPeriod(
    @CurrentUser() user: CurrentUserData,
    @Query("memberId") memberId?: string,
  ) {
    const resolvedMemberId = await this.resolveMemberId(memberId);
    const ctx = createDashboardContext(user, resolvedMemberId);
    return this.service.getCallsByPeriod(ctx);
  }

  @Get("recent-calls")
  async recentCalls(
    @CurrentUser() user: CurrentUserData,
    @Query("memberId") memberId?: string,
  ) {
    const resolvedMemberId = await this.resolveMemberId(memberId);
    const ctx = createDashboardContext(user, resolvedMemberId);
    return this.service.recentCalls(ctx);
  }
}
