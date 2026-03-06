'use client';

import { useFCM } from '@ringee/frontend-shared/hooks/use.fcm';
import { useEffect } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useIsMobile } from '@ringee/frontend-shared/hooks/use-mobile';
import AppSidebar from './app-sidebar';
import { BottomLiquidNav } from '@ringee/frontend-shared/components/bottom.liquid.nav';
import { useAnalytics } from '@ringee/frontend-shared/hooks/use.analytics';
import { CallQueuePanel } from '@/features/calls/components/call.queue.panel';
import { useTelnyxClient } from '@/features/calls/hooks/use.telnyx';
import { useIncomingCallToasts } from '@/features/calls/hooks/use.incoming.calls';
import { ShowActiveCall } from '@/features/calls/components/show.active.call';
import { useNotifications } from '@/features/calls/hooks/use.notifications';
import { useListeners } from '@/features/calls/hooks/use.listeners';

export default function AppMainSidebar({ hiddenBottomNav, useMock }: any) {
  const mobile = useIsMobile();
  useAnalytics({
    topLevel: true
  });

  if (!useMock) {
    const api = useApi();
    const { token } = useFCM();

    useEffect(() => {
      if (token) {
        api.patch('/user/fcm-token', { fcmToken: token }).catch(console.error);
      }
    }, [token]);

    useTelnyxClient();
    useIncomingCallToasts();
    useNotifications();
    useListeners();
  }

  return (
    <>
      {!useMock ? <CallQueuePanel /> : null}
      {!useMock ? <ShowActiveCall /> : null}

      {mobile ? (
        hiddenBottomNav ? null : (
          <BottomLiquidNav />
        )
      ) : (
        <AppSidebar useMock={useMock} />
      )}
    </>
  );
}
