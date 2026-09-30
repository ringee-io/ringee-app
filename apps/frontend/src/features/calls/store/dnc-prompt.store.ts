'use client';

import { create } from 'zustand';

export interface DncPrompt {
  phoneNumber: string;
  reason: string | null;
  addedAt: string | null;
}

interface DncPromptState {
  prompt: DncPrompt | null;
  resolve: ((callAnyway: boolean) => void) | null;
  ask: (prompt: DncPrompt) => Promise<boolean>;
  settle: (callAnyway: boolean) => void;
}

export const useDncPromptStore = create<DncPromptState>()((set, get) => ({
  prompt: null,
  resolve: null,
  ask: (prompt) =>
    new Promise<boolean>((resolve) => {
      // A second prompt replaces the first: the earlier dial is abandoned.
      get().resolve?.(false);
      set({ prompt, resolve });
    }),
  settle: (callAnyway) => {
    get().resolve?.(callAnyway);
    set({ prompt: null, resolve: null });
  }
}));

/**
 * Ask the user whether to dial a number that is on the Do Not Call list.
 * Resolves `true` only for an explicit "call anyway". Every dial surface in the
 * dashboard shares the single dialog mounted next to the active-call modal.
 */
export function confirmDncCall(prompt: DncPrompt): Promise<boolean> {
  return useDncPromptStore.getState().ask(prompt);
}
