import { Controller, Get } from "@nestjs/common";
import {
  CurrentUser,
  createOwnershipContext,
  resolveMemberFilter,
} from "@ringee/platform";
import { JourneyService } from "@ringee/services";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
  activeOrgRole?: string | null;
}

/**
 * Growth Journey — the landing surface of the dashboard.
 *
 * Read-only and open to everyone in the workspace (freelancers, org admins and
 * org members alike): it is the first thing a user sees after signing in. Plain
 * org members get their own activity narrowed by `resolveMemberFilter`, matching
 * how every other analytics read in the app is scoped.
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
}
