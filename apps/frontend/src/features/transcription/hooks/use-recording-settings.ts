'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { RecordingSettings } from '../types';

const DEFAULTS: RecordingSettings = {
  recordAllCalls: false,
  transcribeRealtime: false,
  transcribeRecordings: false
};

/**
 * Reads and updates the Call Recording & Transcription settings for the active
 * context (personal or organization — resolved server-side). Updates are
 * optimistic; on failure (e.g. a non-admin editing org settings) the previous
 * value is restored and the error surfaces to the caller.
 */
export function useRecordingSettings() {
  const api = useApi();
  const [settings, setSettings] = useState<RecordingSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<RecordingSettings>('/call-recording-settings')
      .then((res) => {
        if (!cancelled && res) setSettings(res);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [api]);

  const update = useCallback(
    async (patch: Partial<RecordingSettings>) => {
      const previous = settings;
      const next = { ...settings, ...patch };
      setSettings(next); // optimistic
      setSaving(true);
      try {
        const saved = await api.put<RecordingSettings>(
          '/call-recording-settings',
          patch
        );
        if (saved) setSettings(saved);
        return saved;
      } catch (err) {
        setSettings(previous); // rollback
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [api, settings]
  );

  return { settings, loading, saving, update };
}
