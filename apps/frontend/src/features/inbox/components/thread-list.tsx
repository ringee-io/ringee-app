'use client';

import { useState } from 'react';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { ScrollArea } from '@ringee/frontend-shared/components/ui/scroll-area';
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
  Search
} from 'lucide-react';
import { InboxEventKind, InboxThread, THREAD_FILTER_OPTIONS } from '../types';
import { threadDisplayName, useThreads } from '../hooks/use-inbox';
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
      return <InboxIcon className='h-4 w-4 text-muted-foreground' />;
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
  const { threads, loading, reload } = useThreads(filterId, search);

  async function runBackfill() {
    setBackfilling(true);
    try {
      await api.post<{ threadsTouched: number; eventsCreated: number; processed: number }>(
        '/inbox/backfill/calls',
        { limit: 200 }
      );
      await reload();
    } catch {
      // surfaced by global error handling
    } finally {
      setBackfilling(false);
    }
  }

  return (
    <div className='flex h-full w-80 flex-col border-r'>
      <div className='border-b p-3 space-y-3'>
        <div className='relative'>
          <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('threadList.searchPlaceholder')}
            className='pl-9'
          />
        </div>
        <div className='flex flex-wrap gap-1.5'>
          {THREAD_FILTER_OPTIONS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilterId(f.id)}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs transition-colors',
                filterId === f.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
              )}
            >
              {t(f.labelKey as any)}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className='flex-1'>
        {loading && threads.length === 0 ? (
          <div className='space-y-2 p-3'>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className='h-16 w-full' />
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className='flex flex-col items-center px-6 py-12 text-center text-muted-foreground'>
            <InboxIcon className='mb-3 h-10 w-10' />
            <p className='text-sm'>{t('threadList.noConversations')}</p>
            <p className='mt-1 text-xs'>{t('threadList.newWillAppear')}</p>
            <Button
              variant='outline'
              size='sm'
              className='mt-4'
              disabled={backfilling}
              onClick={runBackfill}
            >
              {backfilling
                ? t('threadList.importing')
                : t('threadList.importFromPastCalls')}
            </Button>
          </div>
        ) : (
          <ul className='divide-y'>
            {threads.map((t) => {
              const selected = t.id === selectedThreadId;
              return (
                <li key={t.id}>
                  <button
                    onClick={() => onSelect(t)}
                    className={cn(
                      'w-full px-3 py-3 text-left transition-colors hover:bg-muted/50',
                      selected && 'bg-muted'
                    )}
                  >
                    <div className='flex items-start gap-2'>
                      <div className='mt-0.5'>{kindIcon(t.lastEventKind)}</div>
                      <div className='min-w-0 flex-1'>
                        <div className='flex items-baseline justify-between gap-2'>
                          <span className='truncate text-sm font-medium'>
                            {threadDisplayName(t)}
                          </span>
                          <span className='shrink-0 text-[11px] text-muted-foreground'>
                            {relativeTime(t.lastEventAt)}
                          </span>
                        </div>
                        <div className='mt-0.5 flex items-center gap-2'>
                          <p className='truncate text-xs text-muted-foreground'>
                            {t.lastPreview ?? '—'}
                          </p>
                          {t.unreadCount > 0 && (
                            <Badge
                              variant='default'
                              className='ml-auto h-5 min-w-5 justify-center px-1.5 text-[10px]'
                            >
                              {t.unreadCount}
                            </Badge>
                          )}
                        </div>
                        {t.status !== 'open' && (
                          <Badge
                            variant='outline'
                            className='mt-1 text-[10px] uppercase'
                          >
                            {t.status}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
