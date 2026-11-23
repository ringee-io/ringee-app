'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { ApiError } from '@ringee/frontend-shared/lib/api';
import type { CarrierRoute } from '@ringee/dialer-core/engine';
import { useTranslations } from 'next-intl';
import { notifyConcurrentCall } from '@/features/security/store/concurrent-call.store';
import { useDialerSessionStore } from '../store/dialer-session.store';
import { useDialerLeadStore } from '../store/dialer-lead.store';
import { useDialerAttemptStore } from '../store/dialer-attempt.store';
import {
  isLiveCallState,
  useDialerCallStore
} from '../store/dialer-call.store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

/**
 * An event names an attempt other than the one on screen. SSE preserves order,
 * so this is a straggler about an attempt the agent has already moved past —
 * applying it would swap the screen back to a finished lead.
 */
function isAboutAnotherAttempt(attemptId: string | null | undefined): boolean {
  if (!attemptId) return false;
  const current = useDialerAttemptStore.getState().attemptId;
  return !!current && current !== attemptId;
}

/** A leg is still up in this tab for an attempt other than `attemptId`. */
function hasLiveCallForAnotherAttempt(attemptId: string | undefined): boolean {
  const live = useDialerCallStore.getState();
  return (
    !!live.callId && isLiveCallState(live.state) && live.attemptId !== attemptId
  );
}

/**
 * Connects to the SSE stream for the agent session and dispatches events
 * to Zustand stores. When a call.initiate event arrives, it calls the
 * provided onCallInitiate callback so the workspace can trigger the actual call.
 */
