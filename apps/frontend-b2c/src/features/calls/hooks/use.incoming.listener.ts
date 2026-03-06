'use client';

import { useTelnyxStore } from '../store/telnyx.store';
import { useEffect } from 'react';
import { TelnyxRTC } from '@telnyx/webrtc';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';


export function useIncomingListener() {
  const api = useApi();
  const { notification, enqueue } = useTelnyxStore();

  useEffect(() => {
    if (!notification) return;
    if (notification.type !== 'callUpdate' || !notification.call) return;

    const call = TelnyxRTC.telnyxStateCall(notification.call);
    const { state, direction, options } = call;

    const isIncoming =
      ['ringing', 'trying', 'requesting'].includes(state) &&
      (direction === 'inbound' ||
        (options?.remoteCallerNumber &&
          options?.destinationNumber &&
          options.remoteCallerNumber !== options.destinationNumber));

    if (isIncoming) {
      api.get('/telephony/phone-numbers').then((numbers) => {
        if (numbers.length === 0) return;

        const belongsToUser = numbers.find(
          (n: { phoneNumber: string }) =>
            n.phoneNumber.replace('+', '') === options.destinationNumber
        );

        belongsToUser && enqueue(call);
      });
    }
  }, [notification]);
}
