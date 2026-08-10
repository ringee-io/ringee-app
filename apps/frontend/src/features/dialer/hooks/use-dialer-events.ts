'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { notifyConcurrentCall } from '@/features/security/store/concurrent-call.store';
import { useDialerSessionStore } from '../store/dialer-session.store';
import { useDialerLeadStore } from '../store/dialer-lead.store';
import { useDialerAttemptStore } from '../store/dialer-attempt.store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

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

  const setSessionStatus = useDialerSessionStore((s) => s.setStatus);
  const setSessionStats = useDialerSessionStore((s) => s.setStats);
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
        // Set attempt in store
        if (data.attemptId) {
          setAttempt(data.attemptId, 'dialing');
        }
        // Trigger actual WebRTC call via callback
        onCallInitiateRef.current?.(data);
      });

      // The backend refused to dial this lead. The lead stays reserved and the
      // next poll retries it, so nothing is burned — the agent just has to be
      // told why the session went quiet.
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
        setDispositionRequired(true, data.dispositions);
      });

      es.addEventListener('session.state', (e) => {
        const data = JSON.parse(e.data);
        setSessionStatus(data.status);
        if (data.stats) {
          setSessionStats(data.stats);
        }
        // If session goes to ready, clear lead and attempt
        if (data.status === 'ready') {
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
