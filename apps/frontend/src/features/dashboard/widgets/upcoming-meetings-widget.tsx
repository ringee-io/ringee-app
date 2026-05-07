'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { WidgetShell } from '../components/widget-shell';
import { useWidgetData } from '../hooks/use-widget-data';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';

interface UpcomingMeeting {
  id: string;
  scheduledAt: string;
  status: string;
  duration: number;
  title: string | null;
  contact?: { firstName: string | null; lastName: string | null } | null;
  call?: { id: string; outcome: string | null } | null;
}

function fullName(
  p: { firstName: string | null; lastName: string | null } | null | undefined,
  fallback: string
) {
  if (!p) return fallback;
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || fallback;
}

function fmtMeeting(s: string) {
  const d = new Date(s);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

export function UpcomingMeetingsWidget({
  title,
  onRemove
}: {
  title: string;
  onRemove?: () => void;
}) {
  const t = useTranslations('dashboard.widgets.upcomingMeetings');
  const tContacts = useTranslations('contacts');
  const { data, loading, error } = useWidgetData<UpcomingMeeting[]>(
    '/dashboard/upcoming-meetings'
  );
  const empty = !data || data.length === 0;
  const contactFallback = (() => {
    try {
      return tContacts('contact' as never) as string;
    } catch {
      return 'Contact';
    }
  })();

  return (
    <WidgetShell
      title={title}
      loading={loading}
      error={error}
      empty={empty}
      emptyHint={t('emptyHint')}
      onRemove={onRemove}
      contentClassName='p-0'
    >
      <div className='divide-border divide-y'>
        {data?.map((meeting) => {
          const linked = meeting.call ? `· ${t('fromCall')}` : null;
          return (
            <div key={meeting.id} className='flex items-start justify-between gap-3 px-4 py-3'>
              <div className='min-w-0 flex-1'>
                <div className='flex items-center gap-2'>
                  <span className='truncate text-sm font-medium'>
                    {fullName(meeting.contact, contactFallback)}
                  </span>
                  <Badge variant='secondary' className='text-xs'>
                    {meeting.status}
                  </Badge>
                </div>
                <div className='text-muted-foreground mt-1 flex flex-wrap gap-x-3 text-xs'>
                  <span>{fmtMeeting(meeting.scheduledAt)}</span>
                  <span>· {meeting.duration}m</span>
                  {meeting.title && <span>· {meeting.title}</span>}
                  {linked && <span>{linked}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </WidgetShell>
  );
}
