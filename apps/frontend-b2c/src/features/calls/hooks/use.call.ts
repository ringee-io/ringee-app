'use client';

import { useCallback, useState } from 'react';
import type { Call } from '@telnyx/webrtc';
import { useCallStore } from '../store/call.store';
import { useTelnyxStore } from '../store/telnyx.store';
import { useAuth } from '@clerk/nextjs';
import { useNumbersStore } from '../store/number.selector.store';
import { useAnalytics } from '@ringee/frontend-shared/hooks/use.analytics';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';

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
    setRecordingId,
    reset
  } = useCallStore();
  const { userId, orgId } = useAuth();
  const { client } = useTelnyxStore();
  const { selectedNumber } = useNumbersStore();
  const api = useApi();

  const [isRecordingLoading, setIsRecordingLoading] = useState(false);

  const handleMute = useCallback(
    async (mute: boolean) => {
      try {
        if (!call) return;
        if (mute) {
          if (typeof call.muteAudio === 'function') await call.muteAudio();
          else if (typeof call.muteAudio === 'function') await call.muteAudio();
        } else {
          if (typeof call.unmuteAudio === 'function') await call.unmuteAudio();
          else if (typeof call.unmuteAudio === 'function')
            await call.unmuteAudio();
        }
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
      if (!isOnHold && typeof call.hold === 'function') await call.hold();
      if (isOnHold && typeof call.unhold === 'function') await call.unhold();
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
      await call?.hangup?.();
      reset();
    } catch (err) {
      console.error('❌ Hangup error:', err);
    }
  }, [call, reset]);

  const handleSendDTMF = useCallback(
    (digit: string) => {
      try {
        if (!call) return console.warn('⚠️ No active call');
        if (call.state !== 'active') return console.warn('⚠️ Call not active');

        call.dtmf?.(digit);
      } catch (err) {
        console.error('❌ DTMF error:', err);
      }
    },
    [call]
  );

  const handleCall = async (number: string) => {
    if (!client) return console.warn('⚠️ Telnyx client not ready');

    let callerId = '+17869460882';

    if (selectedNumber?.id === 'public') {
      callerId = '+17869460882';
    } else if (selectedNumber?.phoneNumber) {
      callerId = selectedNumber.phoneNumber;
    }

    await client.newCall({
      callerNumber: callerId,
      destinationNumber: number,
      audio: true,
      customHeaders: [
        { name: 'From', value: `sip:${callerId}@sip.telnyx.com` },
        {
          name: 'P-Asserted-Identity',
          value: `sip:${callerId}@sip.telnyx.com`
        },
        {
          name: 'P-Preferred-Identity',
          value: `sip:${callerId}@sip.telnyx.com`
        },
        { name: 'X-User-Id', value: userId! },
        ...(orgId ? [{ name: 'X-Organization-Id', value: orgId! }] : [])
      ],
      keepConnectionAliveOnSocketClose: true,
      debug: process.env.NODE_ENV === 'development',
      debugOutput: 'socket'
    });

    analytics.trackNewCall(`${callerId}-${number}`);
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
