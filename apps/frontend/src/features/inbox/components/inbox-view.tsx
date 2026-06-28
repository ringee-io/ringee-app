'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { ThreadList } from './thread-list';
import { ThreadTimeline } from './thread-timeline';
import { ContactContextPane } from './contact-context-pane';
import { InboxThread } from '../types';

export function InboxView() {
  const api = useApi();
  const [selected, setSelected] = useState<InboxThread | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const bumpReload = useCallback(() => setReloadKey((n) => n + 1), []);

  // Re-pull a single thread snapshot after actions to keep the header
  // (unreadCount, status) fresh. The list and timeline poll on their own.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    api
      .get<InboxThread>(`/inbox/threads/${selected.id}`)
      .then((next) => {
        if (cancelled || !next) return;
        setSelected((curr) =>
          curr && curr.id === next.id ? { ...curr, ...next } : curr
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  return (
    <div className='bg-background flex h-full w-full overflow-hidden border-y'>
      <ThreadList
        selectedThreadId={selected?.id ?? null}
        onSelect={(t) => {
          // Optimistically clear unread on the visible thread.
          setSelected({ ...t, unreadCount: 0 });
        }}
      />
      <ThreadTimeline thread={selected} onChanged={bumpReload} />
      {selected && (
        <ContactContextPane thread={selected} onChanged={bumpReload} />
      )}
    </div>
  );
}
