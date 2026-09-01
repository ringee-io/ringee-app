'use client';

import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useMemo } from 'react';
import type { CallDetail } from './types';

/**
 * The detail screen's one call to the server.
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
        api.get<CallDetail>(`/telephony/calls/${encodeURIComponent(callId)}`)
    }),
    [api]
  );
}
