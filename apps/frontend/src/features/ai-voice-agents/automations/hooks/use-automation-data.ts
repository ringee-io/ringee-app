'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAutomationApi } from '../api';
import { useVoiceAgentsRail } from '../store';
import type { AutomationPanel } from '../types';

/** How often an open panel refreshes its states and activity. */
const PANEL_REFRESH_MS = 60_000;

/**
 * Whether the rail exists for this workspace, and what the closed rail shows.
 * Two light requests per page load: the ungated access check, and — only when
 * the pilot flag is on — the summary. Nothing else loads until it opens.
 */
export function useRailSummary(workspaceKey: string | null) {
  const api = useAutomationApi();
  const [enabled, setEnabled] = useState(false);
  const summary = useVoiceAgentsRail((state) => state.summary);
  const setSummary = useVoiceAgentsRail((state) => state.setSummary);

  const refresh = useCallback(async () => {
    if (!workspaceKey) return;
    try {
      const next = await api.summary();
      if (useVoiceAgentsRail.getState().workspaceKey !== workspaceKey) return;
      setSummary(next, workspaceKey);
      setEnabled(next.enabled);
    } catch {
      // A rail that cannot load its counter still opens; the panel says why.
    }
  }, [api, setSummary, workspaceKey]);

  useEffect(() => {
    let active = true;
    setEnabled(false);
    if (!workspaceKey) return;
    setSummary(null, workspaceKey);
    void api
      .access()
      .then(async (access) => {
        if (!active || !access?.automations) return;
        setEnabled(true);
        const next = await api.summary().catch(() => null);
        if (active && next) setSummary(next, workspaceKey);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, setSummary, workspaceKey]);

  return { enabled, summary, refresh };
}

/** The open panel's cards and activity, loaded when it opens. */
export function usePanelData(open: boolean) {
  const api = useAutomationApi();
  const [panel, setPanel] = useState<AutomationPanel | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );
  const loaded = useRef(false);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setStatus(loaded.current ? 'ready' : 'loading');
      try {
        const next = await api.panel();
        setPanel(next);
        loaded.current = true;
        setStatus('ready');
      } catch {
        if (!loaded.current) setStatus('error');
      }
    },
    [api]
  );

  useEffect(() => {
    if (!open) return;
    void load();
    const timer = window.setInterval(() => void load(true), PANEL_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [open, load]);

  return { panel, status, reload: load, setPanel };
}
