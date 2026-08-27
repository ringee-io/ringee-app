'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';

/**
 * Client-side counterpart of `fetchIsSuperAdmin`. Returns `false` until the
 * answer arrives, so the backoffice link never flashes for a non-admin.
 */
export function useIsSuperAdmin(enabled = true): boolean {
  const api = useApi();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    api
      .get<{ isSuperAdmin: boolean }>('/backoffice/access')
      .then((res) => {
        if (!cancelled) setIsSuperAdmin(!!res?.isSuperAdmin);
      })
      .catch(() => {
        if (!cancelled) setIsSuperAdmin(false);
      });

    return () => {
      cancelled = true;
    };
  }, [api, enabled]);

  return isSuperAdmin;
}
