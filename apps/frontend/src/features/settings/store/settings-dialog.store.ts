'use client';

import { create } from 'zustand';
import type { SettingsItemId } from '../types';

interface SettingsDialogState {
  open: boolean;
  /**
   * The pane the caller asked for. The dialog resolves it against the panes the
   * current role may open, so this stays a request, not a guarantee.
   */
  requestedItem: SettingsItemId | null;
  openSettings: (item?: SettingsItemId) => void;
  setItem: (item: SettingsItemId) => void;
  setOpen: (open: boolean) => void;
  close: () => void;
}

/**
 * Drives the single settings dialog mounted by the dashboard shell. Kept in a
 * store (not local state) so any surface — the sidebar user menu, a keyboard
 * shortcut — can open it on a specific pane without prop-drilling.
 */
export const useSettingsDialogStore = create<SettingsDialogState>((set) => ({
  open: false,
  requestedItem: null,
  // Without an argument the dialog reopens on the pane it was last showing —
  // the keyboard shortcut and a bare `#settings` fragment both rely on that.
  openSettings: (item) =>
    set((state) => ({
      open: true,
      requestedItem: item ?? state.requestedItem
    })),
  setItem: (item) => set({ requestedItem: item }),
  setOpen: (open) => set({ open }),
  close: () => set({ open: false })
}));
