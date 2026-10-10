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
  icon: 'phone' | 'mic' | 'hash' | 'credit-card' | 'gift';
  action: () => void;
  requiresAdmin?: boolean; // Only for buy_credits step
}

/** The Call page's first-list onboarding (`GET /onboarding/first-list`). */
export interface FirstListOnboarding {
  completed: boolean;
  /** USD finishing it now adds; zero when nothing is owed (BILL-022). */
  reward: number;
  /** Original first list retained when completion has not succeeded. */
  pendingListId?: string;
}

/** `POST /onboarding/first-list/:listId`. */
export interface FirstListCompletion {
  completed: true;
  /** USD this completion added to the balance; zero when none was owed. */
  rewardGranted: number;
}
