'use client';

import { useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type { INotification } from '@telnyx/webrtc';
import { createTelnyxClient, TELNYX_EVENTS } from '@ringee/dialer-core';
import { useTelnyxStore } from '../store/telnyx.store';

/** Only this per-user client receives controlled inbound legs. */
export const controlledInboundLegs = new Set<string>();

/** How often a workspace with no server-dialed routes asks again. */
const ENDPOINT_RECHECK_MS = 2 * 60_000;

type BrowserEndpoint =
  | { enabled: false }
  | {
      enabled: true;
      endpointId: string;
      sipUsername: string;
      sipPassword: string;
      expiresAt: string;
    };

export function useTelnyxClient() {
  const api = useApi();
  const { orgId, userId } = useAuth();

  useEffect(() => {
    // Only an organization routes calls through server-dialed legs.
    if (!userId || !orgId) return;
    let disposed = false;
    let client: ReturnType<typeof createTelnyxClient> | undefined;
    let endpointId: string | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let renewal: ReturnType<typeof setTimeout> | undefined;
    const remove = () => {
      if (endpointId)
        void api
          .delete(`/inbound-calls/browser-endpoints/${endpointId}`)
          .catch(() => undefined);
      clearInterval(heartbeat);
      const closing = client;
      const active = useTelnyxStore.getState().activeCall;
      if (active && controlledInboundLegs.has(active.id)) {
        const unsubscribe = useTelnyxStore.subscribe((state) => {
          if (state.activeCall?.id !== active.id) {
            unsubscribe();
            closing?.disconnect();
          }
        });
      } else closing?.disconnect();
    };
    const connect = async () => {
      try {
        const credential = await api.post<BrowserEndpoint>(
          '/inbound-calls/browser-endpoints',
          {}
        );
        if (!credential.enabled) {
          // Nothing here is delivered that way yet. Asking again lets a route
          // added from another tab ring this one without a reload.
          if (!disposed)
            renewal = setTimeout(() => void connect(), ENDPOINT_RECHECK_MS);
          return;
        }
        if (disposed) {
          void api
            .delete(`/inbound-calls/browser-endpoints/${credential.endpointId}`)
            .catch(() => undefined);
          return;
        }
        endpointId = credential.endpointId;
        client = createTelnyxClient({
          login: credential.sipUsername,
          password: credential.sipPassword,
          debug: false
        });
        const ready = () =>
          void api
            .post(
              `/inbound-calls/browser-endpoints/${credential.endpointId}/ready`,
              {}
            )
            .catch(() => undefined);
        client.on(TELNYX_EVENTS.ready, () => {
          ready();
          clearInterval(heartbeat);
          heartbeat = setInterval(ready, 25_000);
        });
        client.on(TELNYX_EVENTS.socketClose, () => clearInterval(heartbeat));
        client.on('telnyx.notification', (notification: INotification) => {
          if (notification.call?.id) {
            if (controlledInboundLegs.size > 1000)
              controlledInboundLegs.clear();
            controlledInboundLegs.add(notification.call.id);
          }
          useTelnyxStore.getState().setNotification(notification);
        });
        client.connect();
        const renew = () => {
          if (disposed) return;
          // Credential renewal must never tear down a conversation in progress.
          const { activeCall, queue } = useTelnyxStore.getState();
          if (activeCall || queue.length) {
            renewal = setTimeout(renew, 30_000);
            return;
          }
          remove();
          void connect();
        };
        renewal = setTimeout(
          renew,
          Math.max(
            30_000,
            Date.parse(credential.expiresAt) - Date.now() - 300_000
          )
        );
      } catch {
        if (!disposed) renewal = setTimeout(() => void connect(), 30_000);
      }
    };
    void connect();
    return () => {
      disposed = true;
      clearTimeout(renewal);
      remove();
    };
  }, [api, orgId, userId]);
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
