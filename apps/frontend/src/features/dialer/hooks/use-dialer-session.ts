'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type { DialerMode } from '@/features/campaigns/types/campaign.types';
import { useDialerSessionStore } from '../store/dialer-session.store';
import { useDialerLeadStore } from '../store/dialer-lead.store';
import { useDialerAttemptStore } from '../store/dialer-attempt.store';

const HEARTBEAT_INTERVAL_MS = 10_000;

export function useDialerSession(campaignId: string) {
  const api = useApi();
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

    // Send an immediate heartbeat on session start
    api.post(`/dialer/sessions/${sessionId}/heartbeat`).catch(() => {});

    heartbeatRef.current = setInterval(async () => {
      try {
        await api.post(`/dialer/sessions/${sessionId}/heartbeat`);
      } catch {
        // If heartbeat fails, session may be dead
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [sessionId, api]);

  // Cleanup on unmount — end session if still active
  useEffect(() => {
    return () => {
      const sid = useDialerSessionStore.getState().sessionId;
      if (sid) {
        // Fire-and-forget end session
        api.delete(`/dialer/sessions/${sid}`).catch(() => {});
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
        dialerMode: DialerMode | null;
      }>('/dialer/sessions', { campaignId });
      setSession(res.id, campaignId, res.dialerMode ?? null);
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
