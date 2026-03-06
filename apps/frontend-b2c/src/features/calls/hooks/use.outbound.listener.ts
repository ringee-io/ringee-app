'use client';
import { useTelnyxStore } from '../store/telnyx.store';
import { useEffect } from 'react';
import { TelnyxRTC } from '@telnyx/webrtc';

export function useOutboundListener() {
  const { notification, setActiveCall } = useTelnyxStore();

  useEffect(() => {
    if (!notification) return;
    if (notification.type !== 'callUpdate' || !notification.call) return;

    const call = TelnyxRTC.telnyxStateCall(notification.call);
    const { state, direction } = call;

    if (
      ['new', 'active', 'answered'].includes(state) &&
      direction === 'outbound'
    ) {
      setActiveCall(call);
    }
  }, [notification]);
}
