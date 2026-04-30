'use client';

import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { WidgetShell } from '../components/widget-shell';
import { useWidgetData } from '../hooks/use-widget-data';

interface OutcomesPoint {
  bucket: string;
  sales: number;
  meetingsBooked: number;
  interested: number;
  followUps: number;
  noAnswer: number;
}

interface OutcomesResponse {
  granularity: 'day' | 'week' | 'month';
  data: OutcomesPoint[];
}

const SERIES = [
  { key: 'sales', label: 'Sales', color: 'var(--chart-1)' },
  { key: 'meetingsBooked', label: 'Meetings', color: 'var(--chart-2)' },
  { key: 'interested', label: 'Interested', color: 'var(--chart-3)' },
  { key: 'followUps', label: 'Follow-ups', color: 'var(--chart-4)' },
  { key: 'noAnswer', label: 'No Answer', color: 'var(--chart-5)' }
] as const;

function formatBucket(s: string, granularity: 'day' | 'week' | 'month') {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  if (granularity === 'month') {
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function OutcomesOverTimeWidget({
  title,
  onRemove
}: {
  title: string;
  onRemove?: () => void;
}) {
  const { data, loading, error } = useWidgetData<OutcomesResponse>(
    '/dashboard/outcomes-over-time'
  );
  const points = data?.data ?? [];
  const empty = points.length === 0;

  return (
    <WidgetShell
      title={title}
      loading={loading}
      error={error}
      empty={empty}
      emptyHint='Log outcomes on your calls to see how sales, meetings, and interested leads trend over time.'
      onRemove={onRemove}
      contentClassName='pb-4'
    >
      <ResponsiveContainer width='100%' height='100%'>
        <BarChart data={points} margin={{ left: 0, right: 8, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray='3 3' vertical={false} />
          <XAxis
            dataKey='bucket'
            tickFormatter={(v) => formatBucket(v, data?.granularity ?? 'day')}
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis fontSize={11} tickLine={false} axisLine={false} width={28} />
          <Tooltip
            labelFormatter={(v) => formatBucket(v as string, data?.granularity ?? 'day')}
            contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)' }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {SERIES.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId='outcomes'
              name={s.label}
              fill={s.color}
              radius={[2, 2, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </WidgetShell>
  );
}
