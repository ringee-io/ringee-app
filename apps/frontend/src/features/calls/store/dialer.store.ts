'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface DialerState {
  number: string;
  setNumber: (num: string) => void;
  quickDial: boolean;
  quickDialState: 'idle' | 'open' | 'closed';
  setQuickDial: (quick: boolean) => void;
}

export const useDialerStore = create<DialerState>()(
  devtools((set, get) => ({
    number: '',
    setNumber: (num: string) => set({ number: num }),
    quickDial: false,
    quickDialState: 'idle',
    setQuickDial: (quick: boolean) => {
      if (window && window.cookieStore) {
        window.cookieStore.set('quick_dial_state', quick ? 'true' : 'false');
      }

      set({ quickDial: quick, quickDialState: quick ? 'open' : 'closed' });
    },
    setCallTo: (to: string) => {
      const state = get().quickDialState;

      set({ number: to });

      return state;
    }
  }))
);
