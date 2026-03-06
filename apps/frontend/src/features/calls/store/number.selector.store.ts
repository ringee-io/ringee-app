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
        set({
          numbers: list,
          status: 'success'
        });
      } catch (err) {
        set({ status: 'error', numbers: [] });
      }
    },

    selectNumber: (num) => set({ selectedNumber: num }),
    reset: () => set({ numbers: [], selectedNumber: null, status: 'idle' })
  }))
);
