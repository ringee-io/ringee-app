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

// A number can only be used as a caller ID while it is in a usable state.
// Exported so the dropdown and the restore-from-storage logic can never
// disagree about what is actually offerable.
const UNSELECTABLE_STATUSES = ['pending', 'inactive', 'released'];

export function isSelectableNumber(num: NumberPurchased): boolean {
  return !UNSELECTABLE_STATUSES.includes(num.status ?? '');
}

// The shared "public" / free-trial caller ID is configuration, not a literal:
// it comes from NEXT_PUBLIC_RINGEE_PUBLIC_CALLER_ID. When unset, no public line
// is offered and calling requires a purchased number (resolved from backend).
const publicNumber = {
  id: 'public',
  phoneNumber: process.env.NEXT_PUBLIC_RINGEE_PUBLIC_CALLER_ID || '',
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

        // The stored id is only a hint: restore it exclusively when the backend
        // still returns that number as selectable. Otherwise a number deleted
        // (or released/deactivated) elsewhere would stay selected forever just
        // because this browser remembers its id.
        if (savedId && savedId !== 'public') {
          restored =
            list.find(
              (n: NumberPurchased) => n.id === savedId && isSelectableNumber(n)
            ) ?? null;
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
        // Without a list we cannot prove the remembered number still exists —
        // fall back to the public line instead of dialing from a stale id.
        set({ status: 'error', numbers: [], selectedNumber: publicNumber });
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
