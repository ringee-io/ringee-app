'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, PhoneOutgoing } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { describeApiError } from '../../lib/api-error';
import { useAutomationApi } from '../api';
import { formatWhen } from '../lib/format';
import type { UpcomingReminderCall } from '../types';

const SHOWN = 5;

/**
 * "See upcoming calls": the reminder calls planned next, each with "Call
 * now" — a confirmation call about that meeting placed immediately, through
 * the same checks a planned one gets.
 */
export function UpcomingCalls({ count }: { count: number }) {
  const t = useTranslations('aiVoiceAgents.automations.upcoming');
  const api = useAutomationApi();
  const locale = useLocale();
  const [rows, setRows] = useState<UpcomingReminderCall[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [calling, setCalling] = useState<string | null>(null);
  /** Meetings a call was just placed about: one call each, not one per click. */
  const [placed, setPlaced] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    void api
      .upcomingReminderCalls()
      .then((next) => active && setRows(next))
      .catch(() => {
        if (!active) return;
        setFailed(true);
        setRows([]);
      });
    return () => {
      active = false;
    };
  }, [api]);

  const callNow = async (row: UpcomingReminderCall) => {
    setCalling(row.meeting.id);
    try {
      const result = await api.confirmationCall(row.meeting.id);
      if (result.status === 'placed') {
        setPlaced((ids) => [...ids, row.meeting.id]);
        toast.success(
          t('calling', { name: row.meeting.contactName ?? t('theLead') })
        );
      } else {
        toast.warning(t('notPlaced', { reason: result.reason ?? '—' }));
      }
    } catch (failure) {
      toast.error(describeApiError(failure, t('callError')));
    } finally {
      setCalling(null);
    }
  };

  return (
    <div className='space-y-2'>
      <p className='font-medium'>{t('title', { count })}</p>
      {rows === null ? (
        <div className='space-y-1.5'>
          <Skeleton className='h-9 w-full rounded-md' />
          <Skeleton className='h-9 w-full rounded-md' />
        </div>
      ) : failed ? (
        <p className='text-muted-foreground'>{t('loadError')}</p>
      ) : rows.length === 0 ? (
        <p className='text-muted-foreground'>{t('empty')}</p>
      ) : (
        <ul className='divide-y rounded-lg border'>
          {rows.slice(0, SHOWN).map((row) => (
            <li key={row.id} className='flex items-center gap-2 px-2.5 py-2'>
              <div className='min-w-0 flex-1'>
                <p className='truncate font-medium'>
                  {row.meeting.contactName ??
                    row.meeting.contactPhone ??
                    t('theLead')}
                </p>
                <p className='text-muted-foreground'>
                  {t('line', {
                    call: formatWhen(row.fireAt, locale),
                    meeting: formatWhen(row.meeting.scheduledAt, locale)
                  })}
                </p>
              </div>
              <Button
                size='sm'
                variant='ghost'
                className='h-11 shrink-0 rounded-lg px-2 md:h-8'
                disabled={calling !== null || placed.includes(row.meeting.id)}
                onClick={() => void callNow(row)}
                aria-label={t('callNowFor', {
                  name: row.meeting.contactName ?? t('theLead')
                })}
              >
                {calling === row.meeting.id ? (
                  <Loader2 className='size-3.5 animate-spin' />
                ) : (
                  <PhoneOutgoing className='size-3.5' />
                )}
                {t('callNow')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
