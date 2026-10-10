import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  ParseUUIDPipe,
  NotFoundException,
} from "@nestjs/common";
import {
  ContactListActor,
  OnboardingService,
  OnboardingStep,
} from "@ringee/services";
import {
  CurrentUser,
  CurrentUserData,
  createOwnershipContext,
} from "@ringee/platform";

@Controller("onboarding")
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get("status")
  async getStatus(@CurrentUser() user: CurrentUserData) {
    if (!user?.id) {
      throw new NotFoundException("User not found");
    }
    return this.onboardingService.getStatus(user.id);
  }

  /** The Call page's first-list onboarding, in the active workspace. */
  @Get("first-list")
  async getFirstList(@CurrentUser() user: CurrentUserData) {
    return this.onboardingService.getFirstList(actorOf(user));
  }

  /** Finishes it with the list the user just made (BILL-022). */
  @Post("first-list/:listId")
  async completeFirstList(
    @CurrentUser() user: CurrentUserData,
    @Param("listId", ParseUUIDPipe) listId: string,
  ) {
    return this.onboardingService.completeFirstList(actorOf(user), listId);
  }

  @Patch("complete/:step")
  async completeStep(
    @CurrentUser() user: CurrentUserData,
    @Param("step") step: string,
  ) {
    if (!user?.id) {
      throw new NotFoundException("User not found");
    }
    return this.onboardingService.completeStep(user.id, step as OnboardingStep);
  }

  @Patch("dismiss")
  async dismiss(@CurrentUser() user: CurrentUserData) {
    if (!user?.id) {
      throw new NotFoundException("User not found");
    }
    return this.onboardingService.dismiss(user.id);
  }

  @Patch("undismiss")
  async undismiss(@CurrentUser() user: CurrentUserData) {
    if (!user?.id) {
      throw new NotFoundException("User not found");
    }
    return this.onboardingService.undismiss(user.id);
  }
}

function actorOf(user: CurrentUserData): ContactListActor {
  return {
    ...createOwnershipContext(user),
    isOrgAdmin: user.activeOrgRole === "org:admin",
  };
}
