'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type {
  FirstListCompletion,
  FirstListOnboarding
} from '../types/onboarding.types';

/**
 * Whether the user has made their first list from the Call page, and the
 * credit finishing it adds. What is owed, and to whom, is the server's call
 * (BILL-022): an org member is always told zero.
 */
export function useFirstListOnboarding() {
  const api = useApi();
  const [state, setState] = useState<FirstListOnboarding | null>(null);
  const [completing, setCompleting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setState(await api.get<FirstListOnboarding>('/onboarding/first-list'));
    } catch {
      // Not critical: without it the onboarding simply offers no credit.
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Only called after the server confirms completion. */
  const markCompleted = useCallback(() => {
    setState({ completed: true, reward: 0 });
  }, []);

  const completePending = useCallback(async () => {
    if (!state?.pendingListId || completing) return;
    setCompleting(true);
    try {
      await api.post<FirstListCompletion>(
        `/onboarding/first-list/${state.pendingListId}`
      );
      markCompleted();
    } finally {
      setCompleting(false);
    }
  }, [api, state?.pendingListId, completing, markCompleted]);

  return {
    completed: state?.completed ?? false,
    reward: state?.reward ?? 0,
    markCompleted,
    pendingListId: state?.pendingListId ?? null,
    completing,
    completePending,
    refresh
  };
}
