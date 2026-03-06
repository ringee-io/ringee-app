'use client';

import { useEffect, useRef } from 'react';
import { useOnboardingComplete } from './use.onboarding.complete';
import type { OnboardingStep } from '../types/onboarding.types';

/**
 * Hook to trigger onboarding step completion when a page/component mounts.
 * Useful for steps that complete when visiting a specific page.
 */
export function useOnboardingPageComplete(step: OnboardingStep) {
  const { completeStep } = useOnboardingComplete();
  const hasTriggered = useRef(false);

  useEffect(() => {
    if (!hasTriggered.current) {
      completeStep(step);
      hasTriggered.current = true;
    }
  }, [step, completeStep]);
}
