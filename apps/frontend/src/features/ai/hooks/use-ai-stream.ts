'use client';

import { useEffect, useRef } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type { StreamMessage } from '../types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

/** How long to wait before reopening a stream that dropped. */
const RECONNECT_DELAY_MS = 3000;

const EVENT_TYPES = [
  'message_started',
  'text_delta',
  'message_completed',
  'tool_started',
  'tool_completed',
  'tool_event',
  'confirmation_request',
  'confirmation_resolved',
  'usage',
  'error',
  'completed',
  'heartbeat'
];

/**
 * Subscribes to the Ringee AI SSE channel for a conversation and invokes
 * `onEvent` for every server-pushed event. The connection survives the
 * lifetime of the component; it is recreated whenever conversationId changes.
 *
 * EventSource cannot send an Authorization header, so every (re)connection
 * first asks the API for a short-lived stream ticket and opens the stream
 * with it.
 */
export function useAiStream(
  conversationId: string | null,
  onEvent: (msg: StreamMessage) => void
): void {
  const api = useApi();
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const handle = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        onEventRef.current(data);
      } catch {
        // Ignore malformed payloads.
      }
    };

    const reconnect = () => {
      if (!cancelled)
        retry = setTimeout(() => void connect(), RECONNECT_DELAY_MS);
    };

    const connect = async () => {
      let ticket: string;
      try {
        ({ ticket } = await api.post<{ ticket: string }>(
          `/ai/conversations/${conversationId}/stream-ticket`,
          {}
        ));
      } catch {
        // No access (or the API is unreachable): try again later rather than
        // opening a stream the server would refuse.
        reconnect();
        return;
      }
      if (cancelled) return;
      const url = `${API_URL}/ai/conversations/${conversationId}/stream?ticket=${encodeURIComponent(ticket)}`;
      es = new EventSource(url);
      for (const type of EVENT_TYPES) {
        es.addEventListener(type, handle as EventListener);
      }
      es.onmessage = handle;
      es.onerror = () => {
        // A ticket is good for a minute, so the browser's own retry would
        // soon be refused: reopen with a fresh ticket instead. The
        // orchestrator emits `error` events for app-level failures.
        es?.close();
        es = null;
        reconnect();
      };
    };

    void connect();

    return () => {
      cancelled = true;
      clearTimeout(retry);
      es?.close();
    };
  }, [api, conversationId]);
}
