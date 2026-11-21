'use client';

import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { ApiError, type ApiClient } from '@ringee/frontend-shared/lib/api';
import type { DialerMode } from '@/features/campaigns/types/campaign.types';
import { useDialerSessionStore } from '../store/dialer-session.store';
import { useDialerLeadStore } from '../store/dialer-lead.store';
import { useDialerAttemptStore } from '../store/dialer-attempt.store';
import {
  isLiveCallState,
  useDialerCallStore
} from '../store/dialer-call.store';

const HEARTBEAT_INTERVAL_MS = 10_000;
const ORPHAN_END_ATTEMPTS = 3;

function sessionUrl(sessionId: string, startedAt: string | null, action = '') {
  return `/dialer/sessions/${sessionId}${action}${startedAt ? `?startedAt=${encodeURIComponent(startedAt)}` : ''}`;
}

/**
 * Ends a session nobody is left to run. Ending is idempotent on the server, so
 * a request lost to the network or a 5xx is sent again; a 4xx would answer the
 * same every time. The stale-session sweep stays the backstop.
 */
async function endOrphanedSession(
  api: ApiClient,
  sessionId: string,
  startedAt: string | null
) {
  for (let attempt = 1; attempt <= ORPHAN_END_ATTEMPTS; attempt++) {
    try {
      await api.delete(sessionUrl(sessionId, startedAt));
      return;
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      if (attempt === ORPHAN_END_ATTEMPTS || (status >= 400 && status < 500)) {
        console.error('Failed to end an orphaned session:', err);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
}

export function useDialerSession(campaignId: string) {
  const api = useApi();
  const t = useTranslations('dialer.workspace');
  // Read inside the heartbeat, which must not restart whenever `t` does.
  const tRef = useRef(t);
  tRef.current = t;
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  const sessionId = useDialerSessionStore((s) => s.sessionId);
  const startedAt = useDialerSessionStore((s) => s.startedAt);
  const ownedSessionRef = useRef<{
    id: string;
    startedAt: string | null;
  } | null>(null);
  const startInFlightRef = useRef<Promise<{
    id: string;
    status: string;
    startedAt?: string;
    dialerMode: DialerMode | null;
    awaitingEvents?: boolean;
  }> | null>(null);
  const status = useDialerSessionStore((s) => s.status);
  const dialerMode = useDialerSessionStore((s) => s.dialerMode);
  const closeAfterLead = useDialerSessionStore((s) => s.closeAfterLead);
  const setCloseAfterLead = useDialerSessionStore((s) => s.setCloseAfterLead);
  const setSession = useDialerSessionStore((s) => s.setSession);
  const setStatus = useDialerSessionStore((s) => s.setStatus);
  const clearSession = useDialerSessionStore((s) => s.clear);
  const clearLead = useDialerLeadStore((s) => s.clear);
  const clearAttempt = useDialerAttemptStore((s) => s.clear);

  // Heartbeat — keeps session alive so the backend doesn't mark it stale
  useEffect(() => {
    if (!sessionId) return;

    // The answer matters too. The server can end a session without this tab
    // hearing about it over SSE — the stale-session sweep after the tab was
    // throttled in the background, or the dialer started again in another tab
    // while this one was reconnecting. Carrying on would heartbeat a session
    // that belongs to someone else, or wait for leads that never come.
    const beat = async () => {
      const sentStatus = useDialerSessionStore.getState().status;
      try {
        const session = await api.post<{
          status?: string;
          startedAt?: string;
          endedAt?: string | null;
        }>(`/dialer/sessions/${sessionId}/heartbeat`, { startedAt });
        const current = useDialerSessionStore.getState();
        if (current.sessionId !== sessionId || current.startedAt !== startedAt)
          return;

        const replaced =
          !!current.startedAt &&
          !!session?.startedAt &&
          new Date(session.startedAt).getTime() !==
            new Date(current.startedAt).getTime();
        const ended = session?.status === 'offline' && session.endedAt != null;
        if (!ended && !replaced) {
          // State changes whose event was lost (paused by a recovery sweep,
          // for example) still reach the screen through the existing beat.
          if (
            session?.status &&
            !current.awaitingEvents &&
            current.status === sentStatus
          ) {
            setStatus(session.status as typeof status);
          }
          return;
        }
        // Never out from under a live call; the next beat lets go after it.
        if (isLiveCallState(useDialerCallStore.getState().state)) return;

        clearLead();
        clearAttempt();
        clearSession();
        toast.success(tRef.current('sessionEnded'));
      } catch (err) {
        const current = useDialerSessionStore.getState();
        if (
          err instanceof ApiError &&
          err.status === 409 &&
          current.sessionId === sessionId &&
          current.startedAt === startedAt &&
          !isLiveCallState(useDialerCallStore.getState().state)
        ) {
          clearLead();
          clearAttempt();
          clearSession();
          toast.error(tRef.current('sessionEnded'));
        }
      }
    };

    // Send an immediate heartbeat on session start
    void beat();
    heartbeatRef.current = setInterval(
      () => void beat(),
      HEARTBEAT_INTERVAL_MS
    );

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [
    sessionId,
    startedAt,
    api,
    clearLead,
    clearAttempt,
    clearSession,
    setStatus
  ]);

  // Whether the workspace that asked for a session is still there to run it.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Cleanup on unmount — end session if still active
  useEffect(() => {
    return () => {
      const owned = ownedSessionRef.current;
      if (owned) {
        // Fire-and-forget end session — unless a call is still up. Leaving the
        // page does not end the call, and ending the session would put its lead
        // back in the queue mid-conversation; the hangup webhook and the stale
        // session sweep settle it instead.
        if (!isLiveCallState(useDialerCallStore.getState().state)) {
          void endOrphanedSession(api, owned.id, owned.startedAt);
          useDialerCallStore.getState().clear();
        }
        const current = useDialerSessionStore.getState();
        if (
          current.sessionId === owned.id &&
          current.startedAt === owned.startedAt
        ) {
          clearLead();
          clearAttempt();
          clearSession();
        }
      }
    };
  }, [api, clearLead, clearAttempt, clearSession]);

  const startSession = useCallback(() => {
    if (startInFlightRef.current) return startInFlightRef.current;
    const request = (async () => {
      try {
        const res = await api.post<{
          id: string;
          status: string;
          startedAt?: string;
          dialerMode: DialerMode | null;
          awaitingEvents?: boolean;
        }>('/dialer/sessions', { campaignId, waitForEvents: true });
        // Closed while the request was in flight: nothing is left to dial this
        // session's leads or keep it alive, so it ends now instead of waiting for
        // the stale-session sweep with a lead the poller may already be handing it.
        if (!mountedRef.current) {
          await endOrphanedSession(api, res.id, res.startedAt ?? null);
          return res;
        }
        setSession(
          res.id,
          campaignId,
          res.dialerMode ?? null,
          res.startedAt ?? null,
          res.awaitingEvents === true
        );
        ownedSessionRef.current = {
          id: res.id,
          startedAt: res.startedAt ?? null
        };
        return res;
      } catch (err) {
        console.error('Failed to start session:', err);
        throw err;
      }
    })().finally(() => {
      startInFlightRef.current = null;
    });
    startInFlightRef.current = request;
    return request;
  }, [api, campaignId, setSession]);

  const endSession = useCallback(async () => {
    if (!sessionId) return true;
    try {
      await api.delete(sessionUrl(sessionId, startedAt));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : tRef.current('endFailed')
      );
      return false;
    }
    const current = useDialerSessionStore.getState();
    if (current.sessionId !== sessionId || current.startedAt !== startedAt)
      return false;
    if (isLiveCallState(useDialerCallStore.getState().state)) return false;
    ownedSessionRef.current = null;
    clearLead();
    clearAttempt();
    clearSession();
    return true;
  }, [api, sessionId, startedAt, clearLead, clearAttempt, clearSession]);

  const pauseSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      await api.patch(sessionUrl(sessionId, startedAt, '/pause'));
      setStatus('paused');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : tRef.current('pauseFailed')
      );
    }
  }, [api, sessionId, startedAt, setStatus]);

  const resumeSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      const session = await api.patch<{ status: typeof status }>(
        sessionUrl(sessionId, startedAt, '/resume')
      );
      const current = useDialerSessionStore.getState();
      if (
        current.sessionId === sessionId &&
        current.startedAt === startedAt &&
        current.status === 'paused'
      )
        setStatus(session.status);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : tRef.current('resumeFailed')
      );
    }
  }, [api, sessionId, startedAt, setStatus]);

  return {
    sessionId,
    status,
    dialerMode,
    closeAfterLead,
    setCloseAfterLead,
    startSession,
    endSession,
    pauseSession,
    resumeSession
  };
}
