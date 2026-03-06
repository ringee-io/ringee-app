'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface OnboardingUIStore {
  // UI state (persisted locally for UX)
  isExpanded: boolean;
  isMinimized: boolean;

  // Actions
  toggleExpanded: () => void;
  setExpanded: (expanded: boolean) => void;
  toggleMinimized: () => void;
  setMinimized: (minimized: boolean) => void;
}

export const useOnboardingUIStore = create<OnboardingUIStore>()(
  persist(
    (set) => ({
      isExpanded: true,
      isMinimized: false,

      toggleExpanded: () => set((state) => ({ isExpanded: !state.isExpanded })),
      setExpanded: (expanded) => set({ isExpanded: expanded }),
      toggleMinimized: () => set((state) => ({ isMinimized: !state.isMinimized })),
      setMinimized: (minimized) => set({ isMinimized: minimized }),
    }),
    {
      name: 'ringee-onboarding-ui',
    }
  )
);

// ... existing UI store code ...

interface OnboardingDataStore {
  status: import('../types/onboarding.types').OnboardingStatus | null;
  isLoading: boolean;
  error: string | null;

  setStatus: (status: import('../types/onboarding.types').OnboardingStatus | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useOnboardingDataStore = create<OnboardingDataStore>((set) => ({
  status: null,
  isLoading: true,
  error: null,

  setStatus: (status) => set({ status }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
