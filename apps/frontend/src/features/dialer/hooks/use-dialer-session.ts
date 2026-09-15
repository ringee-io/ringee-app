'use client';

import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type { DialerMode } from '@/features/campaigns/types/campaign.types';
import { useDialerSessionStore } from '../store/dialer-session.store';
import { useDialerLeadStore } from '../store/dialer-lead.store';
import { useDialerAttemptStore } from '../store/dialer-attempt.store';
import {
  isLiveCallState,
  useDialerCallStore
} from '../store/dialer-call.store';

const HEARTBEAT_INTERVAL_MS = 10_000;

export function useDialerSession(campaignId: string) {
  const api = useApi();
  const t = useTranslations('dialer.workspace');
  // Read inside the heartbeat, which must not restart whenever `t` does.
  const tRef = useRef(t);
  tRef.current = t;
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  const sessionId = useDialerSessionStore((s) => s.sessionId);
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
      try {
        const session = await api.post<{
          status?: string;
          startedAt?: string;
        }>(`/dialer/sessions/${sessionId}/heartbeat`);
        const current = useDialerSessionStore.getState();
        if (current.sessionId !== sessionId) return;

        const replaced =
          !!current.startedAt &&
          !!session?.startedAt &&
          new Date(session.startedAt).getTime() !==
            new Date(current.startedAt).getTime();
        if (session?.status !== 'offline' && !replaced) return;
        // Never out from under a live call; the next beat lets go after it.
        if (isLiveCallState(useDialerCallStore.getState().state)) return;

        clearLead();
        clearAttempt();
        clearSession();
        toast.success(tRef.current('sessionEnded'));
      } catch {
        // If heartbeat fails, session may be dead
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
  }, [sessionId, api, clearLead, clearAttempt, clearSession]);

  // Cleanup on unmount — end session if still active
  useEffect(() => {
    return () => {
      const sid = useDialerSessionStore.getState().sessionId;
      if (sid) {
        // Fire-and-forget end session — unless a call is still up. Leaving the
        // page does not end the call, and ending the session would put its lead
        // back in the queue mid-conversation; the hangup webhook and the stale
        // session sweep settle it instead.
        if (!isLiveCallState(useDialerCallStore.getState().state)) {
          api.delete(`/dialer/sessions/${sid}`).catch(() => {});
          useDialerCallStore.getState().clear();
        }
        clearLead();
        clearAttempt();
        clearSession();
      }
    };
  }, []);

  const startSession = useCallback(async () => {
    try {
      const res = await api.post<{
        id: string;
        status: string;
        startedAt?: string;
        dialerMode: DialerMode | null;
      }>('/dialer/sessions', { campaignId });
      setSession(
        res.id,
        campaignId,
        res.dialerMode ?? null,
        res.startedAt ?? null
      );
      return res;
    } catch (err) {
      console.error('Failed to start session:', err);
      throw err;
    }
  }, [api, campaignId, setSession]);

  const endSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      await api.delete(`/dialer/sessions/${sessionId}`);
    } catch {
      // continue cleanup even on error
    }
    clearLead();
    clearAttempt();
    clearSession();
  }, [api, sessionId, clearLead, clearAttempt, clearSession]);

  const pauseSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      await api.patch(`/dialer/sessions/${sessionId}/pause`);
      setStatus('paused');
    } catch {
      // handled
    }
  }, [api, sessionId, setStatus]);

  const resumeSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      await api.patch(`/dialer/sessions/${sessionId}/resume`);
      setStatus('ready');
    } catch {
      // handled
    }
  }, [api, sessionId, setStatus]);

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
