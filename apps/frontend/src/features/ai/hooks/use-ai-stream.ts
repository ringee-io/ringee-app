'use client';

import { useEffect, useRef } from 'react';
import type { StreamMessage } from '../types';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

const EVENT_TYPES = [
  'message_started',
  'text_delta',
  'message_completed',
  'tool_started',
  'tool_completed',
  'tool_event',
  'confirmation_request',
  'confirmation_resolved',
  'error',
  'completed',
  'heartbeat'
];

/**
 * Subscribes to the Ringee AI SSE channel for a conversation and invokes
 * `onEvent` for every server-pushed event. The connection survives the
 * lifetime of the component; it is recreated whenever conversationId changes.
 */
export function useAiStream(
  conversationId: string | null,
  onEvent: (msg: StreamMessage) => void
): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!conversationId) return;
    const url = `${API_URL}/ai/conversations/${conversationId}/stream`;
    const es = new EventSource(url);

    const handle = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        onEventRef.current(data);
      } catch {
        // Ignore malformed payloads.
      }
    };

    for (const type of EVENT_TYPES) {
      es.addEventListener(type, handle as EventListener);
    }
    es.onmessage = handle;
    es.onerror = () => {
      // EventSource handles reconnection automatically; we just log.
      // The orchestrator emits `error` events for app-level failures.
    };

    return () => {
      es.close();
    };
  }, [conversationId]);
}
