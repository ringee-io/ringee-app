'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { WidgetShell } from '../components/widget-shell';
import { useWidgetData } from '../hooks/use-widget-data';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';

interface Person {
  firstName: string | null;
  lastName: string | null;
}

interface UpcomingMeeting {
  id: string;
  scheduledAt: string;
  status: string;
  duration: number;
  title: string | null;
  contact?: Person | null;
  call?: { id: string; outcome: string | null } | null;
}

interface UpcomingCallback {
  id: string;
  scheduledAt: string;
  status: string;
  note: string | null;
  contact?: Person | null;
  call?: { id: string; outcome: string | null } | null;
}

type UpcomingRow = {
  key: string;
  kind: 'meeting' | 'callback';
  scheduledAt: string;
  status: string;
  contact?: Person | null;
  fromCall: boolean;
  /** Meeting duration (minutes) — meetings only. */
  duration?: number;
  /** Meeting title or callback note. */
  detail?: string | null;
};

function fullName(p: Person | null | undefined, fallback: string) {
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
  const meetings = useWidgetData<UpcomingMeeting[]>(
    '/dashboard/upcoming-meetings'
  );
  const callbacks = useWidgetData<UpcomingCallback[]>(
    '/dashboard/upcoming-callbacks'
  );

  const loading = meetings.loading || callbacks.loading;
  // Surface an error only if both fail — a single failing source should still
  // render whatever the other source returned.
  const error = meetings.error && callbacks.error ? meetings.error : null;

  const rows = React.useMemo<UpcomingRow[]>(() => {
    const merged: UpcomingRow[] = [
      ...(meetings.data ?? []).map((m) => ({
        key: `m-${m.id}`,
        kind: 'meeting' as const,
        scheduledAt: m.scheduledAt,
        status: m.status,
        contact: m.contact,
        fromCall: !!m.call,
        duration: m.duration,
        detail: m.title
      })),
      ...(callbacks.data ?? []).map((c) => ({
        key: `c-${c.id}`,
        kind: 'callback' as const,
        scheduledAt: c.scheduledAt,
        status: c.status,
        contact: c.contact,
        fromCall: !!c.call,
        detail: c.note
      }))
    ];
    return merged.sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );
  }, [meetings.data, callbacks.data]);

  const empty = rows.length === 0;
  const contactFallback = t('contactFallback');

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
        {rows.map((row) => {
          const linked = row.fromCall ? `· ${t('fromCall')}` : null;
          const typeLabel =
            row.kind === 'callback' ? t('typeCallback') : t('typeMeeting');
          return (
            <div
              key={row.key}
              className='flex items-start justify-between gap-3 px-4 py-3'
            >
              <div className='min-w-0 flex-1'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='truncate text-sm font-medium'>
                    {fullName(row.contact, contactFallback)}
                  </span>
                  <Badge
                    variant='outline'
                    className={
                      row.kind === 'callback'
                        ? 'border-cyan-200 bg-cyan-50 text-xs text-cyan-700'
                        : 'border-blue-200 bg-blue-50 text-xs text-blue-700'
                    }
                  >
                    {typeLabel}
                  </Badge>
                  <Badge variant='secondary' className='text-xs'>
                    {row.status}
                  </Badge>
                </div>
                <div className='text-muted-foreground mt-1 flex flex-wrap gap-x-3 text-xs'>
                  <span>{fmtMeeting(row.scheduledAt)}</span>
                  {row.kind === 'meeting' && row.duration != null && (
                    <span>· {row.duration}m</span>
                  )}
                  {row.detail && <span>· {row.detail}</span>}
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
