'use client';

import { create } from 'zustand';
import type { AutomationCapability, AutomationSummary } from './types';

const STORAGE_KEY = 'ringee.voiceAgentsRail';

/** A mini-form in progress, kept while the person opens "Customize" and back. */
export type RailDraft = Record<string, unknown>;

interface RailState {
  workspaceKey: string | null;
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
  setSummary: (summary: AutomationSummary | null, workspaceKey: string) => void;
  setOpen: (open: boolean) => void;
  setFocus: (focus: AutomationCapability | null) => void;
  setResume: (resume: boolean) => void;
  setDraft: (
    capability: AutomationCapability,
    draft: RailDraft | null,
    workspaceKey: string | null
  ) => void;
  hydrate: (workspaceKey: string | null) => void;
}

type Persisted = Pick<RailState, 'open' | 'focus' | 'resume' | 'drafts'>;

/**
 * Per-tab convenience only: a reload keeps the rail where it was. Storage can
 * be unavailable (private windows, blocked site data), so every access is
 * guarded and the rail works the same without it.
 */
function read(workspaceKey: string | null): Partial<Persisted> {
  if (!workspaceKey) return {};
  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_KEY}:${workspaceKey}`);
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
  } catch {
    return {};
  }
}

function write(state: Persisted, workspaceKey: string | null) {
  if (!workspaceKey) return;
  try {
    window.sessionStorage.setItem(
      `${STORAGE_KEY}:${workspaceKey}`,
      JSON.stringify(state)
    );
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
  workspaceKey: null,
  open: false,
  focus: null,
  resume: false,
  drafts: {},
  summary: null,
  setSummary: (summary, workspaceKey) => {
    if (get().workspaceKey === workspaceKey) set({ summary });
  },
  setOpen: (open) => {
    set({ open });
    write(persisted(get()), get().workspaceKey);
  },
  setFocus: (focus) => {
    set({ focus });
    write(persisted(get()), get().workspaceKey);
  },
  setResume: (resume) => {
    set({ resume });
    write(persisted(get()), get().workspaceKey);
  },
  setDraft: (capability, draft, workspaceKey) => {
    if (!workspaceKey || get().workspaceKey !== workspaceKey) return;
    const drafts = { ...get().drafts };
    if (draft) drafts[capability] = draft;
    else delete drafts[capability];
    set({ drafts });
    write(persisted(get()), get().workspaceKey);
  },
  hydrate: (workspaceKey) => {
    if (get().workspaceKey === workspaceKey) return;
    // The old unscoped draft has no trustworthy owner and cannot be migrated.
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* Storage is optional. */
    }
    const stored = read(workspaceKey);
    set({
      workspaceKey,
      summary: null,
      open: stored.open === true,
      focus: stored.focus ?? null,
      resume: stored.resume === true,
      drafts:
        stored.drafts && typeof stored.drafts === 'object' ? stored.drafts : {}
    });
  }
}));
