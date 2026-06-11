'use client';

import { useEffect, useRef } from 'react';
import { ScrollArea } from '@ringee/frontend-shared/components/ui/scroll-area';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import {
  Phone,
  CheckCircle2,
  Archive,
  RotateCcw,
  MoreVertical,
  Inbox as InboxIcon
} from 'lucide-react';
import { InboxThread } from '../types';
import {
  threadDisplayName,
  useThreadActions,
  useThreadEvents
} from '../hooks/use-inbox';
import { EventBubble } from './event-bubble';
import { Composer } from './composer';
import { useTranslations } from 'next-intl';

interface Props {
  thread: InboxThread | null;
  onChanged: () => void;
}

function dateHeader(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

export function ThreadTimeline({ thread, onChanged }: Props) {
  const t = useTranslations('inbox');
  const { events, loading, reload } = useThreadEvents(thread?.id ?? null);
  const actions = useThreadActions(() => {
    onChanged();
    reload();
  });
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Mark as read when opening / when new inbound events arrive.
  useEffect(() => {
    if (thread?.id && thread.unreadCount > 0) {
      actions.markRead(thread.id).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id]);

  // Auto-scroll to bottom on new events.
  useEffect(() => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [events.length, thread?.id]);

  if (!thread) {
    return (
      <div className='text-muted-foreground flex flex-1 items-center justify-center'>
        <div className='text-center'>
          <InboxIcon className='mx-auto mb-3 h-10 w-10' />
          <p className='text-sm'>{t('timeline.selectConversation')}</p>
        </div>
      </div>
    );
  }

  // Group consecutive events by day for visual headers.
  const groups: { day: string; events: typeof events }[] = [];
  for (const ev of events) {
    const day = dateHeader(ev.occurredAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.events.push(ev);
    else groups.push({ day, events: [ev] });
  }

  return (
    <div className='flex h-full flex-1 flex-col'>
      <div className='flex items-center justify-between border-b px-4 py-3'>
        <div className='min-w-0'>
          <h2 className='truncate text-sm font-semibold'>
            {threadDisplayName(thread)}
          </h2>
          <p className='text-muted-foreground truncate text-xs'>
            {thread.participantNumberE164 ?? thread.participantNumber}
            {thread.ringeeNumber
              ? ` · ${t('timeline.viaNumber', { number: thread.ringeeNumber })}`
              : ''}
          </p>
        </div>
        <div className='flex items-center gap-2'>
          {thread.contactId ? null : (
            <Button variant='outline' size='sm' disabled>
              {t('timeline.linkContact')}
            </Button>
          )}
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              const target =
                thread.participantNumberE164 ?? thread.participantNumber;
              window.dispatchEvent(
                new CustomEvent('ringee:dial', { detail: { number: target } })
              );
            }}
          >
            <Phone className='mr-1 h-4 w-4' />
            {t('timeline.call')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' size='icon'>
                <MoreVertical className='h-4 w-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              {thread.status !== 'resolved' && (
                <DropdownMenuItem onClick={() => actions.resolve(thread.id)}>
                  <CheckCircle2 className='mr-2 h-4 w-4' />{' '}
                  {t('timeline.markResolved')}
                </DropdownMenuItem>
              )}
              {thread.status !== 'archived' ? (
                <DropdownMenuItem onClick={() => actions.archive(thread.id)}>
                  <Archive className='mr-2 h-4 w-4' /> {t('timeline.archive')}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => actions.reopen(thread.id)}>
                  <RotateCcw className='mr-2 h-4 w-4' /> {t('timeline.reopen')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ScrollArea className='min-h-0 flex-1'>
        <div ref={scrollerRef} className='h-full'>
          <div className='space-y-3 p-4'>
            {loading && events.length === 0 ? (
              <p className='text-muted-foreground text-center text-xs'>
                {t('timeline.loading')}
              </p>
            ) : events.length === 0 ? (
              <p className='text-muted-foreground text-center text-xs'>
                {t('timeline.noActivity')}
              </p>
            ) : (
              groups.map((g) => (
                <div key={g.day} className='space-y-3'>
                  <div className='bg-muted text-muted-foreground mx-auto w-fit rounded-full px-3 py-0.5 text-[10px] tracking-wide uppercase'>
                    {g.day}
                  </div>
                  {g.events.map((ev) => (
                    <EventBubble key={ev.id} event={ev} />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      </ScrollArea>

      <Composer
        thread={thread}
        onAfterAction={() => {
          reload();
          onChanged();
        }}
      />
    </div>
  );
}
