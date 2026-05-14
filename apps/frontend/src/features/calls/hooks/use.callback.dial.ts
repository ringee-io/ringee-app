'use client';

import { useCallback } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useDialerStore } from '../store/dialer.store';
import { useTelnyxStore } from '../store/telnyx.store';
import { useCall } from './use.call';

export interface DialableCallback {
  id: string;
  contact: { phoneNumber: string };
}

export function useCallbackDial() {
  const api = useApi();
  const { setNumber } = useDialerStore();
  const { activeCall } = useTelnyxStore();
  const { handleCall } = useCall();

  const isBusy =
    !!activeCall &&
    ['pending', 'ringing', 'answered', 'recording'].includes(
      activeCall.state || ''
    );

  const dialCallback = useCallback(
    async (callback: DialableCallback) => {
      const phone = callback.contact.phoneNumber;
      if (!phone) return;

      setNumber(phone);

      // Fire-and-forget: marca completed en paralelo, no bloquea el dial.
      // El agente sí intentó la llamada; si falla la marca, no revertimos.
      api
        .patch(`/callbacks/${callback.id}/complete`)
        .catch((err) => console.warn('Failed to mark callback completed', err));

      await handleCall(phone);
    },
    [api, setNumber, handleCall]
  );

  return { dialCallback, isBusy };
}
