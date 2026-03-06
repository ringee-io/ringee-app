import { Controller, Get, Patch, Param, NotFoundException } from "@nestjs/common";
import { OnboardingService, OnboardingStep } from "@ringee/services";
import { CurrentUser } from "@ringee/platform";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
}

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
