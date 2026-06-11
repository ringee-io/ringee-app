'use client';

import { useEffect, useRef, useState } from 'react';
import { TelnyxRTC } from '@telnyx/webrtc';
import type { Call, INotification } from '@telnyx/webrtc';
import type { TelephonyCredential } from './api';

export type TelnyxClientStatus =
  | 'idle'
  | 'connecting'
  | 'registered'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export interface SessionTelnyx {
  client: TelnyxRTC | null;
  status: TelnyxClientStatus;
  notification: INotification | null;
}

/**
 * Stand-alone Telnyx WebRTC client for the public dialer session. Connects
 * with an ephemeral SIP credential the backend mints during validate. We
 * deliberately don't share the dashboard's Telnyx store — this client is
 * scoped to the public page's lifetime.
 */
export function useSessionTelnyx(
  credential: TelephonyCredential | null
): SessionTelnyx {
  const [client, setClient] = useState<TelnyxRTC | null>(null);
  const [status, setStatus] = useState<TelnyxClientStatus>('idle');
  const [notification, setNotification] = useState<INotification | null>(null);
  const clientRef = useRef<TelnyxRTC | null>(null);

  useEffect(() => {
    if (!credential) return;

    const telnyx = new TelnyxRTC({
      login: credential.sipUsername,
      password: credential.sipPassword,
      ringbackFile: '/sounds/outbound-call.mp3',
      debug: false,
      keepConnectionAliveOnSocketClose: true
    });

    const onReady = () => setStatus('registered');
    const onError = () => setStatus('error');
    const onSocketOpen = () => setStatus('connecting');
    const onSocketClose = () => setStatus('reconnecting');
    const onSocketMsg = (msg: unknown) => {
      const state = (msg as { result?: { params?: { state?: string } } })
        ?.result?.params?.state;
      if (state === 'REGISTER' || state === 'REGED') {
        setStatus('registered');
      }
    };
    const onNotification = (n: INotification) => setNotification(n);

    telnyx.on('telnyx.ready', onReady);
    telnyx.on('telnyx.error', onError);
    telnyx.on('telnyx.socket.open', onSocketOpen);
    telnyx.on('telnyx.socket.close', onSocketClose);
    telnyx.on('telnyx.socket.error', onError);
    telnyx.on('telnyx.socket.message', onSocketMsg);
    telnyx.on('telnyx.notification', onNotification);

    setStatus('connecting');
    setClient(telnyx);
    clientRef.current = telnyx;
    telnyx.connect();

    return () => {
      telnyx.off('telnyx.ready', onReady);
      telnyx.off('telnyx.error', onError);
      telnyx.off('telnyx.socket.open', onSocketOpen);
      telnyx.off('telnyx.socket.close', onSocketClose);
      telnyx.off('telnyx.socket.error', onError);
      telnyx.off('telnyx.socket.message', onSocketMsg);
      telnyx.off('telnyx.notification', onNotification);
      try {
        telnyx.disconnect();
      } catch {
        // ignore
      }
      clientRef.current = null;
      setClient(null);
      setStatus('disconnected');
      setNotification(null);
    };
  }, [credential?.sipUsername, credential?.sipPassword]);

  return { client, status, notification };
}

export type { Call };
