'use client';

import { useEffect, memo } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useFCM } from '@ringee/frontend-shared/hooks/use.fcm';
import { useTelnyxClient } from '@/features/calls/hooks/use.telnyx';
import { useIncomingCallToasts } from '@/features/calls/hooks/use.incoming.calls';
import { useNotifications } from '@/features/calls/hooks/use.notifications';
import { useListeners } from '@/features/calls/hooks/use.listeners';
import { CallQueuePanel } from '@/features/calls/components/call.queue.panel';
import { ShowActiveCall } from '@/features/calls/components/show.active.call';

/**
 * AuthenticatedHooksExecutor
 * 
 * Este componente ejecuta los hooks de autenticación.
 * Solo se monta cuando el usuario está autenticado.
 * Memoizado para evitar re-renders innecesarios.
 */
const AuthenticatedHooksExecutor = memo(function AuthenticatedHooksExecutor() {
  const api = useApi();
  const { token } = useFCM();

  // Ejecutar hooks de Telnyx y notificaciones
  useTelnyxClient();
  useIncomingCallToasts();
  useNotifications();
  useListeners();

  // Sincronizar FCM token
  useEffect(() => {
    if (token) {
      api.patch('/user/fcm-token', { fcmToken: token }).catch(console.error);
    }
  }, [token, api]);

  return (
    <>
      <CallQueuePanel />
      <ShowActiveCall />
    </>
  );
});

/**
 * AuthenticatedProvider
 * 
 * Este provider renderiza condicionalmente los hooks autenticados.
 * Los hooks solo se ejecutan cuando el usuario está autenticado.
 */
export function AuthenticatedProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const { isSignedIn } = useAuth();

  return (
    <>
      {/* Solo montar el ejecutor de hooks cuando el usuario está autenticado */}
      {isSignedIn && <AuthenticatedHooksExecutor />}
      {children}
    </>
  );
}
