'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type {
  AssignableNumber,
  CreateSipDevicePayload,
  CreatedSipDevice,
  InboundReroute,
  SipDevice
} from '../types';

/**
 * Loads and mutates Desk Phones (SIP Devices) for the active workspace. The
 * device list is re-fetched after every mutation so derived fields (status,
 * assigned number) stay accurate. Credentials returned by create/regenerate
 * are surfaced to the caller once — they are never re-fetchable.
 */
export function useDeskPhones() {
  const api = useApi();
  const [devices, setDevices] = useState<SipDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const list = await api.get<SipDevice[]>('/sip-devices').catch(() => []);
    setDevices(list ?? []);
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refresh()
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const listAssignableNumbers = useCallback(
    () =>
      api
        .get<AssignableNumber[]>('/sip-devices/assignable-numbers')
        .catch(() => [] as AssignableNumber[]),
    [api]
  );

  const create = useCallback(
    async (payload: CreateSipDevicePayload) => {
      setBusy(true);
      try {
        const created = await api.post<CreatedSipDevice>(
          '/sip-devices',
          payload
        );
        await refresh();
        return created;
      } finally {
        setBusy(false);
      }
    },
    [api, refresh]
  );

  const regeneratePassword = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        return await api.post<CreatedSipDevice>(
          `/sip-devices/${id}/regenerate-password`
        );
      } finally {
        setBusy(false);
      }
    },
    [api]
  );

  const checkRegistration = useCallback(
    async (id: string) => {
      const updated = await api.post<SipDevice>(
        `/sip-devices/${id}/check-registration`
      );
      await refresh();
      return updated;
    },
    [api, refresh]
  );

  const setEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      setBusy(true);
      try {
        await api.patch<SipDevice>(`/sip-devices/${id}/enabled`, { enabled });
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [api, refresh]
  );

  const changeNumber = useCallback(
    async (id: string, numberId: string | null, allowInbound?: boolean) => {
      setBusy(true);
      try {
        await api.patch<SipDevice>(`/sip-devices/${id}/number`, {
          numberId,
          allowInbound
        });
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [api, refresh]
  );

  const remove = useCallback(
    async (
      id: string,
      reroute: InboundReroute = 'ringee',
      targetDeviceId?: string | null
    ) => {
      setBusy(true);
      try {
        await api.delete(`/sip-devices/${id}`, { reroute, targetDeviceId });
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [api, refresh]
  );

  return {
    devices,
    loading,
    busy,
    refresh,
    listAssignableNumbers,
    create,
    regeneratePassword,
    checkRegistration,
    setEnabled,
    changeNumber,
    remove
  };
}
