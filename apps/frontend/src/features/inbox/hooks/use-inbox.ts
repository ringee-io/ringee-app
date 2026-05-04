'use client';

import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  InboxEvent,
  InboxThread,
  InboxEventKind,
  InboxThreadStatus,
  THREAD_FILTER_OPTIONS
} from '../types';

interface ListThreadsResponse {
  data: InboxThread[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

interface ListEventsResponse {
  data: InboxEvent[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const THREAD_POLL_MS = 7000;
const EVENTS_POLL_MS = 4000;

export function useThreads(filterId: string, search: string) {
  const api = useApi();
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [loading, setLoading] = useState(true);
  const filter = THREAD_FILTER_OPTIONS.find((f) => f.id === filterId);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter?.status) {
      filter.status.forEach((s) => params.append('status', s));
    }
    if (filter?.kind) {
      filter.kind.forEach((k) => params.append('kind', k));
    }
    if (filter?.unreadOnly) params.set('unreadOnly', 'true');
    if (search) params.set('search', search);
    params.set('limit', '50');

    try {
      const res = await api.get<ListThreadsResponse>(
        `/inbox/threads?${params.toString()}`
      );
      setThreads(res.data ?? []);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }, [api, filter, search]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, THREAD_POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  return { threads, loading, reload: load };
}

export function useThreadEvents(threadId: string | null) {
  const api = useApi();
  const [events, setEvents] = useState<InboxEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const lastIdRef = useRef<string | null>(null);

  const load = useCallback(
    async (force = false) => {
      if (!threadId) {
        setEvents([]);
        return;
      }
      if (force) setLoading(true);
      try {
        const res = await api.get<ListEventsResponse>(
          `/inbox/threads/${threadId}/events?limit=200`
        );
        const next = res.data ?? [];
        const lastId = next.at(-1)?.id ?? null;
        // Only update state when something changed to avoid scroll jumps.
        if (lastId !== lastIdRef.current || next.length !== events.length) {
          lastIdRef.current = lastId;
          setEvents(next);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, threadId]
  );

  useEffect(() => {
    lastIdRef.current = null;
    load(true);
    if (!threadId) return;
    const id = window.setInterval(() => load(false), EVENTS_POLL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  return { events, loading, reload: () => load(true) };
}

export function useThreadActions(onChange: () => void) {
  const api = useApi();

  return {
    sendSms: async (input: {
      fromNumber: string;
      toNumber: string;
      text?: string;
      mediaUrls?: string[];
      threadId?: string;
      contactId?: string;
    }) => {
      await api.post('/inbox/messages', input);
      onChange();
    },
    addNote: async (threadId: string, note: string) => {
      await api.post(`/inbox/threads/${threadId}/notes`, { note });
      onChange();
    },
    markRead: async (threadId: string) => {
      await api.post(`/inbox/threads/${threadId}/read`);
      onChange();
    },
    resolve: async (threadId: string) => {
      await api.post(`/inbox/threads/${threadId}/resolve`);
      onChange();
    },
    archive: async (threadId: string) => {
      await api.post(`/inbox/threads/${threadId}/archive`);
      onChange();
    },
    reopen: async (threadId: string) => {
      await api.post(`/inbox/threads/${threadId}/reopen`);
      onChange();
    }
  };
}

export function useNumbers() {
  const api = useApi();
  const [numbers, setNumbers] = useState<
    {
      id: string;
      phoneNumber: string;
      smsEnabled: boolean;
      mmsEnabled: boolean;
    }[]
  >([]);

  useEffect(() => {
    api
      .get<any[]>('/telephony/phone-numbers')
      .then((data) => setNumbers(data ?? []))
      .catch(() => setNumbers([]));
  }, [api]);

  return numbers;
}

export function threadDisplayName(t: InboxThread): string {
  if (t.contact) {
    const c = t.contact;
    return (
      (c.fullName ||
        [c.firstName, c.lastName].filter(Boolean).join(' ') ||
        c.name ||
        c.phoneNumber ||
        t.participantNumber) ?? t.participantNumber
    );
  }
  return t.participantNumberE164 ?? t.participantNumber;
}

export function statusLabel(s: InboxThreadStatus) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function eventKindLabel(k: InboxEventKind) {
  return k
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
