'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type {
  NumberReportRow,
  PoolMember,
  RotationSettings,
  UpdatePoolMemberPatch
} from '../types';

const DEFAULT_SETTINGS: RotationSettings = {
  enabled: false,
  strategy: 'local_presence',
  defaultDailyCap: 50
};

/**
 * Loads and mutates the caller-ID rotation config for the active workspace
 * (personal or organization — resolved server-side). Settings updates are
 * optimistic with rollback on failure; the pool/reporting are re-fetched after
 * member changes so derived fields (status, used-today) stay accurate.
 */
export function useNumberRotation() {
  const api = useApi();
  const [settings, setSettings] = useState<RotationSettings>(DEFAULT_SETTINGS);
  const [pool, setPool] = useState<PoolMember[]>([]);
  const [reporting, setReporting] = useState<NumberReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const [s, p, r] = await Promise.all([
      api.get<RotationSettings>('/caller-id-rotation/settings'),
      api.get<PoolMember[]>('/caller-id-rotation/pool').catch(() => []),
      api
        .get<NumberReportRow[]>('/caller-id-rotation/reporting')
        .catch(() => [])
    ]);
    if (s) setSettings(s);
    setPool(p ?? []);
    setReporting(r ?? []);
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

  const updateSettings = useCallback(
    async (patch: Partial<RotationSettings>) => {
      const previous = settings;
      const next = { ...settings, ...patch };
      setSettings(next); // optimistic
      setSaving(true);
      try {
        const saved = await api.put<RotationSettings>(
          '/caller-id-rotation/settings',
          patch
        );
        if (saved) setSettings(saved);
        // Enabling rotation materializes the pool — pull it in.
        if (patch.enabled) await refresh();
        return saved;
      } catch (err) {
        setSettings(previous); // rollback
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [api, settings, refresh]
  );

  const updateMember = useCallback(
    async (numberId: string, patch: UpdatePoolMemberPatch) => {
      setSaving(true);
      try {
        await api.patch<PoolMember>(
          `/caller-id-rotation/pool/${numberId}`,
          patch
        );
        await refresh();
      } finally {
        setSaving(false);
      }
    },
    [api, refresh]
  );

  return {
    settings,
    pool,
    reporting,
    loading,
    saving,
    updateSettings,
    updateMember,
    refresh
  };
}
