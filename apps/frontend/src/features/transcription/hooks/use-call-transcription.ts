'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import {
  CallTranscriptionView,
  IN_FLIGHT_STATUSES,
  TranscriptionSource
} from '../types';

interface Options {
  /** Poll continuously (used during an active call for the Live Transcript). */
  live?: boolean;
  /** Poll interval in ms. Defaults to 1500ms — live enough for partials. */
  pollMs?: number;
  /** Fetch immediately on mount. Default true. */
  enabled?: boolean;
}

/**
 * Loads a call's transcription view and exposes the lifecycle actions
 * (start/stop realtime, transcribe from recording, retry). Polls while a
 * transcription is in flight (or always, when `live`).
 */
export function useCallTranscription(
  callId: string | null | undefined,
  options: Options = {}
) {
  const { live = false, pollMs = 1500, enabled = true } = options;
  const api = useApi();

  const [data, setData] = useState<CallTranscriptionView | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useCallback(async () => {
    if (!callId) return null;
    try {
      const view = await api.get<CallTranscriptionView>(
        `/transcription/calls/${callId}`
      );
      setData(view);
      return view;
    } catch {
      // Swallow — a missing/forbidden call simply yields no transcript view.
      return null;
    }
  }, [api, callId]);

  // Initial load.
  useEffect(() => {
    if (!callId || !enabled) {
      setData(null);
      return;
    }
    setLoading(true);
    void refetch().finally(() => setLoading(false));
  }, [callId, enabled, refetch]);

  // Polling: while live, or while any header is in flight.
  useEffect(() => {
    if (!callId || !enabled) return;

    const shouldPoll =
      live ||
      (data
        ? [data.realtime?.status, data.recording?.status].some(
            (s) => s && IN_FLIGHT_STATUSES.includes(s)
          ) || !!data.livePartial
        : false);

    if (!shouldPoll) return;

    timerRef.current = setTimeout(() => void refetch(), pollMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [callId, enabled, live, pollMs, data, refetch]);

  const runAction = useCallback(
    async (fn: () => Promise<unknown>) => {
      setActionPending(true);
      try {
        await fn();
        await refetch();
      } finally {
        setActionPending(false);
      }
    },
    [refetch]
  );

  const startRealtime = useCallback(
    () =>
      runAction(() =>
        api.post(`/transcription/calls/${callId}/realtime/start`)
      ),
    [api, callId, runAction]
  );

  const stopRealtime = useCallback(
    () =>
      runAction(() =>
        api.post(`/transcription/calls/${callId}/realtime/stop`)
      ),
    [api, callId, runAction]
  );

  const transcribeRecording = useCallback(
    () =>
      runAction(() => api.post(`/transcription/calls/${callId}/recording`)),
    [api, callId, runAction]
  );

  const retry = useCallback(
    (source: TranscriptionSource) =>
      runAction(() =>
        api.post(`/transcription/calls/${callId}/retry`, { source })
      ),
    [api, callId, runAction]
  );

  return {
    data,
    loading,
    actionPending,
    refetch,
    startRealtime,
    stopRealtime,
    transcribeRecording,
    retry
  };
}
