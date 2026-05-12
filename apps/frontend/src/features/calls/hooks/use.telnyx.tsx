'use client';

import { useEffect } from 'react';
import { TelnyxRTC } from '@telnyx/webrtc';
import { useTelnyxStore } from '../store/telnyx.store';

export function useTelnyxClient() {
  const setClient = useTelnyxStore((s) => s.setClient);
  const setStatus = useTelnyxStore((s) => s.setStatus);

  useEffect(() => {
    if (useTelnyxStore.getState().client) return;

    const telnyx = new TelnyxRTC({
      login: process.env.NEXT_PUBLIC_TELNYX_LOGIN || '',
      password: process.env.NEXT_PUBLIC_TELNYX_PASSWORD || '',
      ringbackFile: '/sounds/outbound-call.mp3',
      // ringtoneFile: '/sounds/inbound-call.mp3',
      debug: false,
      // Required so an in-progress call survives transient socket drops
      // (network change, sleep/wake, brief packet loss). Without this the
      // session is allowed to purge calls on socket close.
      keepConnectionAliveOnSocketClose: true
    });

    const handleReady = () => setStatus('registered');
    const handleError = () => setStatus('disconnected');
    const handleSocketOpen = () => setStatus('registering');
    const handleSocketClose = () => {
      // The library auto-reconnects on close. Reflect that in the UI
      // instead of "disconnected" so we don't tear down state mid-call.
      setStatus('reconnecting');
    };
    const handleSocketMsg = (msg: any) => {
      if (['REGISTER', 'REGED'].includes(msg?.result?.params?.state))
        setStatus('registered');
    };

    // Attach listeners BEFORE calling connect() — otherwise `telnyx.ready`
    // (and any early socket events) can fire before the handlers exist
    // and the status stays stuck on "connecting".
    telnyx.on('telnyx.ready', handleReady);
    telnyx.on('telnyx.error', handleError);
    telnyx.on('telnyx.socket.open', handleSocketOpen);
    telnyx.on('telnyx.socket.close', handleSocketClose);
    telnyx.on('telnyx.socket.error', handleError);
    telnyx.on('telnyx.socket.message', handleSocketMsg);

    setStatus('connecting');
    setClient(telnyx);
    telnyx.connect();

    return () => {
      telnyx.off('telnyx.ready', handleReady);
      telnyx.off('telnyx.error', handleError);
      telnyx.off('telnyx.socket.open', handleSocketOpen);
      telnyx.off('telnyx.socket.close', handleSocketClose);
      telnyx.off('telnyx.socket.error', handleError);
      telnyx.off('telnyx.socket.message', handleSocketMsg);
      telnyx.disconnect();
      // Clear the client from the store so a remount creates a fresh one.
      // Without this, after a StrictMode/dev double-mount or layout
      // remount, the store keeps a disconnected client and the early-return
      // above prevents any new connection from being made.
      setClient(null);
      setStatus('disconnected');
    };
  }, [setClient, setStatus]);
}
