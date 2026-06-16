import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserData,
  createOwnershipContext,
} from "@ringee/platform";
import { PendingActionService } from "@ringee/services";
import { PendingActionFilterKey, PendingActionStatus } from "@ringee/database";

const VALID_FILTERS: PendingActionFilterKey[] = [
  "all",
  "high_priority",
  "due_today",
  "overdue",
  "lead_followups",
  "script_reviews",
  "objection_responses",
  "crm_updates",
  "ai_generated",
  "rule_based",
  "campaign",
  "organization",
  "personal",
];

@Controller("pending-actions")
export class PendingActionController {
  constructor(private readonly service: PendingActionService) {}

  /**
   * The execution center list. Defaults to the caller's own actions. Org admins
   * may widen to the whole organization (`scope=all`) or narrow to a specific
   * member (`memberId`). Org members are always restricted to their own actions.
   */
  @Get()
  async list(
    @CurrentUser() user: CurrentUserData,
    @Query("filter") filter?: string,
    @Query("status") status?: string,
    @Query("memberId") memberId?: string,
    @Query("scope") scope?: string,
    @Query("page") page = "1",
    @Query("limit") limit = "50",
  ) {
    const ctx = createOwnershipContext(user);
    const filterKey =
      filter && VALID_FILTERS.includes(filter as PendingActionFilterKey)
        ? (filter as PendingActionFilterKey)
        : "all";
    return this.service.list(ctx, {
      filter: filterKey,
      status: status as PendingActionStatus | undefined,
      memberUserId: this.resolvePendingMemberScope(user, memberId, scope),
      page: Number(page) || 1,
      limit: Math.min(Number(limit) || 50, 100),
    });
  }

  /**
   * Resolve which member's actions to show. Members are pinned to themselves;
   * admins default to "mine" and may opt into a specific member or the whole org.
   */
  private resolvePendingMemberScope(
    user: CurrentUserData,
    memberId?: string,
    scope?: string,
  ): string | undefined {
    if (!user.activeOrgId) return undefined; // freelancer: ctx already personal
    const isAdmin = user.activeOrgRole === "org:admin";
    if (!isAdmin) return user.id; // member: always own
    if (memberId && memberId !== "null" && memberId !== "undefined") {
      return memberId; // admin: specific member
    }
    if (scope === "all") return undefined; // admin: whole organization
    return user.id; // admin default: mine
  }

  /** Live badge count for the sidebar (4.6 predicate). */
  @Get("badge")
  async badge(@CurrentUser() user: CurrentUserData) {
    const ctx = createOwnershipContext(user);
    return { count: await this.service.badgeCount(ctx) };
  }

  @Post(":id/complete")
  async complete(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.service.complete(ctx, id);
  }

  @Post(":id/dismiss")
  async dismiss(@Param("id") id: string, @CurrentUser() user: CurrentUserData) {
    const ctx = createOwnershipContext(user);
    return this.service.dismiss(ctx, id);
  }

  @Post(":id/snooze")
  async snooze(
    @Param("id") id: string,
    @Body() body: { snoozedUntil?: string; hours?: number },
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    let until: Date;
    if (body?.snoozedUntil) {
      until = new Date(body.snoozedUntil);
      if (Number.isNaN(until.getTime())) {
        throw new BadRequestException("Invalid snoozedUntil");
      }
    } else if (typeof body?.hours === "number" && body.hours > 0) {
      until = new Date(Date.now() + body.hours * 60 * 60 * 1000);
    } else {
      until = new Date(Date.now() + 24 * 60 * 60 * 1000); // default 1 day
    }
    return this.service.snooze(ctx, id, until);
  }
}
