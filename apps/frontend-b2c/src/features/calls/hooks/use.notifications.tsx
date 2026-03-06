'use client';

import { useEffect } from 'react';
import { INotification } from '@telnyx/webrtc';
import { useTelnyxStore } from '../store/telnyx.store';

export function useNotifications() {
  const { client, setNotification } = useTelnyxStore();

  useEffect(() => {
    if (!client) return;

    const onNotification = (n: INotification) => {
      setNotification(n);
    };

    client.on('telnyx.notification', onNotification);
    return () => client.off('telnyx.notification', onNotification);
  }, [client]);
}
