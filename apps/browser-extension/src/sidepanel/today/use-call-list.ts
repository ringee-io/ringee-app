import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  type CallList,
  type CallListNext,
  type RingeeApi,
} from "../../lib/ringee-api";
import type { AppData } from "../navigation";
import { useLiveRefresh } from "./use-live-refresh";

const STORAGE_PREFIX = "ringee:call-list";

function readPick(key: string | null): string | null {
  if (!key) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * The list "Call next" goes through once nothing in today's queue is due: the
 * one the user picked — remembered per workspace, in this panel — the lists
 * they may pick from, and who is next in it. Which lists those are and who
 * comes next is the server's to say: only the lists assigned to the user.
 */
export function useCallList(
  api: RingeeApi,
  /** `<userId>:<orgId | personal>`; null until the session is known. */
  workspaceKey: string | null,
  notify: AppData["notify"],
) {
  const storageKey = workspaceKey ? `${STORAGE_PREFIX}:${workspaceKey}` : null;
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    readPick(storageKey),
  );
  const [lists, setLists] = useState<CallList[] | null>(null);
  const [listsFailed, setListsFailed] = useState(false);
  const [next, setNext] = useState<CallListNext | null>(null);
  const [nextFailed, setNextFailed] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const nextRequest = useRef(0);

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      setNextFailed(false);
      if (!storageKey) return;
      try {
        if (id) localStorage.setItem(storageKey, id);
        else localStorage.removeItem(storageKey);
      } catch {
        // Storage unavailable: the pick lasts as long as the panel.
      }
    },
    [storageKey],
  );

  const refreshLists = useCallback(async () => {
    try {
      const res = await api.listCallLists();
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
    notify("error", "That list is no longer assigned to you.");
    void refreshLists();
  }, [notify, refreshLists, select]);

  const refreshNext = useCallback(async () => {
    const request = ++nextRequest.current;
    if (!selectedId) {
      setNext(null);
      return;
    }
    try {
      const res = await api.getListNext(selectedId);
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

  useLiveRefresh(refreshNext);

  /** Sends the contact to the back of the list; the answer is who is next. */
  const skip = useCallback(
    async (entryId: string) => {
      if (!selectedId || skipping) return;
      setSkipping(true);
      const request = ++nextRequest.current;
      try {
        const res = await api.skipListEntry(selectedId, entryId);
        if (request === nextRequest.current) {
          setNext(res);
          setNextFailed(false);
        } else {
          // A read that started during the skip may predate it: read again.
          void refreshNext();
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) dropList();
        else notify("error", "The contact couldn't be skipped. Try again.");
      } finally {
        setSkipping(false);
      }
    },
    [api, dropList, notify, refreshNext, selectedId, skipping],
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
    skipping,
  };
}
