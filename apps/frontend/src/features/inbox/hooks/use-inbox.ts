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
const COUNTS_POLL_MS = 30000;

const PAGE_SIZE = 25;

export function useThreads(filterId: string, search: string) {
  const api = useApi();
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  // How many pages are currently materialised — the poll/refresh re-pulls them
  // all in one request so the visible list stays fresh without losing scroll.
  const pagesRef = useRef(1);
  const filter = THREAD_FILTER_OPTIONS.find((f) => f.id === filterId);

  const buildParams = useCallback(
    (limit: number, page: number) => {
      const params = new URLSearchParams();
      if (filter?.status)
        filter.status.forEach((s) => params.append('status', s));
      if (filter?.kind) filter.kind.forEach((k) => params.append('kind', k));
      if (filter?.unreadOnly) params.set('unreadOnly', 'true');
      if (filter?.mine) params.set('mine', 'true');
      if (filter?.unassigned) params.set('assignedToId', 'null');
      if (search) params.set('search', search);
      params.set('limit', String(limit));
      params.set('page', String(page));
      return params.toString();
    },
    [filter, search]
  );

  // Re-pull every loaded page in a single request (initial load, polling, and
  // after actions). Replaces the list so updates/new threads surface in place.
  const refresh = useCallback(async () => {
    try {
      const res = await api.get<ListThreadsResponse>(
        `/inbox/threads?${buildParams(PAGE_SIZE * pagesRef.current, 1)}`
      );
      setThreads(res.data ?? []);
      setTotal(res.meta?.total ?? 0);
    } catch {
      // handled by global error handling
    } finally {
      setLoading(false);
    }
  }, [api, buildParams]);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const nextPage = pagesRef.current + 1;
    try {
      const res = await api.get<ListThreadsResponse>(
        `/inbox/threads?${buildParams(PAGE_SIZE, nextPage)}`
      );
      const more = res.data ?? [];
      setThreads((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...more.filter((t) => !seen.has(t.id))];
      });
      setTotal(res.meta?.total ?? 0);
      pagesRef.current = nextPage;
    } catch {
      // handled
    } finally {
      setLoadingMore(false);
    }
  }, [api, buildParams, loadingMore]);

  // Reset to the first page whenever the filter or search changes.
  useEffect(() => {
    pagesRef.current = 1;
    setLoading(true);
    setThreads([]);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterId, search]);

  // Poll, paused while the tab is hidden; refresh on regaining visibility.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden) refresh();
    }, THREAD_POLL_MS);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  return {
    threads,
    loading,
    loadingMore,
    hasMore: threads.length < total,
    reload: refresh,
    loadMore
  };
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
    const id = window.setInterval(() => {
      if (!document.hidden) load(false);
    }, EVENTS_POLL_MS);
    const onVisible = () => {
      if (!document.hidden) load(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
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
    },
    linkContact: async (threadId: string, contactId: string | null) => {
      await api.post(`/inbox/threads/${threadId}/link-contact`, { contactId });
      onChange();
    },
    assign: async (threadId: string, assigneeId: string | null) => {
      await api.post(`/inbox/threads/${threadId}/assign`, { assigneeId });
      onChange();
    }
  };
}

/** Total unread threads, polled (paused while the tab is hidden). */
export function useUnreadCount() {
  const api = useApi();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    const load = () => {
      if (document.hidden) return;
      api
        .get<{ count: number }>('/inbox/unread-count')
        .then((r) => active && setCount(r?.count ?? 0))
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, COUNTS_POLL_MS);
    const onVisible = () => !document.hidden && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [api]);

  return count;
}

export interface InboxCounts {
  all: number;
  unread: number;
  missed: number;
  voicemails: number;
  sms: number;
}

/** Per-filter counts for the filter pills. `reloadKey` forces a refetch. */
export function useInboxCounts(reloadKey = 0) {
  const api = useApi();
  const [counts, setCounts] = useState<InboxCounts | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      if (document.hidden) return;
      api
        .get<InboxCounts>('/inbox/counts')
        .then((r) => active && setCounts(r ?? null))
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, COUNTS_POLL_MS);
    const onVisible = () => !document.hidden && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [api, reloadKey]);

  return counts;
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

export interface ThreadActivity {
  contactId: string | null;
  calls: {
    id: string;
    direction: string | null;
    status: string;
    outcome: string | null;
    outcomeNote: string | null;
    durationSeconds: number | null;
    createdAt: string;
  }[];
  notes: {
    id: string;
    content: string;
    userId: string;
    createdAt: string;
  }[];
  meetings: {
    id: string;
    title: string | null;
    scheduledAt: string;
    notes: string | null;
    status: string;
  }[];
  callbacks: {
    id: string;
    scheduledAt: string;
    note: string | null;
    status: string;
    completedAt: string | null;
  }[];
}

/**
 * Full contact context for a thread: calls (with outcomes + notes), contact
 * notes, meetings and callbacks. `refreshKey` forces a refetch after the user
 * schedules a callback/meeting or links a contact from the context pane.
 */
export function useThreadActivity(threadId: string | null, refreshKey = 0) {
  const api = useApi();
  const [activity, setActivity] = useState<ThreadActivity | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!threadId) {
      setActivity(null);
      return;
    }
    let active = true;
    setLoading(true);
    api
      .get<ThreadActivity>(`/inbox/threads/${threadId}/activity`)
      .then((r) => active && setActivity(r ?? null))
      .catch(() => active && setActivity(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [api, threadId, refreshKey]);

  return { activity, loading };
}

export function threadDisplayName(t: InboxThread): string {
  if (t.contact) {
    const c = t.contact;
    return (
      (c.fullName ||
        [c.firstName, c.lastName].filter(Boolean).join(' ') ||
        c.name ||
        c.phoneNumber ||
        t.participantNumber) ??
      t.participantNumber
    );
  }
  return t.participantNumberE164 ?? t.participantNumber;
}

export function statusLabel(s: InboxThreadStatus) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function eventKindLabel(k: InboxEventKind) {
  return k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
