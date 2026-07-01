import { Body, Controller, Get, Post } from "@nestjs/common";
import { FreeTrialService } from "@ringee/services";
import { CurrentUser, CreateFreeTrialRequestDto } from "@ringee/platform";

interface CurrentUserData {
  id: string;
}

/**
 * Free trial call requests. A newly signed-up user asks the Ringee team for a
 * free call to try the service; the team reviews it manually. Exactly one
 * request per user (the modal + onboarding step drive this on the client).
 */
@Controller("free-trial")
export class FreeTrialController {
  constructor(private readonly freeTrialService: FreeTrialService) {}

  /** Whether the current user has already requested their free call. */
  @Get("request")
  async getRequest(@CurrentUser() user: CurrentUserData) {
    return this.freeTrialService.getRequest(user.id);
  }

  /** Create the one-time request and email the team. Idempotent. */
  @Post("request")
  async createRequest(
    @CurrentUser() user: CurrentUserData,
    @Body() body: CreateFreeTrialRequestDto,
  ) {
    return this.freeTrialService.createRequest(user.id, body.note);
  }
}
