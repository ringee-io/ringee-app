'use client';

import { create } from 'zustand';
import { v4 as uuid } from 'uuid';

export type ScriptSection = {
  id: string;
  title: string;
  body: string;
};

export type ScriptStatus = 'idle' | 'loading' | 'ready' | 'error';

type ScriptState = {
  sections: ScriptSection[];
  status: ScriptStatus;
  saving: boolean;
  /** Increments on every local mutation — used to debounce saves. */
  revision: number;

  setStatus: (status: ScriptStatus) => void;
  setSaving: (v: boolean) => void;

  hydrate: (sections: ScriptSection[]) => void;

  addSection: (input?: { title?: string; body?: string }) => string;
  updateSection: (id: string, patch: Partial<Omit<ScriptSection, 'id'>>) => void;
  removeSection: (id: string) => void;
  reorderSections: (orderedIds: string[]) => void;
};

export const useScriptStore = create<ScriptState>((set, get) => ({
  sections: [],
  status: 'idle',
  saving: false,
  revision: 0,

  setStatus: (status) => set({ status }),
  setSaving: (saving) => set({ saving }),

  hydrate: (sections) =>
    set({
      sections: sections.map((s) => ({
        id: s.id || uuid(),
        title: s.title ?? '',
        body: s.body ?? ''
      })),
      status: 'ready'
    }),

  addSection: (input) => {
    const id = uuid();
    set((state) => ({
      sections: [
        ...state.sections,
        {
          id,
          title: input?.title ?? 'Nueva sección',
          body: input?.body ?? ''
        }
      ],
      revision: state.revision + 1
    }));
    return id;
  },

  updateSection: (id, patch) =>
    set((state) => ({
      sections: state.sections.map((s) =>
        s.id === id ? { ...s, ...patch } : s
      ),
      revision: state.revision + 1
    })),

  removeSection: (id) =>
    set((state) => ({
      sections: state.sections.filter((s) => s.id !== id),
      revision: state.revision + 1
    })),

  reorderSections: (orderedIds) => {
    const map = new Map(get().sections.map((s) => [s.id, s]));
    const next = orderedIds
      .map((sid) => map.get(sid))
      .filter((s): s is ScriptSection => Boolean(s));
    set((state) => ({ sections: next, revision: state.revision + 1 }));
  }
}));
