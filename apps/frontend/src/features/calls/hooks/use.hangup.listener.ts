'use client';

import { useTelnyxStore } from '../store/telnyx.store';
import { useCallStore } from '../store/call.store';
import { useDialerSessionStore } from '@/features/dialer/store/dialer-session.store';
import { useEffect, useRef } from 'react';
import { TelnyxRTC } from '@telnyx/webrtc';

export function useHangupListener() {
  const { notification, activeCall, setActiveCall, dequeue } = useTelnyxStore();
  const { postCallPhase, enterPostCallPhase } = useCallStore();
  const callStartTimeRef = useRef<number | null>(null);

  // Track when call becomes active to calculate duration
  useEffect(() => {
    if (
      activeCall?.state === 'active' ||
      activeCall?.state === 'connected' ||
      activeCall?.state === 'recording'
    ) {
      if (!callStartTimeRef.current) {
        callStartTimeRef.current = Date.now();
      }
    }
    if (!activeCall) {
      callStartTimeRef.current = null;
    }
  }, [activeCall?.state, activeCall]);

  useEffect(() => {
    if (!notification) return;
    if (notification.type !== 'callUpdate' || !notification.call) return;

    // Skip when a dialer session is active — the dialer handles its own call lifecycle
    if (useDialerSessionStore.getState().sessionId) return;

    const call = TelnyxRTC.telnyxStateCall(notification.call);
    const { state } = call;

    if (['hangup', 'destroy', 'done', 'failed'].includes(state)) {
      // Surface the SIP teardown reason. For international destinations a call
      // that rings and then drops almost always carries a 4xx here (e.g. 403
      // when the destination region isn't allowed by the Outbound Voice
      // Profile). Without logging this the failure is invisible.
      const anyCall = call as unknown as {
        cause?: string;
        causeCode?: number | string;
        sipCode?: number | string | null;
        sipReason?: string | null;
      };
      console.warn('📞 Call ended:', {
        state,
        cause: anyCall.cause,
        causeCode: anyCall.causeCode,
        sipCode: anyCall.sipCode,
        sipReason: anyCall.sipReason,
        destination: call.options?.destinationNumber
      });

      dequeue(call.id);

      // Calculate call duration
      const duration = callStartTimeRef.current
        ? Math.floor((Date.now() - callStartTimeRef.current) / 1000)
        : 0;

      // Short calls (< 5s) or failed calls: skip post-call, close immediately
      if (state === 'failed') {
        setActiveCall(null);
        return;
      }

      // Transition to post-call phase instead of closing
      // contactName and contactId are resolved by ShowActiveCall and will be
      // available via the call store's existing state set by show.active.call
      const sessionId =
        call?.telnyxIDs?.telnyxSessionId ??
        notification.call?.telnyxIDs?.telnyxSessionId ??
        activeCall?.telnyxIDs?.telnyxSessionId ??
        null;
      enterPostCallPhase({
        duration,
        contactName: null,
        contactId: null,
        callId: null,
        callSessionId: sessionId
      });
    }
  }, [notification]);
}
