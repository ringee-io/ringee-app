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
import { useOnboardingComplete } from '@/features/onboarding/hooks/use.onboarding.complete';

export function useCall(call?: Call | null) {
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

    // Caller ID is never hardcoded: it comes from the user's selected number,
    // which the number store resolves from the backend (purchased numbers, or
    // the configured public/free-trial line). No literal numbers here.
    const callerId = selectedNumber?.phoneNumber;
    if (!callerId) {
      return console.warn(
        '⚠️ No caller ID available — pick a number in the dialer first'
      );
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
