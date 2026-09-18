'use client';
import {
  carrierCallFailure,
  getCallDestination,
  getCarrierCallToken
} from '@ringee/dialer-core';

import { useTelnyxStore } from '../store/telnyx.store';
import { useCallStore } from '../store/call.store';
import { useDialerSessionStore } from '@/features/dialer/store/dialer-session.store';
import { useEffect, useRef } from 'react';
import { TelnyxRTC } from '@telnyx/webrtc';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

/** How long a carrier leg's `call.initiated` gets before its pre-dial is closed. */
const CARRIER_ABANDON_DELAY_MS = 15_000;

export function useHangupListener() {
  const api = useApi();
  const t = useTranslations('calls.dialer');
  const { notification, activeCall, setActiveCall, dequeue } = useTelnyxStore();
  const { enterPostCallPhase } = useCallStore();
  const callStartTimeRef = useRef<number | null>(null);
  // A leg reports `hangup` and then `destroy`: settle each leg once, including
  // effect replays after API/locale/store changes.
  const settledLegs = useRef(new Set<string>());

  // Track when call becomes active to calculate duration
  useEffect(() => {
    if (
      activeCall?.state === 'active' ||
      activeCall?.state === 'connected' ||
      activeCall?.state === 'recording'
    ) {
      if (!callStartTimeRef.current) {
        callStartTimeRef.current = Date.now();
      }
    }
    if (!activeCall) {
      callStartTimeRef.current = null;
    }
  }, [activeCall?.state, activeCall]);

  useEffect(() => {
    if (!notification) return;
    if (notification.type !== 'callUpdate' || !notification.call) return;

    // Skip when a dialer session is active — the dialer handles its own call lifecycle
    if (useDialerSessionStore.getState().sessionId) return;

    const call = TelnyxRTC.telnyxStateCall(notification.call);
    const { state } = call;

    if (['hangup', 'destroy', 'done', 'failed'].includes(state)) {
      if (settledLegs.current.has(call.id)) return;
      settledLegs.current.add(call.id);
      if (settledLegs.current.size > 100) {
        settledLegs.current.delete(settledLegs.current.values().next().value!);
      }
      // Surface the SIP teardown reason. For international destinations a call
      // that rings and then drops almost always carries a 4xx here (e.g. 403
      // when the destination region isn't allowed by the Outbound Voice
      // Profile). Without logging this the failure is invisible.
      const anyCall = call as unknown as {
        cause?: string;
        causeCode?: number | string;
        sipCode?: number | string | null;
        sipReason?: string | null;
      };
      console.warn('📞 Call ended:', {
        state,
        cause: anyCall.cause,
        causeCode: anyCall.causeCode,
        sipCode: anyCall.sipCode,
        sipReason: anyCall.sipReason,
        destination: getCallDestination(call)
      });

      const carrierToken = getCarrierCallToken(call);
      if (carrierToken) {
        // A leg the provider never acknowledged cannot bind its pre-dial, so
        // close it — but only after `call.initiated` has had time to arrive:
        // a leg rejected before ringing still reaches the server, and binding
        // it is what records the carrier's hangup cause on the call.
        if (!call.telnyxIDs?.telnyxCallControlId) {
          window.setTimeout(() => {
            void api
              .post('/caller-id-rotation/abandon', { callToken: carrierToken })
              .catch(() => undefined);
          }, CARRIER_ABANDON_DELAY_MS);
        }
        const failure = carrierCallFailure(anyCall.sipCode);
        if (failure) {
          toast.error(
            {
              rejected: t('externalCarrier.rejected'),
              destination: t('externalCarrier.destinationRejected'),
              timeout: t('externalCarrier.timeout'),
              unavailable: t('externalCarrier.failed')
            }[failure]
          );
        }
      }

      dequeue(call.id);

      // Calculate call duration
      const duration = callStartTimeRef.current
        ? Math.floor((Date.now() - callStartTimeRef.current) / 1000)
        : 0;

      // Short calls (< 5s) or failed calls: skip post-call, close immediately
      if (state === 'failed') {
        setActiveCall(null);
        return;
      }

      // Transition to post-call phase instead of closing
      // contactName and contactId are resolved by ShowActiveCall and will be
      // available via the call store's existing state set by show.active.call
      const sessionId =
        call?.telnyxIDs?.telnyxSessionId ??
        notification.call?.telnyxIDs?.telnyxSessionId ??
        activeCall?.telnyxIDs?.telnyxSessionId ??
        null;
      enterPostCallPhase({
        duration,
        contactName: null,
        contactId: null,
        callId: null,
        callSessionId: sessionId
      });
    }
  }, [
    notification,
    activeCall?.telnyxIDs?.telnyxSessionId,
    api,
    dequeue,
    enterPostCallPhase,
    setActiveCall,
    t
  ]);
}
