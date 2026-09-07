'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type {
  NumberReportRow,
  PoolMember,
  RotationSettings,
  UpdatePoolMemberPatch
} from '../types';
import { ROTATION_SETTINGS_CHANGED } from './use-rotation-enabled';

const DEFAULT_SETTINGS: RotationSettings = {
  enabled: false,
  strategy: 'local_presence',
  defaultDailyCap: 50
};

/** Keeps settings, pool and reports together for the active workspace. */
export function useNumberRotation() {
  const api = useApi();
  const { userId, orgId } = useAuth();
  const workspaceKey = `${userId ?? ''}:${orgId ?? ''}`;
  const [snapshot, setSnapshot] = useState<{
    key: string;
    settings: RotationSettings;
    pool: PoolMember[];
    reporting: NumberReportRow[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef(0);
  const activeWorkspace = useRef<string | null>(workspaceKey);
  const cancelPending = useCallback(() => {
    request.current++;
    activeWorkspace.current = null;
  }, []);

  const refresh = useCallback(async () => {
    if (activeWorkspace.current !== workspaceKey) return;
    const current = ++request.current;
    setError(false);
    try {
      const [settings, pool, reporting] = await Promise.all([
        api.get<RotationSettings>('/caller-id-rotation/settings'),
        api.get<PoolMember[]>('/caller-id-rotation/pool'),
        api.get<NumberReportRow[]>('/caller-id-rotation/reporting')
      ]);
      if (current === request.current)
        setSnapshot({
          key: workspaceKey,
          settings: settings ?? DEFAULT_SETTINGS,
          pool: pool ?? [],
          reporting: reporting ?? []
        });
    } catch (err) {
      if (current === request.current) setError(true);
      throw err;
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [api, workspaceKey]);

  useEffect(() => {
    activeWorkspace.current = workspaceKey;
    setLoading(true);
    void refresh().catch(() => undefined);
    return cancelPending;
  }, [refresh, cancelPending, workspaceKey]);

  const updateSettings = useCallback(
    async (patch: Partial<RotationSettings>) => {
      setSaving(true);
      try {
        const saved = await api.put<RotationSettings>(
          '/caller-id-rotation/settings',
          patch
        );
        if (activeWorkspace.current !== workspaceKey) return saved;
        window.dispatchEvent(new Event(ROTATION_SETTINGS_CHANGED));
        // Default cap changes also alter every member inheriting that cap.
        await refresh().catch(() => undefined);
        return saved;
      } finally {
        setSaving(false);
      }
    },
    [api, refresh, workspaceKey]
  );

  const updateMember = useCallback(
    async (numberId: string, patch: UpdatePoolMemberPatch) => {
      setSaving(true);
      try {
        await api.patch<PoolMember>(
          `/caller-id-rotation/pool/${numberId}`,
          patch
        );
        await refresh().catch(() => undefined);
      } finally {
        setSaving(false);
      }
    },
    [api, refresh]
  );

  const current = snapshot?.key === workspaceKey ? snapshot : null;
  return {
    settings: current?.settings ?? DEFAULT_SETTINGS,
    pool: current?.pool ?? [],
    reporting: current?.reporting ?? [],
    loading: loading || (!current && !error),
    saving,
    error,
    updateSettings,
    updateMember,
    refresh
  };
}
