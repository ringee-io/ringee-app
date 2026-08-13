'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { CalendarCheck, Clock, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface MeetingPreview {
  id: string;
  scheduledAt: string;
  duration: number;
  contact: {
    name?: string;
    phoneNumber: string;
  };
}

export function MeetingsThisWeek() {
  const api = useApi();
  const t = useTranslations('meetings.thisWeek');
  const [data, setData] = useState<{
    count: number;
    meetings: MeetingPreview[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ count: number; meetings: MeetingPreview[] }>('/meetings/this-week')
      .then(setData)
      .catch(() => setData({ count: 0, meetings: [] }))
      .finally(() => setIsLoading(false));
  }, [api]);

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-sm font-medium'>{t('title')}</CardTitle>
        <CalendarCheck className='text-muted-foreground h-4 w-4' />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className='space-y-3'>
            <Skeleton className='h-8 w-16' />
            <div className='space-y-2'>
              <Skeleton className='h-10 w-full' />
              <Skeleton className='h-10 w-full' />
            </div>
          </div>
        ) : !data || data.count === 0 ? (
          <div className='py-3'>
            <p className='text-3xl font-bold tabular-nums'>0</p>
            <p className='text-muted-foreground mt-1 text-xs'>{t('empty')}</p>
          </div>
        ) : (
          <>
            <p className='text-3xl font-bold tabular-nums'>{data.count}</p>
            <div className='mt-3 space-y-1'>
              {data.meetings.map((m) => (
                <div
                  key={m.id}
                  className='hover:bg-muted/40 flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors'
                >
                  <span className='h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500' />
                  <span className='min-w-0 flex-1 truncate'>
                    {m.contact.name || m.contact.phoneNumber}
                  </span>
                  <span className='text-muted-foreground flex shrink-0 items-center gap-1 text-xs'>
                    <Clock className='h-3 w-3' />
                    {format(new Date(m.scheduledAt), 'EEE h:mm a')}
                  </span>
                </div>
              ))}
            </div>
            {data.count > 3 && (
              <Link
                href='/dashboard/meetings'
                className='mt-3 flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700'
              >
                {t('viewAll', { count: data.count })}
                <ArrowRight className='h-3 w-3' />
              </Link>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
