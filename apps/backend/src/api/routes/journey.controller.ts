import { Body, Controller, Get, Post } from "@nestjs/common";
import { IsIn, IsString, MaxLength } from "class-validator";
import {
  CurrentUser,
  OrgAdminOnly,
  createOwnershipContext,
} from "@ringee/platform";
import { JourneyService } from "@ringee/services";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
  activeOrgRole?: string | null;
}

class ClaimRewardDto {
  @IsString()
  @MaxLength(64)
  stageId!: string;
}

class CelebrateDto {
  @IsString()
  @MaxLength(64)
  stageId!: string;
}

class JourneyEventDto {
  // Only the two client-originated events are accepted here; everything else is
  // emitted server-side where it can be trusted.
  @IsIn(["journey_started", "journey_next_action_clicked"])
  name!: "journey_started" | "journey_next_action_clicked";
}

/**
 * Ringee Journey.
 *
 * The whole controller is `@OrgAdminOnly()`, reads included. The Journey is a
 * *workspace* object: it reports team size, campaign volume, connected
 * integrations and a credit ladder, and it is the surface from which real money
 * is redeemed. Inside an organization only admins may see or act on it;
 * freelancers are their own admin and pass the guard unchanged.
 *
 * Hiding the nav entry from members is a presentation detail — this guard is
 * the actual control, and it returns 403 to a member on every route.
 */
@Controller("journey")
@OrgAdminOnly()
export class JourneyController {
  constructor(private readonly journey: JourneyService) {}

  @Get("overview")
  async overview(@CurrentUser() user: CurrentUserData) {
    return this.journey.getOverview(createOwnershipContext(user), user.id);
  }

  /**
   * Redeems one stage reward. `stageId` is the only client input, and it is
   * used solely to look up a stage in the server-side program — amount,
   * eligibility, risk and status are all re-derived.
   */
  @Post("rewards/claim")
  async claimReward(
    @CurrentUser() user: CurrentUserData,
    @Body() body: ClaimRewardDto,
  ) {
    return this.journey.claimReward(
      createOwnershipContext(user),
      body.stageId,
      user.id,
    );
  }

  /**
   * Redeems every eligible stage in one server-driven pass, so the client never
   * loops the single-claim endpoint.
   */
  @Post("rewards/claim-all")
  async claimAll(@CurrentUser() user: CurrentUserData) {
    return this.journey.claimAll(createOwnershipContext(user), user.id);
  }

  /** Records that a stage celebration has been shown, so it never replays. */
  @Post("celebrate")
  async celebrate(
    @CurrentUser() user: CurrentUserData,
    @Body() body: CelebrateDto,
  ) {
    await this.journey.markCelebrated(
      createOwnershipContext(user),
      body.stageId,
    );
    return { ok: true };
  }

  /**
   * The two events only the client can observe. The name is validated against
   * an allowlist and no client-supplied properties are forwarded — the service
   * attaches the workspace context itself.
   */
  @Post("events")
  async recordEvent(
    @CurrentUser() user: CurrentUserData,
    @Body() body: JourneyEventDto,
  ) {
    await this.journey.recordClientEvent(
      createOwnershipContext(user),
      user.id,
      body.name,
    );
    return { ok: true };
  }
}
