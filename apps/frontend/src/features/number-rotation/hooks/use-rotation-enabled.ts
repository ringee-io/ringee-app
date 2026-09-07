'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';

export const ROTATION_SETTINGS_CHANGED = 'ringee:rotation-settings-changed';

/** Shared dialer/header signal, refreshed after saves and workspace changes. */
export function useRotationEnabled(): boolean | null {
  const api = useApi();
  const { userId, orgId } = useAuth();
  const workspaceKey = `${userId ?? ''}:${orgId ?? ''}`;
  const [snapshot, setSnapshot] = useState<{
    key: string;
    enabled: boolean | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let request = 0;
    const refresh = async () => {
      const current = ++request;
      try {
        const result = await api.get<{ enabled: boolean }>(
          '/caller-id-rotation/settings'
        );
        if (!cancelled && current === request)
          setSnapshot({ key: workspaceKey, enabled: result?.enabled ?? false });
      } catch {
        if (!cancelled && current === request)
          setSnapshot({ key: workspaceKey, enabled: null });
      }
    };
    void refresh();
    window.addEventListener(ROTATION_SETTINGS_CHANGED, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(ROTATION_SETTINGS_CHANGED, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [api, workspaceKey]);

  return snapshot?.key === workspaceKey ? snapshot.enabled : null;
}
