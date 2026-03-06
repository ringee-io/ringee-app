'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Call } from '@telnyx/webrtc';
import { useCreditStore } from '@/features/credit/store/credit.store';
import { toast } from 'sonner';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';

const FREE_TRIAL_DURATION = 60; // seconds

/**
 * Manages a 60-second countdown for free-trial calls.
 * The timer only starts when the call state becomes 'active' (connected).
 * When it reaches 0 the call is automatically hung up and the free trial is consumed.
 */
export function useFreeTrialTimer(
  activeCall: Call | null,
  onHangup: () => void
) {
  const { freeCallTrial, setFreeCallTrial } = useCreditStore();
  const api = useApi();
  const [remainingSeconds, setRemainingSeconds] = useState(FREE_TRIAL_DURATION);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasHungUpRef = useRef(false);
  const timerStartedRef = useRef(false);
  const onHangupRef = useRef(onHangup);
  onHangupRef.current = onHangup;

  const isFreeTrialCall = freeCallTrial && !!activeCall;

  // Clean up helper
  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Consume the free trial on the backend and update local state
  const consumeFreeTrial = useCallback(async () => {
    try {
      await api.patch('/credits/consume-free-call-trial');
    } catch (err) {
      console.error('❌ Error consuming free trial:', err);
    }
    setFreeCallTrial(false);
  }, [api, setFreeCallTrial]);

  // Start timer when the call is connected (state === 'active')
  useEffect(() => {
    if (!isFreeTrialCall) return;
    if (timerStartedRef.current) return;

    const callState = activeCall?.state;
    if (callState === 'active' || callState === 'connected' || callState === 'recording') {
      timerStartedRef.current = true;
      hasHungUpRef.current = false;
      setRemainingSeconds(FREE_TRIAL_DURATION);

      intervalRef.current = setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            clearTimer();
            if (!hasHungUpRef.current) {
              hasHungUpRef.current = true;
              toast.info('⏱ Free trial call ended — 1 minute limit reached', {
                duration: 6000,
              });
              onHangupRef.current();
              consumeFreeTrial();
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  }, [isFreeTrialCall, activeCall?.state, clearTimer, consumeFreeTrial]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  // Reset everything when the call ends or disappears
  useEffect(() => {
    if (!activeCall) {
      clearTimer();
      timerStartedRef.current = false;
      setRemainingSeconds(FREE_TRIAL_DURATION);
      hasHungUpRef.current = false;
    }
  }, [activeCall, clearTimer]);

  return {
    isFreeTrialCall,
    remainingSeconds,
    totalSeconds: FREE_TRIAL_DURATION,
    timerStarted: timerStartedRef.current,
  };
}

