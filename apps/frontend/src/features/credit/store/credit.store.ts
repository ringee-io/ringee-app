'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { ApiClient } from '@ringee/frontend-shared/lib/api';

type FetchStatus = 'idle' | 'loading' | 'success' | 'error';

interface CreditState {
  balance: number;
  freeCallTrial: boolean;
  status: FetchStatus;
  error: string | null;
  fetchBalance: (api: ApiClient, useMock?: boolean) => Promise<void>;
  setBalance: (balance: number) => void;
  setFreeCallTrial: (v: boolean) => void;
  reset: () => void;
}

export const useCreditStore = create<CreditState>()(
  devtools((set) => ({
    balance: 0,
    freeCallTrial: false,
    status: 'idle',
    error: null,

    fetchBalance: async (api: ApiClient, useMock?: boolean) => {
      set({ status: 'loading', error: null });

      try {
        const { balance, freeCallTrial } = await api.get(
          '/credits/balance',
          useMock ? { mock: true } : undefined
        );
        set({ balance, freeCallTrial, status: 'success' });
      } catch (err: any) {
        console.error('Error fetching balance:', err);
        set({
          status: 'error',
          error: err?.message || 'Failed to fetch balance'
        });
      }
    },
    setBalance: (balance) => set({ balance }),
    reset: () => set({ balance: 0, status: 'idle', error: null }),
    setFreeCallTrial: (v) => set({ freeCallTrial: v })
  }))
);
