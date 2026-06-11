'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { WidgetShell } from '../components/widget-shell';
import { useWidgetData } from '../hooks/use-widget-data';

interface OutcomeRow {
  outcome: string;
  count: number;
}

const KNOWN_OUTCOMES = new Set([
  'meeting_booked',
  'sale',
  'interested',
  'follow_up',
  'callback_scheduled',
  'not_interested',
  'no_answer',
  'voicemail',
  'wrong_number',
  'gatekeeper'
]);

const COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  '#94a3b8',
  '#a78bfa',
  '#f472b6',
  '#fb923c'
];

export function CallsByOutcomeWidget({
  title,
  onRemove
}: {
  title: string;
  onRemove?: () => void;
}) {
  const t = useTranslations('dashboard.widgets.byOutcome');
  const tOutcomes = useTranslations('dashboard.outcomes');
  const localizeOutcome = (outcome: string) =>
    KNOWN_OUTCOMES.has(outcome) ? tOutcomes(outcome as never) : outcome;
  const { data, loading, error } = useWidgetData<OutcomeRow[]>(
    '/dashboard/calls-by-outcome'
  );
  const empty = !data || data.length === 0;

  return (
    <WidgetShell
      title={title}
      loading={loading}
      error={error}
      empty={empty}
      emptyHint={t('emptyHint')}
      onRemove={onRemove}
    >
      <div className='flex h-full flex-col gap-2'>
        <div className='flex-1'>
          <ResponsiveContainer width='100%' height='100%'>
            <PieChart>
              <Tooltip
                formatter={(v: number, _n, p) => [
                  v,
                  localizeOutcome(p.payload.outcome)
                ]}
                contentStyle={{
                  background: 'var(--popover)',
                  border: '1px solid var(--border)'
                }}
              />
              <Pie
                data={data ?? []}
                dataKey='count'
                nameKey='outcome'
                innerRadius='55%'
                outerRadius='85%'
                paddingAngle={1}
              >
                {data?.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className='grid grid-cols-1 gap-1 text-xs'>
          {data?.slice(0, 6).map((row, i) => (
            <div
              key={row.outcome}
              className='flex items-center justify-between gap-2'
            >
              <span className='flex items-center gap-2 truncate'>
                <span
                  className='inline-block h-2 w-2 rounded-full'
                  style={{ background: COLORS[i % COLORS.length] }}
                />
                <span className='truncate'>{localizeOutcome(row.outcome)}</span>
              </span>
              <span className='text-muted-foreground tabular-nums'>
                {row.count}
              </span>
            </div>
          ))}
        </div>
      </div>
    </WidgetShell>
  );
}
