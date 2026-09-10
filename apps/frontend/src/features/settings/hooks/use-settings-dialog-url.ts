'use client';

import * as React from 'react';
import {
  isSettingsHash,
  settingsHash,
  settingsItemFromHash,
  settingsTargetFromHash
} from '../lib/settings-nav';
import { useSettingsDialogStore } from '../store/settings-dialog.store';
import type { SettingsItemId } from '../types';

/**
 * Two-way binding between the settings dialog and the URL fragment
 * (`#settings/general`, `#settings/recording`).
 *
 * The dialog overlays whatever page you are on, so it cannot own a route — the
 * fragment gives it an address anyway: a pane can be linked to, survives a
 * reload, and Back closes the dialog instead of leaving the page.
 *
 * Written with the native History API rather than the Next router: this changes
 * the URL without a navigation, so no RSC round-trip and no scroll reset.
 * `pushState` / `replaceState` do not emit `hashchange`, so the two effects
 * below cannot feed each other.
 *
 * @param activeId the pane actually being shown — already resolved against the
 * caller's role, so an admin-only fragment opened by a member canonicalises to
 * the pane they landed on.
 */
export function useSettingsDialogUrl(activeId: SettingsItemId | null) {
  const open = useSettingsDialogStore((s) => s.open);
  const openSettings = useSettingsDialogStore((s) => s.openSettings);
  const close = useSettingsDialogStore((s) => s.close);
  const target = useSettingsDialogStore((s) => s.requestedTarget);

  // Whether the entry currently in history is one we pushed. A fragment the
  // user arrived with (a shared link, a reload) has nothing behind it, so
  // closing must rewrite the URL rather than navigate back out of the app.
  const pushedRef = React.useRef(false);
  const wasOpenRef = React.useRef(false);

  // URL → dialog. Also covers the first paint, so a shared link opens the pane.
  React.useEffect(() => {
    const sync = () => {
      if (isSettingsHash(window.location.hash)) {
        const item = settingsItemFromHash(window.location.hash);
        openSettings(
          item ?? undefined,
          item ? settingsTargetFromHash(window.location.hash) : undefined
        );
      } else {
        close();
      }
    };

    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [openSettings, close]);

  // Dialog → URL.
  React.useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;

    if (open) {
      if (!activeId) return;
      const next = settingsHash(activeId, target);
      if (window.location.hash === next) return;

      if (isSettingsHash(window.location.hash)) {
        // Already on a settings fragment — switching panes, or correcting one
        // that named a pane this account cannot open. Not a new history entry.
        window.history.replaceState(null, '', next);
      } else {
        // Opening from a normal URL: keep that URL in history so Back closes
        // the dialog and lands back on the page underneath it.
        window.history.pushState(null, '', next);
        pushedRef.current = true;
      }
      return;
    }

    // `wasOpen` keeps the first render from stripping a fragment the dialog has
    // not had the chance to open on yet.
    if (!wasOpen) return;
    if (!isSettingsHash(window.location.hash)) return;

    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    } else {
      window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search
      );
    }
  }, [open, activeId, target]);
}