export function useDialerEvents(
  sessionId: string | null,
  onCallInitiate?: (data: {
    attemptId: string;
    phoneNumber: string;
    callerIdNumber: string | null;
    /** Set when the campaign dials through the workspace's own carrier. */
    carrierRoute?: CarrierRoute;
    /** The server's signed authorization for this leg (non-carrier dials). */
    dialToken?: string;
  }) => void
) {
  const api = useApi();
  const startedAt = useDialerSessionStore((s) => s.startedAt);
  const eventSourceRef = useRef<EventSource | null>(null);
  const onCallInitiateRef = useRef(onCallInitiate);
  onCallInitiateRef.current = onCallInitiate;

  const t = useTranslations('dialer.workspace');
  const tRef = useRef(t);
  tRef.current = t;
  const setSessionStatus = useDialerSessionStore((s) => s.setStatus);
  const setSessionStats = useDialerSessionStore((s) => s.setStats);
  const clearSession = useDialerSessionStore((s) => s.clear);
  const setAwaitingEvents = useDialerSessionStore((s) => s.setAwaitingEvents);
  const setWaitingReason = useDialerSessionStore((s) => s.setWaitingReason);
  const setDialBlocked = useDialerSessionStore((s) => s.setDialBlocked);
  const setLead = useDialerLeadStore((s) => s.setLead);
  const clearLead = useDialerLeadStore((s) => s.clear);
  const setAttempt = useDialerAttemptStore((s) => s.setAttempt);
  const setCallStatus = useDialerAttemptStore((s) => s.setCallStatus);
  const setCallDuration = useDialerAttemptStore((s) => s.setCallDuration);
  const setDispositionRequired = useDialerAttemptStore(
    (s) => s.setDispositionRequired
  );
  const clearAttempt = useDialerAttemptStore((s) => s.clear);

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const belongsHere = (data: { sessionStartedAt?: string }) => {
      const current = useDialerSessionStore.getState();
      return (
        current.sessionId === sessionId &&
        current.startedAt === startedAt &&
        (!data.sessionStartedAt ||
          !startedAt ||
          new Date(data.sessionStartedAt).getTime() ===
            new Date(startedAt).getTime())
      );
    };

    // Reconnect after 3 seconds
    const reconnect = () => {
      if (!cancelled) retry = setTimeout(() => void connect(), 3000);
    };

    async function connect() {
      if (cancelled) return;

      // EventSource cannot send the Authorization header, so the stream opens
      // with a short-lived ticket the API issues for this agent's own session,
      // fetched again on every reconnection.
      let ticket: string;
      try {
        ({ ticket } = await api.post<{ ticket: string }>(
          `/dialer/sessions/${sessionId}/events-ticket`,
          { startedAt }
        ));
      } catch (err) {
        if (
          err instanceof ApiError &&
          [401, 403, 404, 409].includes(err.status) &&
          !cancelled &&
          !isLiveCallState(useDialerCallStore.getState().state)
        ) {
          clearLead();
          clearAttempt();
          clearSession();
          toast.error(tRef.current('sessionEnded'));
          return;
        }
        if (!cancelled) toast.error(tRef.current('connectionFailed'));
        reconnect();
        return;
      }
      if (cancelled) return;

      const url = `${API_URL}/dialer/sessions/${sessionId}/events?ticket=${encodeURIComponent(ticket)}${startedAt ? `&startedAt=${encodeURIComponent(startedAt)}` : ''}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.addEventListener('session.connected', (e) => {
        const data = JSON.parse(e.data);
        if (!belongsHere(data)) return;
        setAwaitingEvents(false);
        if (data.snapshotStale) return;
        setSessionStatus(data.status);
        if (data.stats) setSessionStats(data.stats);
        if (
          data.status === 'offline' &&
          !isLiveCallState(useDialerCallStore.getState().state)
        ) {
          clearLead();
          clearAttempt();
          clearSession();
          return;
        }
      });

      es.addEventListener('session.waiting', (e) => {
        const data = JSON.parse(e.data);
        if (!belongsHere(data)) return;
        setWaitingReason(data.reason);
      });

      es.addEventListener('lead.assigned', (e) => {
        const data = JSON.parse(e.data);
        if (!belongsHere(data)) return;
        setWaitingReason(null);
        // The screen stays on the call that is actually up. The server does
        // not assign while one is, so this can only be a dial the engine is
        // about to refuse and report.
        if (hasLiveCallForAnotherAttempt(data.attemptId)) return;
        setDialBlocked(null);
        setLead(data);
        // Store dispositions for the disposition panel
        if (data.dispositions) {
          setDispositionRequired(false, data.dispositions);
        }
        // Store attempt ID if provided
        if (data.attemptId) {
          setAttempt(data.attemptId, 'created');
        }
      });

      es.addEventListener('call.initiate', (e) => {
        const data = JSON.parse(e.data);
        if (!belongsHere(data)) return;
        if (!data.attemptId) return;
        if (!hasLiveCallForAnotherAttempt(data.attemptId)) {
          setDialBlocked(null);
          setAttempt(data.attemptId, 'dialing');
        }
        // Trigger actual WebRTC call via callback. It refuses — and reports —
        // a dial while another leg is still up in this tab.
        onCallInitiateRef.current?.(data);
      });

      // The dial did not happen, and the server says why. The session has
      // already been moved to wherever that reason leaves it (see
      // `session.state`); the agent just has to be told.
      es.addEventListener('call.blocked', (e) => {
        const data = JSON.parse(e.data);
        if (!belongsHere(data)) return;
        if (isAboutAnotherAttempt(data.attemptId)) return;
        if (data.message) {
          setDialBlocked({ reason: data.reason, message: data.message });
        }
        if (data.reason === 'CONCURRENT_CALL') {
          notifyConcurrentCall(data.message);
        } else if (data.message) {
          toast.error(data.message);
        }
      });

      es.addEventListener('call.state', (e) => {
        const data = JSON.parse(e.data);
        if (!belongsHere(data)) return;
        if (isAboutAnotherAttempt(data.attemptId)) return;
        if (data.attemptId) {
          setAttempt(data.attemptId, data.status);
        } else {
          setCallStatus(data.status);
        }
        if (data.duration != null) {
          setCallDuration(data.duration);
        }
      });

      es.addEventListener('disposition.required', (e) => {
        const data = JSON.parse(e.data);
        if (!belongsHere(data)) return;
        if (isAboutAnotherAttempt(data.callAttemptId)) return;
        setDispositionRequired(true, data.dispositions);
      });

      es.addEventListener('session.state', (e) => {
        const data = JSON.parse(e.data);
        if (!belongsHere(data)) return;

        // The server ended the session — because the agent asked to stop after
        // this lead, their account was disabled, or the dialer was opened again
        // in another tab. Either way the browser has to let go, or it keeps
        // heartbeating a dead session and sits on a "Waiting for lead" screen
        // that will never fill.
        if (data.status === 'offline') {
          toast.success(
            data.reason === 'closed_after_lead'
              ? tRef.current('closedAfterLead')
              : tRef.current('sessionEnded')
          );
          // Never out from under a call that is still up: that would take the
          // hang-up button with it. The heartbeat lets go once the call ends.
          if (isLiveCallState(useDialerCallStore.getState().state)) return;
          clearLead();
          clearAttempt();
          clearSession();
          return;
        }

        if (isAboutAnotherAttempt(data.attemptId)) return;

        setSessionStatus(data.status);
        if (data.stats) {
          setSessionStats(data.stats);
        }
        // Back to ready: the lead on screen is done with. Paused with an
        // attempt named: that attempt's lead was handed back to the queue.
        if (
          data.status === 'ready' ||
          (data.status === 'paused' && data.attemptId)
        ) {
          clearLead();
          clearAttempt();
        }
      });

      es.onerror = () => {
        es.close();
        if (!cancelled) toast.error(tRef.current('connectionFailed'));
        reconnect();
      };
    }

    void connect();

    return () => {
      cancelled = true;
      clearTimeout(retry);
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [
    api,
    sessionId,
    startedAt,
    clearAttempt,
    clearLead,
    clearSession,
    setAttempt,
    setAwaitingEvents,
    setCallDuration,
    setCallStatus,
    setDialBlocked,
    setDispositionRequired,
    setLead,
    setSessionStats,
    setSessionStatus,
    setWaitingReason
  ]);
}
