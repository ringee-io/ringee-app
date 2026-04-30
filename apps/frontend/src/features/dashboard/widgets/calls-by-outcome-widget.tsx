'use client';

import * as React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { WidgetShell } from '../components/widget-shell';
import { useWidgetData } from '../hooks/use-widget-data';

interface OutcomeRow {
  outcome: string;
  count: number;
}

const OUTCOME_LABELS: Record<string, string> = {
  meeting_booked: 'Meeting Booked',
  sale: 'Sale',
  interested: 'Interested',
  follow_up: 'Follow-up',
  not_interested: 'Not Interested',
  no_answer: 'No Answer',
  voicemail: 'Voicemail',
  wrong_number: 'Wrong Number',
  gatekeeper: 'Gatekeeper'
};

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

export function CallsByOutcomeWidget({ title, onRemove }: { title: string; onRemove?: () => void }) {
  const { data, loading, error } = useWidgetData<OutcomeRow[]>('/dashboard/calls-by-outcome');
  const empty = !data || data.length === 0;

  return (
    <WidgetShell
      title={title}
      loading={loading}
      error={error}
      empty={empty}
      emptyHint='Pick an outcome on each call (Sale, Interested, Voicemail, etc.) to see how your dispositions break down.'
      onRemove={onRemove}
    >
      <div className='flex h-full flex-col gap-2'>
        <div className='flex-1'>
          <ResponsiveContainer width='100%' height='100%'>
            <PieChart>
              <Tooltip
                formatter={(v: number, _n, p) => [
                  v,
                  OUTCOME_LABELS[p.payload.outcome] ?? p.payload.outcome
                ]}
                contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)' }}
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
            <div key={row.outcome} className='flex items-center justify-between gap-2'>
              <span className='flex items-center gap-2 truncate'>
                <span
                  className='inline-block h-2 w-2 rounded-full'
                  style={{ background: COLORS[i % COLORS.length] }}
                />
                <span className='truncate'>
                  {OUTCOME_LABELS[row.outcome] ?? row.outcome}
                </span>
              </span>
              <span className='text-muted-foreground tabular-nums'>{row.count}</span>
            </div>
          ))}
        </div>
      </div>
    </WidgetShell>
  );
}
