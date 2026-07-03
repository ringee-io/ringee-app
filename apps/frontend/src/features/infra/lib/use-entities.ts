'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useInfraApi } from '../api';
import type { InfraLinkableItem, InfrastructureResourceType } from '../types';

/**
 * Loads every workspace entity (on- and off-canvas) for the create/inspector
 * pickers. Refetched whenever `open` flips to true (so a freshly created
 * resource shows up next time) and whenever the active workspace changes, so a
 * picker never offers resources from the previous context.
 */
export function useEntities(open: boolean) {
  const api = useInfraApi();
  const { orgId } = useAuth();
  const [entities, setEntities] = useState<InfraLinkableItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    api
      .listEntities()
      .then((rows) => !cancelled && setEntities(rows))
      .catch(() => !cancelled && setEntities([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, api, orgId]);

  const byType = (t: InfrastructureResourceType) =>
    entities.filter((e) => e.type === t);

  return { entities, byType, loading };
}
