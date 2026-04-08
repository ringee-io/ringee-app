'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Call } from '@telnyx/webrtc';
import { useTelnyxStore } from '@/features/calls/store/telnyx.store';
import { useDialerAttemptStore } from '../store/dialer-attempt.store';
import { useDialerSessionStore } from '../store/dialer-session.store';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useAuth } from '@clerk/nextjs';

/**
 * Manages the actual Telnyx WebRTC call for the dialer.
 * Listens for call.initiate events (via the attempt store) and places the call,
 * then exposes mute/hold/record/dtmf/hangup controls.
 */
export function useDialerCall() {
  const api = useApi();
  const { userId, orgId } = useAuth();
  const { client, notification } = useTelnyxStore();
  const callRef = useRef<Call | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [isRecordingLoading, setIsRecordingLoading] = useState(false);

  // Track call notifications to update our local call reference
  useEffect(() => {
    if (!notification || notification.type !== 'callUpdate' || !notification.call) return;
    const call = notification.call as unknown as Call;
    const state = (call as any).state;
    const direction = (call as any).direction;

    // Only track outbound calls that we initiated
    if (direction !== 'outbound') return;

    if (['new', 'trying', 'requesting', 'recovering', 'active', 'answering', 'early'].includes(state)) {
      callRef.current = call;
      setActiveCall(call);
    }

    if (state === 'hangup' || state === 'destroy' || state === 'purge') {
      callRef.current = null;
      setActiveCall(null);
      setIsMuted(false);
      setIsOnHold(false);
      setIsRecording(false);
      setRecordingId(null);
    }
  }, [notification]);

  const dial = useCallback(
    (phoneNumber: string, callerIdNumber: string | null) => {
      if (!client) {
        console.warn('Telnyx client not ready');
        return;
      }

      const callerId = callerIdNumber || '+10000000000';

      client.newCall({
        callerNumber: callerId,
        destinationNumber: phoneNumber,
        audio: true,
        customHeaders: [
          { name: 'From', value: `sip:${callerId}@sip.telnyx.com` },
          { name: 'P-Asserted-Identity', value: `sip:${callerId}@sip.telnyx.com` },
          { name: 'P-Preferred-Identity', value: `sip:${callerId}@sip.telnyx.com` },
          { name: 'X-User-Id', value: userId! },
          ...(orgId ? [{ name: 'X-Organization-Id', value: orgId! }] : []),
        ],
        keepConnectionAliveOnSocketClose: true,
        debug: process.env.NODE_ENV === 'development',
        debugOutput: 'socket',
      });
    },
    [client, userId, orgId]
  );

  const toggleMute = useCallback(async () => {
    const call = callRef.current;
    if (!call) return;
    try {
      if (isMuted) {
        await call.unmuteAudio();
      } else {
        await call.muteAudio();
      }
      setIsMuted(!isMuted);
    } catch (err) {
      console.error('Mute error:', err);
    }
  }, [isMuted]);

  const toggleHold = useCallback(async () => {
    const call = callRef.current;
    if (!call) return;
    try {
      if (isOnHold) {
        await call.unhold();
      } else {
        await call.hold();
      }
      setIsOnHold(!isOnHold);
    } catch (err) {
      console.error('Hold error:', err);
    }
  }, [isOnHold]);

  const toggleRecord = useCallback(async () => {
    const call = callRef.current;
    if (!call) return;
    try {
      const sessionId = (call as any).telnyxIDs?.telnyxSessionId;
      if (!sessionId) return;

      if (!isRecording) {
        setIsRecordingLoading(true);
        const res = await api.post<{ id: string }>('/telephony/recordings/start', {
          callSessionId: sessionId,
        });
        if (res?.id) {
          setRecordingId(res.id);
          setIsRecording(true);
        }
      } else {
        if (recordingId) {
          const sessionId = (call as any).telnyxIDs?.telnyxSessionId;
          await api.post('/telephony/recordings/stop', {
            recordingId,
            callSessionId: sessionId,
          });
        }
        setRecordingId(null);
        setIsRecording(false);
      }
    } catch (err) {
      console.error('Record error:', err);
    } finally {
      setIsRecordingLoading(false);
    }
  }, [api, isRecording, recordingId]);

  const sendDTMF = useCallback((digit: string) => {
    const call = callRef.current;
    if (!call) return;
    try {
      call.dtmf(digit);
    } catch (err) {
      console.error('DTMF error:', err);
    }
  }, []);

  const hangup = useCallback(async () => {
    const call = callRef.current;
    if (!call) return;
    try {
      await call.hangup();
    } catch (err) {
      console.error('Hangup error:', err);
    }
    callRef.current = null;
    setActiveCall(null);
    setIsMuted(false);
    setIsOnHold(false);
    setIsRecording(false);
    setRecordingId(null);
  }, []);

  // Reset state when dialer attempt clears
  const attemptId = useDialerAttemptStore((s) => s.attemptId);
  useEffect(() => {
    if (!attemptId) {
      callRef.current = null;
      setActiveCall(null);
      setIsMuted(false);
      setIsOnHold(false);
      setIsRecording(false);
      setRecordingId(null);
    }
  }, [attemptId]);

  return {
    activeCall,
    isMuted,
    isOnHold,
    isRecording,
    isRecordingLoading,
    dial,
    toggleMute,
    toggleHold,
    toggleRecord,
    sendDTMF,
    hangup,
  };
}
