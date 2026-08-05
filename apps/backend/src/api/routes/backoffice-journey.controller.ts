import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { CurrentUser } from "@ringee/platform";
import { JourneyService, JourneyBudgetService } from "@ringee/services";
import { SuperAdminOnly } from "../guards/super-admin.guard";

interface CurrentUserData {
  id: string;
}

class ReviewQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

class ApproveDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

class RejectDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

/**
 * Journey reward review — the manual path for claims the risk model held.
 *
 * Medium-risk claims never pay automatically; they land here with their reason
 * codes so a human decides. Every decision is stamped with the reviewer, which
 * is the point: an anti-fraud system without an audited override is either too
 * strict to ship or too loose to trust.
 *
 * Super-admin only, same gate as the rest of the backoffice.
 */
@Controller("backoffice/journey")
@SuperAdminOnly()
export class BackofficeJourneyController {
  constructor(
    private readonly journey: JourneyService,
    private readonly budget: JourneyBudgetService,
  ) {}

  /** Claims awaiting a decision, with their risk signals. */
  @Get("claims/pending")
  async pending(@Query() query: ReviewQueryDto) {
    return this.journey.listPendingReview(query.limit ?? 100);
  }

  /** Remaining daily/monthly program budget — the "are we still paying?" read. */
  @Get("budget")
  async budgetRemaining() {
    return this.budget.remaining();
  }

  @Post("claims/:id/approve")
  async approve(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
    @Body() body: ApproveDto,
  ) {
    const claim = await this.journey.approveClaim(id, user.id, body.note);
    return {
      id: claim.id,
      status: claim.status,
      balanceAfter: claim.balanceAfter,
    };
  }

  @Post("claims/:id/reject")
  async reject(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
    @Body() body: RejectDto,
  ) {
    const claim = await this.journey.rejectClaim(id, user.id, body.reason);
    return { id: claim.id, status: claim.status };
  }
}
