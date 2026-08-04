import { Body, Controller, Get, Post } from "@nestjs/common";
import {
  CurrentUser,
  OrgAdminOnly,
  createOwnershipContext,
  resolveMemberFilter,
} from "@ringee/platform";
import { JourneyService } from "@ringee/services";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
  activeOrgRole?: string | null;
}

interface ClaimRewardBody {
  stageId?: string;
}

/**
 * Growth Journey — the landing surface of the dashboard.
 *
 * The overview is read-only and open to everyone in the workspace (freelancers,
 * org admins and org members alike): it is the first thing a user sees after
 * signing in. Plain org members get their own activity narrowed by
 * `resolveMemberFilter`, matching how every other analytics read in the app is
 * scoped.
 *
 * Redeeming a stage reward moves real credit into the workspace wallet, so the
 * claim route is admin-gated (freelancers pass, org members are denied) and the
 * service re-derives the stage server-side before paying.
 */
@Controller("journey")
export class JourneyController {
  constructor(private readonly journey: JourneyService) {}

  @Get("overview")
  async overview(@CurrentUser() user: CurrentUserData) {
    return this.journey.getOverview(
      createOwnershipContext(user),
      resolveMemberFilter(user),
    );
  }

  @Post("rewards/claim")
  @OrgAdminOnly()
  async claimReward(
    @CurrentUser() user: CurrentUserData,
    @Body() body: ClaimRewardBody,
  ) {
    return this.journey.claimReward(
      createOwnershipContext(user),
      body?.stageId ?? "",
      user.id,
    );
  }
}
