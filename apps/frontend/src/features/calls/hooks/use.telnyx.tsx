'use client';

import { useEffect } from 'react';
import { TelnyxRTC } from '@telnyx/webrtc';
import { useTelnyxStore } from '../store/telnyx.store';

export function useTelnyxClient() {
  const { client, setClient, setStatus } = useTelnyxStore();

  useEffect(() => {
    if (client) return;

    const telnyx = new TelnyxRTC({
      login: process.env.NEXT_PUBLIC_TELNYX_LOGIN || '',
      password: process.env.NEXT_PUBLIC_TELNYX_PASSWORD || '',
      ringbackFile: '/sounds/outbound-call.mp3',
      // ringtoneFile: '/sounds/inbound-call.mp3',
      debug: false,
    });

    const handleReady = () => setStatus('registered');
    const handleError = () => setStatus('disconnected');
    const handleSocketOpen = () => setStatus('registering');
    const handleSocketClose = () => setStatus('disconnected');
    const handleSocketMsg = (msg: any) => {
      if (['REGISTER', 'REGED'].includes(msg?.result?.params?.state))
        setStatus('registered');
    };

    setStatus('connecting');
    telnyx.connect().then(() => {
      telnyx.on('telnyx.ready', handleReady);
      telnyx.on('telnyx.error', handleError);
      telnyx.on('telnyx.socket.open', handleSocketOpen);
      telnyx.on('telnyx.socket.close', handleSocketClose);
      telnyx.on('telnyx.socket.error', handleError);
      telnyx.on('telnyx.socket.message', handleSocketMsg);
    });

    setClient(telnyx);

    return () => {
      telnyx.disconnect();
      setStatus('disconnected');
    };
  }, []);
}
