'use client';

import { create } from 'zustand';

interface FreeCallRequestStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

/**
 * Controls the free-call request modal, opened on demand from the onboarding
 * guide's step.
 */
export const useFreeCallRequestStore = create<FreeCallRequestStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false })
}));
