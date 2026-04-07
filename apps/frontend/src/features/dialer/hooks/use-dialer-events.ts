'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useDialerSessionStore } from '../store/dialer-session.store';
import { useDialerLeadStore } from '../store/dialer-lead.store';
import { useDialerAttemptStore } from '../store/dialer-attempt.store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export function useDialerEvents(sessionId: string | null) {
  const { getToken } = useAuth();
  const eventSourceRef = useRef<EventSource | null>(null);

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

    async function connect() {
      const token = await getToken();
      if (cancelled) return;

      const url = `${API_URL}/dialer/sessions/${sessionId}/events?token=${token}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.addEventListener('lead.assigned', (e) => {
        const data = JSON.parse(e.data);
        setLead(data);
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
