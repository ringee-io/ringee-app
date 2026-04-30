'use client';

import * as React from 'react';
import { WidgetShell } from '../components/widget-shell';
import { useWidgetData } from '../hooks/use-widget-data';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';

interface RecentCall {
  id: string;
  outcome: string;
  toNumber: string;
  fromNumber: string;
  durationSeconds: number | null;
  startedAt: string | null;
  contact?: { firstName: string | null; lastName: string | null } | null;
  user?: { firstName: string | null; lastName: string | null } | null;
}

const OUTCOME_VARIANT: Record<
  string,
  { label: string; className: string }
> = {
  sale: { label: 'Sale', className: 'bg-emerald-100 text-emerald-700' },
  meeting_booked: { label: 'Meeting Booked', className: 'bg-blue-100 text-blue-700' },
  interested: { label: 'Interested', className: 'bg-amber-100 text-amber-700' },
  follow_up: { label: 'Follow-up', className: 'bg-violet-100 text-violet-700' }
};

function fullName(p?: { firstName: string | null; lastName: string | null } | null) {
  if (!p) return '';
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
}

function fmtDate(s: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function fmtDuration(seconds: number | null) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export function RecentHighValueWidget({
  title,
  onRemove
}: {
  title: string;
  onRemove?: () => void;
}) {
  const { data, loading, error } = useWidgetData<RecentCall[]>('/dashboard/recent-high-value');
  const empty = !data || data.length === 0;

  return (
    <WidgetShell
      title={title}
      loading={loading}
      error={error}
      empty={empty}
      emptyHint='Calls marked as Sale, Meeting Booked, Interested, or Follow-up will show up here so you know what to follow up on.'
      onRemove={onRemove}
      contentClassName='p-0'
    >
      <div className='divide-border divide-y'>
        {data?.map((call) => {
          const variant = OUTCOME_VARIANT[call.outcome] ?? {
            label: call.outcome,
            className: 'bg-muted text-foreground'
          };
          const contact = fullName(call.contact) || call.toNumber;
          const agent = fullName(call.user);
          return (
            <div key={call.id} className='flex items-start justify-between gap-3 px-4 py-3'>
              <div className='min-w-0 flex-1'>
                <div className='flex items-center gap-2'>
                  <span className='truncate text-sm font-medium'>{contact}</span>
                  <Badge className={variant.className}>{variant.label}</Badge>
                </div>
                <div className='text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs'>
                  <span>{call.toNumber}</span>
                  {agent && <span>· {agent}</span>}
                  <span>· {fmtDate(call.startedAt)}</span>
                  <span>· {fmtDuration(call.durationSeconds)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </WidgetShell>
  );
}
