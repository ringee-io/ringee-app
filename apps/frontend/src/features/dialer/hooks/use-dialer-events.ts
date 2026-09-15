'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
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
  }) => void
) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const onCallInitiateRef = useRef(onCallInitiate);
  onCallInitiateRef.current = onCallInitiate;

  const t = useTranslations('dialer.workspace');
  const setSessionStatus = useDialerSessionStore((s) => s.setStatus);
  const setSessionStats = useDialerSessionStore((s) => s.setStats);
  const clearSession = useDialerSessionStore((s) => s.clear);
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

    function connect() {
      if (cancelled) return;

      const url = `${API_URL}/dialer/sessions/${sessionId}/events`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.addEventListener('lead.assigned', (e) => {
        const data = JSON.parse(e.data);
        // The screen stays on the call that is actually up. The server does
        // not assign while one is, so this can only be a dial the engine is
        // about to refuse and report.
        if (hasLiveCallForAnotherAttempt(data.attemptId)) return;
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
        if (!data.attemptId) return;
        if (!hasLiveCallForAnotherAttempt(data.attemptId)) {
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
        if (data.reason === 'CONCURRENT_CALL') {
          notifyConcurrentCall(data.message);
        } else if (data.message) {
          toast.error(data.message);
        }
      });

      es.addEventListener('call.state', (e) => {
        const data = JSON.parse(e.data);
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
        if (isAboutAnotherAttempt(data.callAttemptId)) return;
        setDispositionRequired(true, data.dispositions);
      });

      es.addEventListener('session.state', (e) => {
        const data = JSON.parse(e.data);

        // The server ended the session — because the agent asked to stop after
        // this lead, their account was disabled, or the dialer was opened again
        // in another tab. Either way the browser has to let go, or it keeps
        // heartbeating a dead session and sits on a "Waiting for lead" screen
        // that will never fill.
        if (data.status === 'offline') {
          toast.success(
            data.reason === 'closed_after_lead'
              ? t('closedAfterLead')
              : t('sessionEnded')
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
        // Reconnect after 3 seconds
        if (!cancelled) {
          setTimeout(() => {
            if (!cancelled) connect();
          }, 3000);
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [sessionId]);
}
