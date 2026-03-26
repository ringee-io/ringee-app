'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { ApiClient } from '@ringee/frontend-shared/lib/api';

export type NumberPurchased = {
  id: string;
  phoneNumber: string;
  isoCountry: string;
  phoneNumberType?: string;
  status?: string;
  providerConnectionName?: string;
  purchaseDate?: string | null;
  monthlyCost?: number | null;
  upfrontCost?: number | null;
};

type FetchStatus = 'idle' | 'loading' | 'success' | 'error';

interface NumbersState {
  numbers: NumberPurchased[];
  selectedNumber: NumberPurchased | null;
  status: FetchStatus;
  fetchNumbers: (api: ApiClient) => Promise<void>;
  selectNumber: (num: NumberPurchased | null) => void;
  reset: () => void;
}

const STORAGE_KEY = 'ringee:selected-number-id';

const publicNumber = {
  id: 'public',
  phoneNumber: '+17869460882',
  isoCountry: 'US'
};

export const useNumbersStore = create<NumbersState>()(
  devtools((set) => ({
    numbers: [],
    selectedNumber: publicNumber,
    status: 'idle',

    fetchNumbers: async (api: ApiClient) => {
      set({ status: 'loading' });
      try {
        const data = await api.get('/telephony/phone-numbers');
        const list = Array.isArray(data) ? data : [];

        const savedId =
          typeof window !== 'undefined'
            ? localStorage.getItem(STORAGE_KEY)
            : null;

        let restored: NumberPurchased | null = null;

        if (savedId && savedId !== 'public') {
          restored = list.find((n: NumberPurchased) => n.id === savedId) ?? null;
        }

        set({
          numbers: list,
          selectedNumber: restored ?? publicNumber,
          status: 'success'
        });

        if (savedId && savedId !== 'public' && !restored) {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch (err) {
        set({ status: 'error', numbers: [] });
      }
    },

    selectNumber: (num) => {
      if (typeof window !== 'undefined') {
        if (num) {
          localStorage.setItem(STORAGE_KEY, num.id);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
      set({ selectedNumber: num });
    },

    reset: () => {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
      set({ numbers: [], selectedNumber: null, status: 'idle' });
    }
  }))
);
