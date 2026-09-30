'use client';

import { create } from 'zustand';

export interface PublicNumberPrompt {
  /** The workspace has numbers of its own the user could call from instead. */
  hasOwnNumbers: boolean;
}

/** How the user answered: no call, this call, or every call from now on. */
export type PublicNumberDecision = 'cancel' | 'call' | 'always';

// Per browser, like the selected caller ID it is about.
const DISMISSED_KEY = 'ringee:public-number-warning-dismissed';

/** The user asked not to be warned about the public number again. */
export function isPublicNumberWarningDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

interface PublicNumberPromptState {
  prompt: PublicNumberPrompt | null;
  resolve: ((callAnyway: boolean) => void) | null;
  ask: (prompt: PublicNumberPrompt) => Promise<boolean>;
  settle: (decision: PublicNumberDecision) => void;
}

export const usePublicNumberPromptStore = create<PublicNumberPromptState>()(
  (set, get) => ({
    prompt: null,
    resolve: null,
    ask: (prompt) =>
      new Promise<boolean>((resolve) => {
        // A second prompt replaces the first: the earlier dial is abandoned.
        get().resolve?.(false);
        set({ prompt, resolve });
      }),
    settle: (decision) => {
      if (decision === 'always') {
        try {
          localStorage.setItem(DISMISSED_KEY, '1');
        } catch {
          // Storage unavailable (private mode): the warning simply comes back.
        }
      }
      get().resolve?.(decision !== 'cancel');
      set({ prompt: null, resolve: null });
    }
  })
);

/**
 * Tell the user this call goes out from the shared public number before it
 * does. Resolves `true` to place the call — at once when they asked not to be
 * warned again. Every dial surface shares the single dialog mounted next to
 * the active-call modal.
 */
export function confirmPublicNumberCall(
  prompt: PublicNumberPrompt
): Promise<boolean> {
  if (isPublicNumberWarningDismissed()) return Promise.resolve(true);
  return usePublicNumberPromptStore.getState().ask(prompt);
}
