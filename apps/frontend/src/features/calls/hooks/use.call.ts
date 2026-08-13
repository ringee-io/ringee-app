'use client';

import { useCallback, useState } from 'react';
import {
  type Call,
  placeCall,
  muteCall,
  holdCall,
  hangupCall,
  sendDtmf
} from '@ringee/dialer-core';
import { useCallStore } from '../store/call.store';
import { useTelnyxStore } from '../store/telnyx.store';
import { useAuth } from '@clerk/nextjs';
import { useNumbersStore } from '../store/number.selector.store';
import { useAnalytics } from '@ringee/frontend-shared/hooks/use.analytics';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { ApiError } from '@ringee/frontend-shared/lib/api';
import { useOnboardingComplete } from '@/features/onboarding/hooks/use.onboarding.complete';
import { notifyConcurrentCall } from '@/features/security/store/concurrent-call.store';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

export function useCall(call?: Call | null) {
  const t = useTranslations('calls.dialer');
  const analytics = useAnalytics();
  const {
    isMuted,
    isOnHold,
    isRecording,
    setIsMuted,
    setIsOnHold,
    setIsRecording,
    recordingId,
    setRecordingId
  } = useCallStore();
  const { userId, orgId } = useAuth();
  const { client } = useTelnyxStore();
  const { selectedNumber } = useNumbersStore();
  const api = useApi();
  const { completeStep: completeOnboardingStep } = useOnboardingComplete();

  const [isRecordingLoading, setIsRecordingLoading] = useState(false);

  const handleMute = useCallback(
    async (mute: boolean) => {
      try {
        if (!call) return;
        await muteCall(call, mute);
        setIsMuted(mute);
      } catch (err) {
        console.error('❌ Mute error:', err);
      }
    },
    [call, setIsMuted]
  );

  const handleHold = useCallback(async () => {
    try {
      if (!call) return;
      await holdCall(call, !isOnHold);
      setIsOnHold(!isOnHold);
    } catch (err) {
      console.error('❌ Hold error:', err);
    }
  }, [call, isOnHold, setIsOnHold]);

  const handleRecord = useCallback(
    async (record: boolean) => {
      try {
        if (record) {
          setIsRecordingLoading(true);
        }
        if (!call) return;

        if (!call?.telnyxIDs.telnyxSessionId) return;

        if (record) {
          const res = await api.post<{ id: string }>(
            '/telephony/recordings/start',
            {
              callSessionId: call?.telnyxIDs.telnyxSessionId
            }
          );
          if (res?.id) {
            setRecordingId(res.id);
            setIsRecording(true);
            // Complete recording step when starting a recording
            completeOnboardingStep('recording');
          }
        } else {
          if (!recordingId) {
            console.warn('⚠️ No recording ID found to stop');
            return;
          }

          await api.post('/telephony/recordings/stop', {
            recordingId,
            callSessionId: call?.telnyxIDs.telnyxSessionId
          });
          setRecordingId(null);
          setIsRecording(false);
        }
      } catch (err) {
        console.error('❌ Record error:', err);
      } finally {
        setIsRecordingLoading(false);
      }
    },
    [call, recordingId]
  );

  const handleHangup = useCallback(async () => {
    try {
      await hangupCall(call ?? null);
      // Don't reset() here — the hangup notification will trigger
      // enterPostCallPhase which needs callId/contactId from the store.
      // The full reset happens in handlePostCallClose after the user
      // finishes the post-call flow.
    } catch (err) {
      console.error('❌ Hangup error:', err);
    }
  }, [call]);

  const handleSendDTMF = useCallback(
    (digit: string) => {
      try {
        sendDtmf(call ?? null, digit);
      } catch (err) {
        console.error('❌ DTMF error:', err);
      }
    },
    [call]
  );

  const handleCall = async (number: string) => {
    if (!client) return console.warn('⚠️ Telnyx client not ready');

    // This request is the dial pre-flight: it resolves the caller ID AND
    // enforces the one-call-at-a-time rule. The user's selected number is sent
    // as the fallback so behavior is unchanged when number rotation is off;
    // when it's on, the backend rotates to the best country-matched number.
    let callerId = selectedNumber?.phoneNumber ?? null;
    try {
      const res = await api.post<{
        phoneNumber: string | null;
        reason: string;
      }>('/caller-id-rotation/resolve', {
        destination: number,
        fallbackPhoneNumber: selectedNumber?.phoneNumber ?? null,
        fallbackNumberId:
          selectedNumber?.id && selectedNumber.id !== 'public'
            ? selectedNumber.id
            : null
      });
      if (res) callerId = res.phoneNumber;
    } catch (err) {
      // A 409 is a deliberate refusal, not a hiccup: the user is already on a
      // call somewhere else. Dialing anyway would only get the leg torn down by
      // the server, so stop here and explain the rule (plus the way around it —
      // a seat per teammate) in a dialog rather than a toast that scrolls away.
      if (err instanceof ApiError && err.status === 409) {
        notifyConcurrentCall(err.data?.message ?? err.message);
        return;
      }
      // Network/permission hiccup — fall back to the locally selected number.
    }

    if (!callerId) {
      console.warn(
        '⚠️ No caller ID available for this destination — add a number for its country.'
      );
      toast.error(t('callerIdUnavailable'));
      return;
    }

    placeCall({
      client,
      callerId,
      destination: number,
      userId: userId!,
      organizationId: orgId ?? undefined,
      debug: process.env.NODE_ENV === 'development'
    });

    analytics.trackNewCall(`${callerId}-${number}`);
    completeOnboardingStep('first_call');
  };

  return {
    isMuted,
    isOnHold,
    isRecording,
    isRecordingLoading,
    handleMute,
    handleHold,
    handleRecord,
    handleHangup,
    handleSendDTMF,
    handleCall
  };
}
