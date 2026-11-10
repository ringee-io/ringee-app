'use client';

import { create } from 'zustand';
import type { ApiClient } from '@ringee/frontend-shared/lib/api';
import type { MyDayContactBrief } from '../types/my-day';

interface BriefEntry {
  brief: MyDayContactBrief | null;
  loading: boolean;
  failed: boolean;
  /** The epoch it was loaded in; an older one is reloaded on next use. */
  epoch: number;
}

interface ContactBriefState {
  entries: Record<string, BriefEntry>;
  /** Moves after every call: a contact's history may have a new line. */
  epoch: number;
  load: (api: ApiClient, contactId: string) => Promise<void>;
  invalidate: () => void;
}

/**
 * Who each contact on the Call page is (`GET /my-day/contacts/:id`), loaded
 * once per contact and kept while the page lives. A stale brief stays on
 * screen while its fresh copy loads, so the Next call card never blinks.
 */
export const useContactBriefStore = create<ContactBriefState>((set, get) => ({
  entries: {},
  epoch: 0,
  load: async (api, contactId) => {
    const { entries, epoch } = get();
    const current = entries[contactId];
    if (
      current &&
      current.epoch === epoch &&
      (current.loading || !current.failed)
    )
      return;

    set((state) => ({
      entries: {
        ...state.entries,
        [contactId]: {
          brief: current?.brief ?? null,
          loading: true,
          failed: false,
          epoch
        }
      }
    }));
    try {
      const brief = await api.get<MyDayContactBrief>(
        `/my-day/contacts/${encodeURIComponent(contactId)}`
      );
      set((state) => ({
        entries: {
          ...state.entries,
          [contactId]: { brief, loading: false, failed: false, epoch }
        }
      }));
    } catch {
      set((state) => ({
        entries: {
          ...state.entries,
          [contactId]: {
            brief: state.entries[contactId]?.brief ?? null,
            loading: false,
            failed: true,
            epoch
          }
        }
      }));
    }
  },
  invalidate: () => set((state) => ({ epoch: state.epoch + 1 }))
}));
