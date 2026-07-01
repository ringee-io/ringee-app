'use client';

import { create } from 'zustand';

interface FreeCallRequestStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

/**
 * Controls the free-call request modal so it can be opened both automatically
 * (on first load after signup) and on demand from the onboarding guide step.
 */
export const useFreeCallRequestStore = create<FreeCallRequestStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false })
}));
