'use client';
import { useTelnyxStore } from '../store/telnyx.store';
import { useDialerSessionStore } from '@/features/dialer/store/dialer-session.store';
import { useEffect, useRef } from 'react';
import { TelnyxRTC } from '@telnyx/webrtc';

// How long an outbound call may sit in an early/ringing state without being
// answered before we give up and tear it down. Some international routes send
// fake/early ringback and then never return a final SIP response, leaving the
// call stuck in "ringing" forever. This bounds that so the UI recovers and the
// hangup listener gets a chance to surface the cause.
const NO_ANSWER_TIMEOUT_MS = 45_000;

const EARLY_STATES = ['new', 'requesting', 'trying', 'recovering', 'ringing'];
const ANSWERED_STATES = ['active', 'answered', 'connected'];
const ENDED_STATES = ['hangup', 'destroy', 'done', 'failed', 'purge'];

export function useOutboundListener() {
  const { notification, setActiveCall } = useTelnyxStore();
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRingTimer = () => {
    if (ringTimerRef.current) {
      clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!notification) return;
    if (notification.type !== 'callUpdate' || !notification.call) return;

    // Skip when a dialer session is active — the dialer manages its own call state
    if (useDialerSessionStore.getState().sessionId) return;

    const call = TelnyxRTC.telnyxStateCall(notification.call);
    const { state, direction } = call;

    if (direction !== 'outbound') return;

    if (['new', 'active', 'answered'].includes(state)) {
      setActiveCall(call);
    }

    // Arm the no-answer timeout once, the first time we see the call in an
    // early/ringing state. Disarm as soon as it is answered or ends.
    if (EARLY_STATES.includes(state)) {
      if (!ringTimerRef.current) {
        ringTimerRef.current = setTimeout(() => {
          ringTimerRef.current = null;
          // Re-check: only hang up if it never progressed past ringing.
          const live = useTelnyxStore.getState().activeCall;
          const stillRinging =
            !live || EARLY_STATES.includes(live.state as string);
          if (stillRinging) {
            console.warn(
              '⏱️ Outbound call not answered within timeout — hanging up',
              { destination: call.options?.destinationNumber }
            );
            try {
              call.hangup?.();
            } catch (err) {
              console.error('Failed to hang up timed-out call', err);
            }
          }
        }, NO_ANSWER_TIMEOUT_MS);
      }
    } else if (
      ANSWERED_STATES.includes(state) ||
      ENDED_STATES.includes(state)
    ) {
      clearRingTimer();
    }
  }, [notification]);

  // Clean up any pending timer on unmount.
  useEffect(() => () => clearRingTimer(), []);
}
