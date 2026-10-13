'use client';

import { create } from 'zustand';
import type { AutomationCapability, AutomationSummary } from './types';

const STORAGE_KEY = 'ringee.voiceAgentsRail';

/** A mini-form in progress, kept while the person opens "Customize" and back. */
export type RailDraft = Record<string, unknown>;

interface RailState {
  open: boolean;
  /** The card that is expanded — restored on return from the editor. */
  focus: AutomationCapability | null;
  /** Reopen once the editor closes; set when "Customize" navigated away. */
  resume: boolean;
  drafts: Partial<Record<AutomationCapability, RailDraft>>;
  /**
   * What the closed rail shows, shared with the surfaces that offer an
   * automation's action (a contact's "Call to schedule"). Not persisted.
   */
  summary: AutomationSummary | null;
  setSummary: (summary: AutomationSummary | null) => void;
  setOpen: (open: boolean) => void;
  setFocus: (focus: AutomationCapability | null) => void;
  setResume: (resume: boolean) => void;
  setDraft: (capability: AutomationCapability, draft: RailDraft | null) => void;
  hydrate: () => void;
}

type Persisted = Pick<RailState, 'open' | 'focus' | 'resume' | 'drafts'>;

/**
 * Per-tab convenience only: a reload keeps the rail where it was. Storage can
 * be unavailable (private windows, blocked site data), so every access is
 * guarded and the rail works the same without it.
 */
function read(): Partial<Persisted> {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
  } catch {
    return {};
  }
}

function write(state: Persisted) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Not persisting is fine; the in-memory state still works.
  }
}

const persisted = (state: RailState): Persisted => ({
  open: state.open,
  focus: state.focus,
  resume: state.resume,
  drafts: state.drafts
});

export const useVoiceAgentsRail = create<RailState>()((set, get) => ({
  open: false,
  focus: null,
  resume: false,
  drafts: {},
  summary: null,
  setSummary: (summary) => set({ summary }),
  setOpen: (open) => {
    set({ open });
    write(persisted(get()));
  },
  setFocus: (focus) => {
    set({ focus });
    write(persisted(get()));
  },
  setResume: (resume) => {
    set({ resume });
    write(persisted(get()));
  },
  setDraft: (capability, draft) => {
    const drafts = { ...get().drafts };
    if (draft) drafts[capability] = draft;
    else delete drafts[capability];
    set({ drafts });
    write(persisted(get()));
  },
  hydrate: () => {
    const stored = read();
    set({
      open: stored.open === true,
      focus: stored.focus ?? null,
      resume: stored.resume === true,
      drafts:
        stored.drafts && typeof stored.drafts === 'object' ? stored.drafts : {}
    });
  }
}));
