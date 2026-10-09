'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ExternalLink, Loader2, MoreHorizontal, Phone, X } from 'lucide-react';
import {
  Avatar,
  AvatarFallback
} from '@ringee/frontend-shared/components/ui/avatar';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { getInitials } from '../../lib/initials';
import type { MyDayQueueItem } from '../../types/my-day';
import { callbackNote, ReasonChips } from './reason-chips';
import { useMyDayFormat } from './use-my-day-format';

/** Who the person is, the way every My day surface names them. */
export function useQueueItemName() {
  const t = useTranslations('calls.myDay.queue');
  const fmt = useMyDayFormat();
  return (item: MyDayQueueItem) =>
    item.contact.name?.trim() ||
    (item.contact.id
      ? fmt.phone(item.contact.phoneNumber)
      : t('unknownCaller'));
}

/** Where the number is from, and the time there when it is known. */
export function QueueItemPlace({
  item,
  now
}: {
  item: MyDayQueueItem;
  now: Date;
}) {
  const t = useTranslations('calls.myDay.queue');
  const fmt = useMyDayFormat();
  const country = fmt.country(item.contact.country);
  const localTime = fmt.localTime(item.contact.timezone, now);
  if (!country && !localTime) return null;
  return (
    <span>
      {[country, localTime ? t('localTime', { time: localTime }) : null]
        .filter(Boolean)
        .join(' · ')}
    </span>
  );
}

interface QueueRowProps {
  item: MyDayQueueItem;
  now: Date;
  isNext: boolean;
  dialing: boolean;
  /** A call is live or starting: offer no second one. */
  busy: boolean;
  onCall: (item: MyDayQueueItem) => void;
  onCancelCallback: (callbackId: string) => void;
}

export function QueueRow({
  item,
  now,
  isNext,
  dialing,
  busy,
  onCall,
  onCancelCallback
}: QueueRowProps) {
  const t = useTranslations('calls.myDay.queue');
  const fmt = useMyDayFormat();
  const nameOf = useQueueItemName();
  const name = nameOf(item);
  const note = callbackNote(item.reasons);
  const returnsACall = item.reasons.every(
    (reason) => reason.kind === 'missed_call'
  );
  const callLabel = returnsACall ? t('callBack') : t('call');
  const callbacks = item.reasons.flatMap((reason) =>
    reason.kind === 'callback' ? [reason.callbackId] : []
  );

  return (
    <li
      className={cn(
        'flex min-h-14 items-center gap-3 border-t px-4 py-2.5 sm:px-5',
        isNext && 'bg-emerald-50/60 dark:bg-emerald-500/[0.06]'
      )}
    >
      <Avatar className='size-9 shrink-0'>
        <AvatarFallback className='text-xs font-semibold'>
          {getInitials(item.contact.name, item.contact.phoneNumber)}
        </AvatarFallback>
      </Avatar>

      <div className='min-w-0 flex-1 space-y-1'>
        <div className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5'>
          {item.contact.id ? (
            <Link
              href={`/dashboard/contact/${item.contact.id}`}
              target='_blank'
              className='truncate font-semibold hover:underline'
            >
              {name}
            </Link>
          ) : (
            <span className='truncate font-semibold'>{name}</span>
          )}
          {item.contact.company ? (
            <span className='text-muted-foreground truncate text-[13px]'>
              {item.contact.company}
            </span>
          ) : null}
          {isNext ? (
            <span className='inline-flex h-5 items-center rounded-full bg-emerald-100 px-2 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'>
              {t('nextBadge')}
            </span>
          ) : null}
          {item.doNotCall ? (
            <span className='inline-flex h-5 items-center rounded-full bg-red-100 px-2 text-[11px] font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300'>
              {t('doNotCall')}
            </span>
          ) : null}
        </div>
        <div className='text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px]'>
          <ReasonChips reasons={item.reasons} now={now} />
          {note ? (
            <span className='max-w-[18rem] truncate italic'>“{note}”</span>
          ) : null}
          <span className='font-mono tabular-nums'>
            {fmt.phone(item.contact.phoneNumber)}
          </span>
          <QueueItemPlace item={item} now={now} />
        </div>
      </div>

      <Button
        variant='outline'
        className='h-9 shrink-0 gap-2 px-3 sm:px-3.5'
        disabled={busy}
        onClick={() => onCall(item)}
        aria-label={`${callLabel} ${name}`}
      >
        {dialing ? <Loader2 className='animate-spin' /> : <Phone />}
        <span className='hidden sm:inline'>{callLabel}</span>
      </Button>

      {item.contact.id || callbacks.length > 0 ? (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              size='icon'
              className='text-muted-foreground size-9 shrink-0'
              aria-label={t('more', { name })}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            {item.contact.id ? (
              <DropdownMenuItem asChild>
                <Link
                  href={`/dashboard/contact/${item.contact.id}`}
                  target='_blank'
                >
                  <ExternalLink />
                  {t('viewContact')}
                </Link>
              </DropdownMenuItem>
            ) : null}
            {callbacks.map((callbackId) => (
              <DropdownMenuItem
                key={callbackId}
                variant='destructive'
                onClick={() => onCancelCallback(callbackId)}
              >
                <X />
                {t('cancelCallback')}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className='size-9 shrink-0' aria-hidden />
      )}
    </li>
  );
}
