'use client';

import { useCallback, useEffect } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useContactBriefStore } from '../store/contact-brief.store';
import type { MyDayContactBrief } from '../types/my-day';

/**
 * Who a contact is before the call, for the Call page. `enabled: false`
 * waits (a row's menu loads it only when it opens); `load` asks for it then.
 */
export function useContactBrief(
  contactId: string | null,
  { enabled = true }: { enabled?: boolean } = {}
): {
  brief: MyDayContactBrief | null;
  loading: boolean;
  failed: boolean;
  load: () => void;
} {
  const api = useApi();
  const entry = useContactBriefStore((state) =>
    contactId ? state.entries[contactId] : undefined
  );
  const epoch = useContactBriefStore((state) => state.epoch);
  const loadBrief = useContactBriefStore((state) => state.load);

  const load = useCallback(() => {
    if (contactId) void loadBrief(api, contactId);
  }, [api, contactId, loadBrief]);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load, epoch]);

  return {
    brief: entry?.brief ?? null,
    loading: !entry?.brief && (entry?.loading ?? enabled),
    failed: !entry?.brief && (entry?.failed ?? false),
    load
  };
}
