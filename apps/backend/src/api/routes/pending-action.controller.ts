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

  /** The execution center list, workspace-scoped + filtered. */
  @Get()
  async list(
    @CurrentUser() user: CurrentUserData,
    @Query("filter") filter?: string,
    @Query("status") status?: string,
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
      page: Number(page) || 1,
      limit: Math.min(Number(limit) || 50, 100),
    });
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
