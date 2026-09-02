'use client';

import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useMemo } from 'react';
import type { CallDetail } from './types';

export interface CallDetailNavigation {
  previousId: string | null;
  nextId: string | null;
  position: number;
  total: number;
}

export interface CallDetailNavigationFilters {
  dateFrom?: string | null;
  dateTo?: string | null;
  memberId?: string | null;
}

/**
 * The detail screen's calls to the server.
 *
 * Deliberately thin: the transcript is owned by `@/features/transcription` and
 * the recording player by `@/features/recordings`, so this fetches the call and
 * nothing those already know how to fetch for themselves.
 */
export function useCallDetailApi() {
  const api = useApi();

  return useMemo(
    () => ({
      get: (callId: string) =>
        api.get<CallDetail>(`/telephony/calls/${encodeURIComponent(callId)}`),
      getNavigation: (
        callId: string,
        filters: CallDetailNavigationFilters
      ) => {
        const params = new URLSearchParams();
        if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
        if (filters.dateTo) params.set('dateTo', filters.dateTo);
        if (filters.memberId) params.set('userId', filters.memberId);
        const query = params.toString();

        return api.get<CallDetailNavigation>(
          `/telephony/calls/${encodeURIComponent(callId)}/navigation${
            query ? `?${query}` : ''
          }`
        );
      }
    }),
    [api]
  );
}
