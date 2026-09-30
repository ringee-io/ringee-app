'use client';

import { useCallback } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useDial } from './use.dial';

export interface DialableCallback {
  id: string;
  contact: { phoneNumber: string };
}

export function useCallbackDial() {
  const api = useApi();
  const { dial, busy } = useDial();

  const dialCallback = useCallback(
    async (callback: DialableCallback): Promise<boolean> => {
      const phone = callback.contact.phoneNumber;
      if (!phone) return false;

      const placed = await dial(phone);
      // Only a callback that was actually called is done. A dial refused on
      // the DNC prompt, a busy line or a missing caller ID leaves it pending.
      // The call is already up by now: marking it done cannot delay it, and a
      // failure to mark it must not revert it.
      if (placed) {
        await api
          .patch(`/callbacks/${callback.id}/complete`)
          .catch((err) =>
            console.warn('Failed to mark callback completed', err)
          );
      }
      return placed;
    },
    [api, dial]
  );

  return { dialCallback, isBusy: busy };
}
