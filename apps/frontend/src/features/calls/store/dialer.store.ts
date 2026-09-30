'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface DialerState {
  number: string;
  setNumber: (num: string) => void;
  /** The number a dial is being started for (DNC check, pre-flight), if any. */
  dialingNumber: string | null;
  setDialingNumber: (num: string | null) => void;
  quickDial: boolean;
  quickDialState: 'idle' | 'open' | 'closed';
  setQuickDial: (quick: boolean) => void;
}

export const useDialerStore = create<DialerState>()(
  devtools((set, get) => ({
    number: '',
    setNumber: (num: string) => set({ number: num }),
    dialingNumber: null,
    setDialingNumber: (num: string | null) => set({ dialingNumber: num }),
    quickDial: false,
    quickDialState: 'idle',
    setQuickDial: (quick: boolean) => {
      // The frontend's older DOM typings do not yet declare Cookie Store.
      // It is optional at runtime as well (unsupported browsers or SSR).
      const cookieStore =
        typeof window === 'undefined'
          ? undefined
          : (
              window as Window & {
                cookieStore?: {
                  set(name: string, value: string): Promise<void>;
                };
              }
            ).cookieStore;
      void cookieStore
        ?.set('quick_dial_state', quick ? 'true' : 'false')
        .catch(() => undefined);

      set({ quickDial: quick, quickDialState: quick ? 'open' : 'closed' });
    },
    setCallTo: (to: string) => {
      const state = get().quickDialState;

      set({ number: to });

      return state;
    }
  }))
);
