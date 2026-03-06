'use client';

import { useTelnyxStore } from '../store/telnyx.store';
import { useEffect } from 'react';
import { TelnyxRTC } from '@telnyx/webrtc';

export function useHangupListener() {
  const { notification, setActiveCall, dequeue } = useTelnyxStore();

  useEffect(() => {
    if (!notification) return;
    if (notification.type !== 'callUpdate' || !notification.call) return;

    const call = TelnyxRTC.telnyxStateCall(notification.call);
    const { state } = call;

    if (['hangup', 'destroy', 'done', 'failed'].includes(state)) {
      setActiveCall(null);
      dequeue(call.id);
    }
  }, [notification]);
}
