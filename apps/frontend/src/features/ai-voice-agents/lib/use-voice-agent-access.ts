'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';

/**
 * Client-side counterpart of `fetchHasVoiceAgentAccess`. Returns `false` until
 * the answer arrives, so the sidebar entry never flashes as usable for someone
 * outside the AI Voice Agents beta.
 */
export function useHasVoiceAgentAccess(enabled = true): boolean {
  const api = useApi();
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    api
      .get<{ hasAccess: boolean }>('/ai-voice-agents-access')
      .then((res) => {
        if (!cancelled) setHasAccess(!!res?.hasAccess);
      })
      .catch(() => {
        if (!cancelled) setHasAccess(false);
      });

    return () => {
      cancelled = true;
    };
  }, [api, enabled]);

  return hasAccess;
}
