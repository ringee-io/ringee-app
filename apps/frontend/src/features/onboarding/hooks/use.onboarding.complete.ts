import { useCallback, useRef } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type { OnboardingStep, OnboardingStatus } from '../types/onboarding.types';
import { useOnboardingDataStore } from '../store/onboarding.store';

/**
 * Hook to trigger onboarding step completion from anywhere in the app.
 * Uses a ref to prevent duplicate API calls for the same step in a session.
 */
export function useOnboardingComplete() {
  const api = useApi();
  const completedRef = useRef<Set<OnboardingStep>>(new Set());
  const { setStatus } = useOnboardingDataStore();

  const completeStep = useCallback(
    async (step: OnboardingStep) => {
      // Prevent duplicate calls for the same step in this session
      if (completedRef.current.has(step)) {
        return;
      }

      try {
        completedRef.current.add(step);
        const data = await api.patch<OnboardingStatus>(`/onboarding/complete/${step}`);
        setStatus(data);
        console.log(`✅ Onboarding step completed: ${step}`);
      } catch (err) {
        // Remove from set if API call fails so it can be retried
        completedRef.current.delete(step);
        console.error(`Failed to complete onboarding step: ${step}`, err);
      }
    },
    [api, setStatus]
  );

  return { completeStep };
}

