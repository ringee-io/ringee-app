'use client';

import { useEffect, useRef } from 'react';
import { shortcutAllowed } from '@ringee/frontend-shared/lib/shortcuts';

/** Each tab passes the keys it has: My day all of them, Campaigns only N. */
interface CallPageShortcuts {
  /** N */
  onCallNext?: () => void;
  /** / */
  onFocusSearch?: () => void;
  /** K */
  onToggleKeypad?: () => void;
  /** L */
  onToggleListPicker?: () => void;
  /** S — only while "Call next" offers a list's contact. */
  onSkip?: () => void;
}

const LETTERS: Partial<Record<string, keyof CallPageShortcuts>> = {
  KeyN: 'onCallNext',
  KeyK: 'onToggleKeypad',
  KeyL: 'onToggleListPicker',
  KeyS: 'onSkip'
};

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

      const name =
        event.key === '/'
          ? 'onFocusSearch'
          : event.shiftKey
            ? undefined
            : LETTERS[event.code];
      const action = name ? actionsRef.current[name] : undefined;
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
