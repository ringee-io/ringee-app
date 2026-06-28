'use client';

import { useRef, useState } from 'react';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  Phone,
  PhoneMissed,
  Voicemail,
  MessageSquare,
  Mic,
  StickyNote,
  CalendarClock,
  Inbox as InboxIcon,
  Search,
  Check,
  Loader2
} from 'lucide-react';
import { InboxEventKind, InboxThread, THREAD_FILTER_OPTIONS } from '../types';
import {
  threadDisplayName,
  useThreads,
  useInboxCounts,
  useThreadActions
} from '../hooks/use-inbox';
import { NewConversationDialog } from './new-conversation-dialog';
import { useTranslations } from 'next-intl';

function kindIcon(kind: InboxEventKind | null) {
  switch (kind) {
    case 'missed_call':
      return <PhoneMissed className='h-4 w-4 text-red-500' />;
    case 'call_completed':
    case 'call_answered':
    case 'call_started':
      return <Phone className='h-4 w-4 text-emerald-500' />;
    case 'voicemail_received':
      return <Voicemail className='h-4 w-4 text-amber-500' />;
    case 'voicemail_drop_sent':
      return <Mic className='h-4 w-4 text-violet-500' />;
    case 'sms_received':
    case 'sms_sent':
    case 'mms_received':
    case 'mms_sent':
      return <MessageSquare className='h-4 w-4 text-blue-500' />;
    case 'note_added':
      return <StickyNote className='h-4 w-4 text-yellow-600' />;
    case 'callback_scheduled':
    case 'callback_completed':
    case 'meeting_booked':
      return <CalendarClock className='h-4 w-4 text-cyan-500' />;
    default:
      return <InboxIcon className='text-muted-foreground h-4 w-4' />;
  }
}

function relativeTime(iso: string) {
  const date = new Date(iso);
  const diffSec = (Date.now() - date.getTime()) / 1000;
  if (diffSec < 60) return `${Math.max(1, Math.floor(diffSec))}s`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  return date.toLocaleDateString();
}

interface Props {
  selectedThreadId: string | null;
  onSelect: (thread: InboxThread) => void;
}

export function ThreadList({ selectedThreadId, onSelect }: Props) {
  const t = useTranslations('inbox');
  const [filterId, setFilterId] = useState('all');
  const [search, setSearch] = useState('');
  const [backfilling, setBackfilling] = useState(false);
  const api = useApi();
  const { threads, loading, loadingMore, hasMore, reload, loadMore } =
    useThreads(filterId, search);
  const counts = useInboxCounts();
  const actions = useThreadActions(reload);
  const scrollRef = useRef<HTMLDivElement>(null);

  function onScroll() {
    const el = scrollRef.current;
    if (!el || loadingMore || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      loadMore();
    }
  }

  async function runBackfill() {
    setBackfilling(true);
    try {
      await api.post<{
        threadsTouched: number;
        eventsCreated: number;
        processed: number;
      }>('/inbox/backfill/calls', { limit: 200 });
      await reload();
    } catch {
      // surfaced by global error handling
    } finally {
      setBackfilling(false);
    }
  }

  return (
    <div className='flex h-full w-80 min-w-0 flex-col border-r'>
      <div className='space-y-3 border-b p-3'>
        <NewConversationDialog onCreated={onSelect} />
        <div className='relative'>
          <Search className='text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4' />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('threadList.searchPlaceholder')}
            className='pl-9'
          />
        </div>
        <div className='flex flex-wrap gap-1.5'>
          {THREAD_FILTER_OPTIONS.map((f) => {
            const count = f.countKey ? counts?.[f.countKey] : undefined;
            return (
              <button
                key={f.id}
                onClick={() => setFilterId(f.id)}
                className={cn(
                  'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors',
                  filterId === f.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70'
                )}
              >
                {t(f.labelKey as never)}
                {count !== undefined && count > 0 && (
                  <span
                    className={cn(
                      'rounded-full px-1 text-[10px]',
                      filterId === f.id
                        ? 'bg-primary-foreground/20'
                        : 'bg-background/70'
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className='min-h-0 flex-1 overflow-y-auto'
      >
        {loading && threads.length === 0 ? (
          <div className='space-y-2 p-3'>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className='h-16 w-full' />
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className='text-muted-foreground flex flex-col items-center px-6 py-12 text-center'>
            <InboxIcon className='mb-3 h-10 w-10' />
            <p className='text-sm'>{t('threadList.noConversations')}</p>
            <p className='mt-1 text-xs'>{t('threadList.newWillAppear')}</p>
            <button
              disabled={backfilling}
              onClick={runBackfill}
              className='mt-4 text-xs text-emerald-600 underline-offset-2 hover:underline disabled:opacity-60'
            >
              {backfilling
                ? t('threadList.importing')
                : t('threadList.importFromPastCalls')}
            </button>
          </div>
        ) : (
          <>
            <ul className='divide-y'>
              {threads.map((thread) => {
                const selected = thread.id === selectedThreadId;
                return (
                  <li key={thread.id} className='group relative'>
                    <button
                      onClick={() => onSelect(thread)}
                      className={cn(
                        'hover:bg-muted/50 w-full px-3 py-3 text-left transition-colors',
                        selected && 'bg-muted',
                        thread.unreadCount > 0 && 'bg-primary/[0.04]'
                      )}
                    >
                      <div className='flex items-start gap-2'>
                        <div className='mt-0.5'>
                          {kindIcon(thread.lastEventKind)}
                        </div>
                        <div className='min-w-0 flex-1'>
                          <div className='flex items-baseline justify-between gap-2'>
                            <span
                              className={cn(
                                'truncate text-sm',
                                thread.unreadCount > 0
                                  ? 'font-semibold'
                                  : 'font-medium'
                              )}
                            >
                              {threadDisplayName(thread)}
                            </span>
                            <span className='text-muted-foreground shrink-0 text-[11px]'>
                              {relativeTime(thread.lastEventAt)}
                            </span>
                          </div>
                          <div className='mt-0.5 flex items-center gap-2'>
                            <p className='text-muted-foreground truncate text-xs'>
                              {thread.lastPreview ?? '—'}
                            </p>
                            {thread.unreadCount > 0 && (
                              <Badge
                                variant='default'
                                className='ml-auto h-5 min-w-5 justify-center px-1.5 text-[10px]'
                              >
                                {thread.unreadCount}
                              </Badge>
                            )}
                          </div>
                          {thread.status !== 'open' && (
                            <Badge
                              variant='outline'
                              className='mt-1 text-[10px] uppercase'
                            >
                              {thread.status}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                    {thread.unreadCount > 0 && (
                      <button
                        type='button'
                        title={t('threadList.markRead')}
                        onClick={(e) => {
                          e.stopPropagation();
                          actions.markRead(thread.id);
                        }}
                        className='bg-background absolute top-1/2 right-2 hidden -translate-y-1/2 items-center justify-center rounded-full border p-1.5 shadow-sm group-hover:flex'
                      >
                        <Check className='h-3.5 w-3.5' />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {loadingMore && (
              <div className='text-muted-foreground flex items-center justify-center gap-2 py-4 text-xs'>
                <Loader2 className='h-3.5 w-3.5 animate-spin' />
                {t('threadList.loadingMore')}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
