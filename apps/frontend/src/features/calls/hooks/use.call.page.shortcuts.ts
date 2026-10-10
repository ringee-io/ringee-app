'use client';

import { useEffect, useRef } from 'react';
import { shortcutAllowed } from '@ringee/frontend-shared/lib/shortcuts';

interface CallPageShortcuts {
  /** N */
  onCallNext: () => void;
  /** / */
  onFocusSearch: () => void;
  /** K */
  onToggleKeypad: () => void;
  /** L */
  onToggleListPicker: () => void;
  /** S — only while "Call next" offers a list's contact. */
  onSkip: () => void;
}

/**
 * The Call page's keyboard shortcuts. They never act while the user types
 * (a note, the search, any field), nor while a dialog or menu is open — the
 * call screen and its wrap-up included — and none of them ends a call.
 */
export function useCallPageShortcuts(actions: CallPageShortcuts) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Letters only: a focused button has no use for N, K, L or S, and
      // after a call the focus is usually back on the button that started it.
      if (!shortcutAllowed(event, 'digit')) return;
      // A select's options take letters for type-ahead.
      if (
        document.querySelector(
          '[role="dialog"], [role="menu"], [role="listbox"]'
        )
      ) {
        return;
      }

      if (event.key === '/') {
        event.preventDefault();
        actionsRef.current.onFocusSearch();
      } else if (event.code === 'KeyN' && !event.shiftKey) {
        event.preventDefault();
        actionsRef.current.onCallNext();
      } else if (event.code === 'KeyK' && !event.shiftKey) {
        event.preventDefault();
        actionsRef.current.onToggleKeypad();
      } else if (event.code === 'KeyL' && !event.shiftKey) {
        event.preventDefault();
        actionsRef.current.onToggleListPicker();
      } else if (event.code === 'KeyS' && !event.shiftKey) {
        event.preventDefault();
        actionsRef.current.onSkip();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
