'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';

/**
 * Lightweight read of whether caller-ID rotation is enabled for the active
 * workspace. Returns `null` while loading. Used by dialers to switch their
 * caller-ID picker into the automatic (rotation) state.
 */
export function useRotationEnabled(): boolean | null {
  const api = useApi();
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ enabled: boolean }>('/caller-id-rotation/settings')
      .then((r) => {
        if (!cancelled) setEnabled(r?.enabled ?? false);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return enabled;
}
