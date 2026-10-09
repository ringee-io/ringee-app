'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { ApiError } from '@ringee/frontend-shared/lib/api';
import type { MyDayList, MyDayListNext } from '../types/my-day';

const STORAGE_PREFIX = 'ringee:call-list';

/**
 * The list "Call next" goes through once nothing in today's queue is due: the
 * one the user picked — remembered per workspace, in this browser — the
 * lists they may pick from, and who is next in it. Which lists those are and
 * who comes next is the server's to say: only the lists assigned to the user.
 */
export function useCallList() {
  const api = useApi();
  const t = useTranslations('calls.myDay.list');
  const { isLoaded, userId, orgId } = useAuth();
  const storageKey =
    isLoaded && userId
      ? `${STORAGE_PREFIX}:${userId}:${orgId ?? 'personal'}`
      : null;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lists, setLists] = useState<MyDayList[] | null>(null);
  const [listsFailed, setListsFailed] = useState(false);
  const [next, setNext] = useState<MyDayListNext | null>(null);
  const [nextFailed, setNextFailed] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const nextRequest = useRef(0);

  useEffect(() => {
    if (!storageKey) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(storageKey);
    } catch {
      saved = null;
    }
    setSelectedId(saved);
  }, [storageKey]);

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      setNextFailed(false);
      if (!storageKey) return;
      try {
        if (id) localStorage.setItem(storageKey, id);
        else localStorage.removeItem(storageKey);
      } catch {
        // Storage unavailable: the pick lasts as long as the page.
      }
    },
    [storageKey]
  );

  const refreshLists = useCallback(async () => {
    try {
      const res = await api.get<{ data: MyDayList[] }>('/my-day/lists');
      setLists(res?.data ?? []);
      setListsFailed(false);
    } catch {
      setListsFailed(true);
    }
  }, [api]);

  useEffect(() => {
    void refreshLists();
  }, [refreshLists]);

  /** A list taken away — reassigned or deleted — is no longer the user's. */
  const dropList = useCallback(() => {
    select(null);
    toast.info(t('gone'));
    void refreshLists();
  }, [refreshLists, select, t]);

  const refreshNext = useCallback(async () => {
    const request = ++nextRequest.current;
    if (!selectedId) {
      setNext(null);
      return;
    }
    try {
      const res = await api.get<MyDayListNext>(
        `/my-day/lists/${encodeURIComponent(selectedId)}/next`
      );
      if (request !== nextRequest.current) return;
      setNext(res);
      setNextFailed(false);
    } catch (error) {
      if (request !== nextRequest.current) return;
      if (
        error instanceof ApiError &&
        (error.status === 404 || error.status === 400)
      ) {
        dropList();
        return;
      }
      setNextFailed(true);
    }
  }, [api, dropList, selectedId]);

  useEffect(() => {
    void refreshNext();
    const onVisible = () => {
      if (!document.hidden) void refreshNext();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshNext]);

  /** Sends the contact to the back of the list; the answer is who is next. */
  const skip = useCallback(
    async (entryId: string) => {
      if (!selectedId || skipping) return;
      setSkipping(true);
      const request = ++nextRequest.current;
      try {
        const res = await api.post<MyDayListNext>(
          `/my-day/lists/${encodeURIComponent(selectedId)}/entries/${encodeURIComponent(entryId)}/skip`
        );
        if (request === nextRequest.current) {
          setNext(res);
          setNextFailed(false);
        } else {
          // A read that started during the skip may predate it: read again.
          void refreshNext();
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) dropList();
        else toast.error(t('skipFailed'));
      } finally {
        setSkipping(false);
      }
    },
    [api, dropList, refreshNext, selectedId, skipping, t]
  );

  const current = next && next.list.id === selectedId ? next : null;
  const selected =
    current?.list ?? lists?.find((list) => list.id === selectedId) ?? null;

  return {
    lists: lists ?? [],
    listsLoading: lists === null && !listsFailed,
    listsFailed: listsFailed && lists === null,
    refreshLists,
    selectedId,
    /** The picked list, once it is known. */
    selected,
    select,
    /** Who is next in the picked list. */
    next: current,
    nextLoading: !!selectedId && !current && !nextFailed,
    nextFailed: !!selectedId && !current && nextFailed,
    refreshNext,
    skip,
    skipping
  };
}
