import { Injectable, NotFoundException } from "@nestjs/common";
import { UserRepository } from "@ringee/database";

export type OnboardingStep =
  | "first_call"
  | "recording"
  | "check_numbers"
  | "buy_credits";

export interface OnboardingStatusDto {
  completedSteps: OnboardingStep[];
  dismissedAt: Date | null;
  isComplete: boolean;
  totalSteps: number;
  progress: number;
}

const ALL_STEPS: OnboardingStep[] = [
  "first_call",
  "recording",
  "check_numbers",
  "buy_credits",
];

@Injectable()
export class OnboardingService {
  constructor(private readonly userRepository: UserRepository) {}

  async getStatus(userId: string): Promise<OnboardingStatusDto> {
    const status = await this.userRepository.getOnboardingStatus(userId);

    if (!status) {
      throw new NotFoundException("User not found");
    }

    const completedSteps = status.completedSteps as OnboardingStep[];
    const totalSteps = ALL_STEPS.length;
    const isComplete = completedSteps.length >= totalSteps;
    const progress = Math.round((completedSteps.length / totalSteps) * 100);

    return {
      completedSteps,
      dismissedAt: status.dismissedAt,
      isComplete,
      totalSteps,
      progress,
    };
  }

  async completeStep(userId: string, step: OnboardingStep): Promise<OnboardingStatusDto> {
    if (!ALL_STEPS.includes(step)) {
      throw new NotFoundException(`Invalid step: ${step}`);
    }

    await this.userRepository.completeOnboardingStep(userId, step);
    return this.getStatus(userId);
  }

  async dismiss(userId: string): Promise<{ success: boolean }> {
    await this.userRepository.dismissOnboarding(userId);
    return { success: true };
  }

  async undismiss(userId: string): Promise<{ success: boolean }> {
    await this.userRepository.undismissOnboarding(userId);
    return { success: true };
  }
}
