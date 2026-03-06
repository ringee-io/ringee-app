'use client';

import { create } from 'zustand';

type AuthTab = 'sign-in' | 'sign-up';

interface AuthModalState {
  isOpen: boolean;
  activeTab: AuthTab;
  openModal: (tab?: AuthTab) => void;
  closeModal: () => void;
  setTab: (tab: AuthTab) => void;
}

export const useAuthModalStore = create<AuthModalState>((set) => ({
  isOpen: false,
  activeTab: 'sign-in',
  openModal: (tab = 'sign-up') => set({ isOpen: true, activeTab: tab }),
  closeModal: () => set({ isOpen: false }),
  setTab: (tab) => set({ activeTab: tab })
}));
