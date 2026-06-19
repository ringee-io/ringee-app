'use client';

import { useEffect } from 'react';
import { createTelnyxClient, TELNYX_EVENTS } from '@ringee/dialer-core';
import { useTelnyxStore } from '../store/telnyx.store';

export function useTelnyxClient() {
  const setClient = useTelnyxStore((s) => s.setClient);
  const setStatus = useTelnyxStore((s) => s.setStatus);

  useEffect(() => {
    if (useTelnyxStore.getState().client) return;

    // The Telnyx client (and `keepConnectionAliveOnSocketClose`, so an
    // in-progress call survives transient socket drops) is created by the
    // shared engine — identical to how the extension's offscreen document
    // builds it.
    const telnyx = createTelnyxClient({
      login: process.env.NEXT_PUBLIC_TELNYX_LOGIN || '',
      password: process.env.NEXT_PUBLIC_TELNYX_PASSWORD || '',
      ringbackFile: '/sounds/outbound-call.mp3',
      debug: false
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
    telnyx.on(TELNYX_EVENTS.ready, handleReady);
    telnyx.on(TELNYX_EVENTS.error, handleError);
    telnyx.on(TELNYX_EVENTS.socketOpen, handleSocketOpen);
    telnyx.on(TELNYX_EVENTS.socketClose, handleSocketClose);
    telnyx.on(TELNYX_EVENTS.socketError, handleError);
    telnyx.on(TELNYX_EVENTS.socketMessage, handleSocketMsg);

    setStatus('connecting');
    setClient(telnyx);
    telnyx.connect();

    return () => {
      telnyx.off(TELNYX_EVENTS.ready, handleReady);
      telnyx.off(TELNYX_EVENTS.error, handleError);
      telnyx.off(TELNYX_EVENTS.socketOpen, handleSocketOpen);
      telnyx.off(TELNYX_EVENTS.socketClose, handleSocketClose);
      telnyx.off(TELNYX_EVENTS.socketError, handleError);
      telnyx.off(TELNYX_EVENTS.socketMessage, handleSocketMsg);
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
