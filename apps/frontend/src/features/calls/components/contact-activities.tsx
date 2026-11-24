'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  CalendarDays,
  Clock,
  History,
  PhoneIncoming,
  PhoneOutgoing,
  StickyNote
} from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useEnumLabels } from '@/features/call-detail/lib/labels';

interface ContactCall {
  id: string;
  direction?: string | null;
  durationSeconds?: number | null;
  outcome?: string | null;
  outcomeNote?: string | null;
  dispositionName?: string | null;
  createdAt: string;
}

interface ContactMeeting {
  id: string;
  title?: string | null;
  scheduledAt: string;
  duration: number;
  status: string;
}

/** The history already included in the authorized contact-detail response. */
export interface ContactActivityData {
  calls?: (ContactCall | null | undefined)[] | null;
  notes?:
    | (
        | {
            id?: string | null;
            content?: string | null;
            createdAt?: string | null;
          }
        | null
        | undefined
      )[]
    | null;
  meetings?: (ContactMeeting | null | undefined)[] | null;
}

type Activity =
  | { type: 'call'; date: string; call: ContactCall }
  | { type: 'meeting'; date: string; meeting: ContactMeeting };

export function ContactActivities({
  contactId,
  contact: suppliedContact
}: {
  contactId: string;
  contact?: ContactActivityData | null;
}) {
  const api = useApi();
  const locale = useLocale();
  const t = useTranslations('calls.contactContext');
  const labels = useEnumLabels();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    contactId: string;
    data: ContactActivityData | null;
    loading: boolean;
  }>({ contactId, data: null, loading: true });

  useEffect(() => {
    // The call workspace supplies its fetched contact: notes, history and links
    // share that response and never require a second contact lookup.
    if (suppliedContact !== undefined) return;
    let current = true;
    setResult({ contactId, data: null, loading: true });
    api
      .get<ContactActivityData>(`/contacts/${contactId}/activities`)
      .then((data) => {
        if (current) setResult({ contactId, data, loading: false });
      })
      .catch(() => {
        if (current) setResult({ contactId, data: null, loading: false });
      });
    return () => {
      current = false;
    };
  }, [api, contactId, revision, suppliedContact]);

  const loading =
    suppliedContact === undefined &&
    (result.contactId !== contactId || result.loading);
  const contact =
    suppliedContact !== undefined
      ? suppliedContact
      : result.contactId === contactId
        ? result.data
        : null;
  const formatDate = (value: string) => {
    const at = new Date(value);
    return Number.isNaN(at.getTime())
      ? ''
      : new Intl.DateTimeFormat(locale, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        }).format(at);
  };
  const formatDuration = (seconds: number | null | undefined) =>
    seconds == null
      ? '—'
      : `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;

  if (loading)
    return (
      <div aria-busy='true' className='space-y-3 border-t pt-4'>
        <Skeleton className='h-4 w-32' />
        <Skeleton className='h-20 w-full' />
        <Skeleton className='h-4 w-32' />
        <Skeleton className='h-20 w-full' />
      </div>
    );
  if (!contact)
    return (
      <div role='alert' className='space-y-2 border-t pt-4 text-sm'>
        <p>{t('loadFailed')}</p>
        {suppliedContact === undefined && (
          <Button
            type='button'
            variant='outline'
            className='h-11 cursor-pointer'
            onClick={() => setRevision((value) => value + 1)}
          >
            {t('retry')}
          </Button>
        )}
      </div>
    );

  const notes = (contact.notes ?? []).filter((note) => note?.content?.trim());
  const activities: Activity[] = [];
  for (const call of contact.calls ?? [])
    if (call) activities.push({ type: 'call', date: call.createdAt, call });
  for (const meeting of contact.meetings ?? [])
    if (meeting)
      activities.push({ type: 'meeting', date: meeting.scheduledAt, meeting });
  activities.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div className='space-y-5'>
      <section aria-label={t('notes')} className='space-y-3 border-t pt-4'>
        <h4 className='text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wide uppercase'>
          <StickyNote className='size-3.5' aria-hidden />
          {t('notes')}
        </h4>
        {notes.length ? (
          notes.map((note, index) => (
            <article
              key={note?.id ?? index}
              className='bg-background space-y-2 rounded-lg border p-3'
            >
              <p className='text-sm leading-relaxed break-words whitespace-pre-wrap'>
                {note?.content}
              </p>
              {note?.createdAt && (
                <time
                  dateTime={note.createdAt}
                  className='text-muted-foreground block text-xs'
                >
                  {formatDate(note.createdAt)}
                </time>
              )}
            </article>
          ))
        ) : (
          <p className='text-muted-foreground text-xs'>{t('noNotes')}</p>
        )}
      </section>
      <section aria-label={t('history')} className='space-y-3 border-t pt-4'>
        <h4 className='text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wide uppercase'>
          <History className='size-3.5' aria-hidden />
          {t('history')}
        </h4>
        {activities.length ? (
          <div className='space-y-4'>
            {activities.slice(0, 20).map((activity) => {
              const call = activity.type === 'call' ? activity.call : null;
              const meeting =
                activity.type === 'meeting' ? activity.meeting : null;
              const Icon = call
                ? call.direction === 'inbound'
                  ? PhoneIncoming
                  : PhoneOutgoing
                : CalendarDays;
              return (
                <article
                  key={`${activity.type}-${call?.id ?? meeting?.id}`}
                  className='min-w-0 space-y-2 border-l-2 pl-3'
                >
                  <div className='flex flex-wrap items-center justify-between gap-1 text-xs'>
                    <span className='flex items-center gap-1.5 font-medium'>
                      <Icon
                        className='text-muted-foreground size-3.5'
                        aria-hidden
                      />
                      {call
                        ? t(
                            call.direction === 'inbound'
                              ? 'incomingCall'
                              : 'outgoingCall'
                          )
                        : t('meeting')}
                    </span>
                    <span className='text-muted-foreground flex items-center gap-1 font-mono'>
                      <Clock className='size-3' aria-hidden />
                      {call
                        ? formatDuration(call.durationSeconds)
                        : t('minutes', { count: meeting!.duration })}
                    </span>
                  </div>
                  <time
                    dateTime={activity.date}
                    className='text-muted-foreground block text-xs'
                  >
                    {formatDate(activity.date)}
                  </time>
                  {call?.outcome && (
                    <p className='text-xs font-medium'>
                      {call.dispositionName || labels.outcome(call.outcome)}
                    </p>
                  )}
                  {call?.outcomeNote && (
                    <p className='text-muted-foreground text-xs leading-relaxed break-words whitespace-pre-wrap'>
                      {call.outcomeNote}
                    </p>
                  )}
                  {meeting?.title && (
                    <p className='text-xs leading-relaxed break-words'>
                      {meeting.title}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <p className='text-muted-foreground text-xs'>{t('noHistory')}</p>
        )}
      </section>
    </div>
  );
}
