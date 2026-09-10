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
  /**
   * A row inside that pane — today the calendar an AI voice agent books on, so
   * "Manage availability" lands on the hours it actually uses. Panes that have
   * no rows ignore it.
   */
  requestedTarget: string | null;
  openSettings: (item?: SettingsItemId, target?: string | null) => void;
  setItem: (item: SettingsItemId) => void;
  /** A pane reporting which of its rows is showing, so the URL keeps up. */
  setTarget: (target: string | null) => void;
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
  requestedTarget: null,
  // Without an argument the dialog reopens on the pane it was last showing —
  // the keyboard shortcut and a bare `#settings` fragment both rely on that.
  openSettings: (item, target) =>
    set((state) => ({
      open: true,
      requestedItem: item ?? state.requestedItem,
      // A caller naming a pane but no row is asking for the pane itself, so a
      // row left over from the previous visit must not resurface.
      requestedTarget: item ? (target ?? null) : state.requestedTarget
    })),
  setItem: (item) => set({ requestedItem: item, requestedTarget: null }),
  setTarget: (target) => set({ requestedTarget: target }),
  setOpen: (open) => set({ open }),
  close: () => set({ open: false })
}));
