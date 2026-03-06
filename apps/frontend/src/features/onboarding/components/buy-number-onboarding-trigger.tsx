'use client';

import { useOnboardingPageComplete } from '@/features/onboarding/hooks/use.onboarding.page.complete';

/**
 * Invisible component that triggers check_numbers step completion
 * when the buy-number page is visited.
 */
export function BuyNumberOnboardingTrigger() {
  useOnboardingPageComplete('check_numbers');
  return null;
}
