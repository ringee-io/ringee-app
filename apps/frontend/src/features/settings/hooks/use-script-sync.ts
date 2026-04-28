'use client';

import { useEffect, useRef } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useScriptStore, type ScriptSection } from '../store/script.store';

type ScriptApiResponse = {
  sections: ScriptSection[];
};

let hydrationPromise: Promise<void> | null = null;

const SAVE_DEBOUNCE_MS = 600;

/**
 * Hook responsible for hydrating the script from the backend (once per app
 * lifecycle) and persisting any local mutations with a debounced PUT.
 *
 * Pass `{ readOnly: true }` to skip the save side-effect (e.g. in-call view).
 */
export function useScriptSync(opts: { readOnly?: boolean } = {}) {
  const api = useApi();
  const status = useScriptStore((s) => s.status);
  const saving = useScriptStore((s) => s.saving);
  const revision = useScriptStore((s) => s.revision);
  const sections = useScriptStore((s) => s.sections);

  const setStatus = useScriptStore((s) => s.setStatus);
  const setSaving = useScriptStore((s) => s.setSaving);
  const hydrate = useScriptStore((s) => s.hydrate);

  const lastSavedRevision = useRef<number>(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate once globally
  useEffect(() => {
    if (status !== 'idle') return;

    setStatus('loading');
    if (!hydrationPromise) {
      hydrationPromise = api
        .get<ScriptApiResponse>('/call-scripts')
        .then((res) => {
          hydrate(res.sections ?? []);
          lastSavedRevision.current = useScriptStore.getState().revision;
        })
        .catch(() => {
          setStatus('error');
        })
        .finally(() => {
          hydrationPromise = null;
        });
    }
  }, [api, status, hydrate, setStatus]);

  // Debounced save on local mutations
  useEffect(() => {
    if (opts.readOnly) return;
    if (status !== 'ready') return;
    if (revision === lastSavedRevision.current) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const snapshotRevision = useScriptStore.getState().revision;
      const payload = useScriptStore
        .getState()
        .sections.map((s) => ({ title: s.title, body: s.body }));

      setSaving(true);
      try {
        const res = await api.put<ScriptApiResponse>('/call-scripts', {
          sections: payload
        });
        // Re-hydrate to receive server-assigned IDs, but only if no further
        // mutations happened during the request.
        if (useScriptStore.getState().revision === snapshotRevision) {
          hydrate(res.sections ?? []);
        }
        lastSavedRevision.current = useScriptStore.getState().revision;
      } catch {
        // Swallow — next mutation will retry.
      } finally {
        setSaving(false);
      }
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [revision, status, api, hydrate, setSaving, opts.readOnly]);

  return { sections, status, saving };
}
