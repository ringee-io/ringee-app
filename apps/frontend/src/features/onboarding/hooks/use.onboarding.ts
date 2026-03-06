'use client';

import { useCallback, useEffect } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type { OnboardingStatus, OnboardingStep } from '../types/onboarding.types';
import { useOnboardingDataStore } from '../store/onboarding.store';

export function useOnboarding() {
  const api = useApi();
  const { 
    status, 
    isLoading, 
    error, 
    setStatus, 
    setIsLoading, 
    setError 
  } = useOnboardingDataStore();

  const fetchStatus = useCallback(async () => {
    // If we already have status and aren't loading, we might want to skip or background refresh.
    // For now, allow simple refetch logic but consider store state.
    try {
      if (!status) setIsLoading(true); // Only show loading if no data
      setError(null);
      const data = await api.get<OnboardingStatus>('/onboarding/status');
      setStatus(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load onboarding status');
      console.error('Error fetching onboarding status:', err);
    } finally {
      setIsLoading(false);
    }
  }, [api, setStatus, setIsLoading, setError, status]);

  const completeStep = useCallback(
    async (step: OnboardingStep) => {
      try {
        const data = await api.patch<OnboardingStatus>(`/onboarding/complete/${step}`);
        setStatus(data);
        return data;
      } catch (err: any) {
        console.error('Error completing onboarding step:', err);
        throw err;
      }
    },
    [api, setStatus]
  );

  const dismiss = useCallback(async () => {
    try {
      await api.patch('/onboarding/dismiss');
      setStatus(status ? { ...status, dismissedAt: new Date() } : null);
    } catch (err: any) {
      console.error('Error dismissing onboarding:', err);
      throw err;
    }
  }, [api, setStatus, status]);

  const undismiss = useCallback(async () => {
    try {
      await api.patch('/onboarding/undismiss');
      setStatus(status ? { ...status, dismissedAt: null } : null);
    } catch (err: any) {
      console.error('Error undismissing onboarding:', err);
      throw err;
    }
  }, [api, setStatus, status]);


  const isStepComplete = useCallback(
    (step: OnboardingStep) => {
      return status?.completedSteps.includes(step) || false;
    },
    [status]
  );

  useEffect(() => {
    fetchStatus();
  }, []);

  // Computed values
  const isDismissed = Boolean(status?.dismissedAt);
  const isComplete = Boolean(status?.isComplete);
  const shouldShow = !isLoading && status && !isDismissed && !isComplete;
  // Show header button when dismissed but still has incomplete steps
  const showHeaderButton = !isLoading && status && isDismissed && !isComplete;

  return {
    status,
    isLoading,
    error,
    completeStep,
    dismiss,
    undismiss,
    isStepComplete,
    refetch: fetchStatus,
    // Convenience computed values
    shouldShow,
    showHeaderButton,
    isDismissed,
    isComplete,
    progress: status?.progress || 0,
    completedCount: status?.completedSteps.length || 0,
    totalSteps: status?.totalSteps || 4,
  };
}

