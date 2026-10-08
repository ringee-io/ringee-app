'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';

/**
 * Resolve the Ringee callId from a Telnyx call session id. Dialers hold the
 * Telnyx session id during an active call but the transcription API is keyed by
 * the Ringee callId, so we look it up once the call exists server-side.
 */
export function useCallIdBySession(sessionId: string | null | undefined) {
  const api = useApi();
  // Kept with the session it was resolved for: a new leg is a new call, and
  // must not read as the previous one until its own lookup answers.
  const [resolved, setResolved] = useState<{
    sessionId: string;
    callId: string;
  } | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const call = await api.get<{ id: string } | null>(
          `/telephony/calls/by-session/${sessionId}`
        );
        if (!cancelled && call?.id) {
          setResolved({ sessionId, callId: call.id });
          return;
        }
      } catch {
        /* not created yet */
      }
      // The Call row is created from the call.initiated webhook, which can lag
      // the WebRTC connect by a moment — retry a few times.
      if (!cancelled && attempts < 8) {
        attempts += 1;
        timer = setTimeout(poll, 1000);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [api, sessionId]);

  return sessionId && resolved?.sessionId === sessionId
    ? resolved.callId
    : null;
}
