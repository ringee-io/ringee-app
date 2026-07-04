'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { ApiClient } from '@ringee/frontend-shared/lib/api';

type FetchStatus = 'idle' | 'loading' | 'success' | 'error';

interface AutoReloadSettings {
  autoReloadEnabled: boolean;
  autoReloadThreshold: number;
  autoReloadAmount: number;
  monthlyFundEnabled: boolean;
  monthlyFundAmount: number | null;
}

export interface SavedPaymentMethod {
  hasSavedMethod: boolean;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
}

interface CreditState {
  balance: number;
  freeCallTrial: boolean;
  status: FetchStatus;
  // True once the balance has loaded successfully at least once. Used to gate
  // the initial skeleton so background refreshes (post-payment reconciliation)
  // never collapse the UI back to a loading state.
  hasLoaded: boolean;
  error: string | null;
  autoReloadSettings: AutoReloadSettings | null;
  // Last confirmed top-up, used to suggest the previous amount as the default.
  lastTopupAmount: number | null;
  lastTopupAt: string | null;
  // Reusable saved card (display fields only — the payment-method id never
  // leaves the server). `null` until fetched.
  paymentMethod: SavedPaymentMethod | null;
  paymentMethodStatus: FetchStatus;
  // `silent` refreshes update the balance in place WITHOUT toggling `status`
  // to 'loading' — used by the post-payment reconciliation poll so the open
  // recharge panel is never torn down mid-flow.
  fetchBalance: (
    api: ApiClient,
    useMock?: boolean,
    silent?: boolean
  ) => Promise<void>;
  fetchAutoReloadSettings: (api: ApiClient) => Promise<void>;
  fetchPaymentMethod: (api: ApiClient) => Promise<void>;
  setBalance: (balance: number) => void;
  setFreeCallTrial: (v: boolean) => void;
  reset: () => void;
}

export const useCreditStore = create<CreditState>()(
  devtools((set) => ({
    balance: 0,
    freeCallTrial: false,
    status: 'idle',
    hasLoaded: false,
    error: null,
    autoReloadSettings: null,
    lastTopupAmount: null,
    lastTopupAt: null,
    paymentMethod: null,
    paymentMethodStatus: 'idle',

    fetchBalance: async (api: ApiClient, useMock?: boolean, silent?: boolean) => {
      // A silent refresh keeps the last good balance on screen — never flip to
      // 'loading', or every reconciliation poll would tear down the open panel.
      if (!silent) set({ status: 'loading', error: null });

      try {
        const { balance, freeCallTrial, lastTopupAmount, lastTopupAt } =
          await api.get(
            '/credits/balance',
            useMock ? { mock: true } : undefined
          );
        set({
          balance,
          freeCallTrial,
          lastTopupAmount: lastTopupAmount ?? null,
          lastTopupAt: lastTopupAt ?? null,
          status: 'success',
          hasLoaded: true,
          error: null
        });
      } catch (err: any) {
        console.error('Error fetching balance:', err);
        // Don't downgrade the UI on a background refresh — keep what we have.
        if (!silent) {
          set({
            status: 'error',
            error: err?.message || 'Failed to fetch balance'
          });
        }
      }
    },

    fetchAutoReloadSettings: async (api: ApiClient) => {
      try {
        const settings = await api.get('/credits/auto-reload-settings');
        set({ autoReloadSettings: settings });
      } catch (err: any) {
        console.error('Error fetching auto-reload settings:', err);
      }
    },

    fetchPaymentMethod: async (api: ApiClient) => {
      set({ paymentMethodStatus: 'loading' });
      try {
        const pm = await api.get('/stripe/payment-method');
        set({
          paymentMethod: {
            hasSavedMethod: !!pm?.hasSavedMethod,
            brand: pm?.brand ?? null,
            last4: pm?.last4 ?? null,
            expMonth: pm?.expMonth ?? null,
            expYear: pm?.expYear ?? null
          },
          paymentMethodStatus: 'success'
        });
      } catch (err: any) {
        console.error('Error fetching payment method:', err);
        // Fail closed: treat as "no saved method" so the UI falls back to the
        // embedded checkout path rather than showing a broken fast-recharge.
        set({
          paymentMethod: {
            hasSavedMethod: false,
            brand: null,
            last4: null,
            expMonth: null,
            expYear: null
          },
          paymentMethodStatus: 'error'
        });
      }
    },

    setBalance: (balance) => set({ balance }),
    reset: () =>
      set({
        balance: 0,
        status: 'idle',
        hasLoaded: false,
        error: null,
        autoReloadSettings: null,
        lastTopupAmount: null,
        lastTopupAt: null,
        paymentMethod: null,
        paymentMethodStatus: 'idle'
      }),
    setFreeCallTrial: (v) => set({ freeCallTrial: v })
  }))
);
