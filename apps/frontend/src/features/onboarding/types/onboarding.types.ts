export type OnboardingStep =
  | 'first_call'
  | 'recording'
  | 'check_numbers'
  | 'buy_credits';

export interface OnboardingStatus {
  completedSteps: OnboardingStep[];
  dismissedAt: Date | null;
  isComplete: boolean;
  totalSteps: number;
  progress: number;
}

export interface OnboardingStepConfig {
  id: OnboardingStep;
  title: string;
  description: string;
  icon: 'phone' | 'mic' | 'hash' | 'credit-card';
  action: () => void;
  requiresAdmin?: boolean; // Only for buy_credits step
}
