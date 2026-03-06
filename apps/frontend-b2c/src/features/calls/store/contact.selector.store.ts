'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { ApiClient } from '@ringee/frontend-shared/lib/api';

interface Contact {
  id: string;
  name: string;
  phone: string;
}

type FetchStatus = 'idle' | 'loading' | 'success' | 'error';

interface ContactsState {
  matches: Contact[];
  selectedContact: Contact | null;
  status: FetchStatus;
  isFetchingMore: boolean;
  page: number;
  hasMore: boolean;
  total: number;
  fetchContacts: (
    api: ApiClient,
    query: string,
    page?: number
  ) => Promise<void>;
  loadMore: (api: ApiClient, query: string) => Promise<void>;
  selectContact: (c: Contact | null) => void;
  reset: () => void;
}

export const useContactsStore = create<ContactsState>()(
  devtools((set, get) => ({
    matches: [],
    selectedContact: null,
    status: 'idle',
    isFetchingMore: false,
    page: 1,
    hasMore: true,
    total: 0,

    fetchContacts: async (api: ApiClient, query: string, page = 1) => {
      query = query.replaceAll('+', '');
      query = query.replaceAll(' ', '');

      if (!query || query.trim().length < 3) {
        set({
          matches: [],
          selectedContact: null,
          status: 'idle',
          hasMore: false,
          total: 0
        });
        return;
      }

      set({ status: 'loading', page: 1, isFetchingMore: false });

      try {
        const { data, meta } = await api.get(
          `/contacts?search=${query}&page=${page}&limit=20`
        );

        const contacts = (data ?? []).map((c: any) => ({
          id: c.id,
          name: c.name,
          phone: c.phoneNumber
        }));

        const total = meta.total;
        set({
          matches: contacts,
          selectedContact: contacts[0] || null,
          status: 'success',
          hasMore: contacts.length > 0,
          total,
          page
        });
      } catch (err) {
        set({ status: 'error', hasMore: false, isFetchingMore: false });
      }
    },

    loadMore: async (api, query) => {
      query = query.replaceAll('+', '');
      query = query.replaceAll(' ', '');

      const { page, hasMore, isFetchingMore } = get();
      if (!hasMore || isFetchingMore) return;

      set({ isFetchingMore: true });

      try {
        const nextPage = page + 1;
        const { data } = await api.get(
          `/contacts?search=${query}&page=${nextPage}&limit=20`
        );
        const contacts = (data ?? []).map((c: any) => ({
          id: c.id,
          name: c.name,
          phone: c.phoneNumber
        }));

        set((state) => ({
          matches: [...state.matches, ...contacts],
          page: nextPage,
          hasMore: contacts.length > 0,
          isFetchingMore: false
        }));
      } catch (err) {
        set({ isFetchingMore: false });
      }
    },

    selectContact: (contact) => set({ selectedContact: contact }),

    reset: () =>
      set({
        matches: [],
        selectedContact: null,
        status: 'idle',
        isFetchingMore: false,
        page: 1,
        hasMore: true,
        total: 0
      })
  }))
);
