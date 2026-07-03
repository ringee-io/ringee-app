'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { IconProps } from '@tabler/icons-react';
import type { ComponentType } from 'react';
import type { InfraUsageSeriesPoint } from '../../types';
import { EmptyHint, Panel, SectionHeader } from './usage-primitives';

/** "3/14"-style compact axis/tooltip label. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** Custom tooltip — module-styled, single value. */
function ChartTooltip({
  active,
  payload,
  label,
  format
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  format: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className='bg-card/95 rounded-lg border px-2.5 py-1.5 text-xs shadow-lg ring-1 ring-white/5 backdrop-blur'>
      <p className='text-muted-foreground mb-0.5 text-[10px]'>
        {label ? shortDate(label) : ''}
      </p>
      <p className='font-semibold tabular-nums'>{format(payload[0].value)}</p>
    </div>
  );
}

/**
 * A single-series area over time wrapped in a panel (primary hue, no legend —
 * the title names it). Shared by Performance (calls) and Cost & billing
 * (spend / minutes) so every trend reads with one visual voice.
 */
export function TimeArea({
  data,
  dataKey,
  gradientId,
  format,
  icon: Icon,
  title,
  subtitle,
  height = 176
}: {
  data: InfraUsageSeriesPoint[];
  dataKey: 'spend' | 'minutes' | 'calls';
  gradientId: string;
  format: (v: number) => string;
  icon: ComponentType<IconProps>;
  title: string;
  subtitle?: string;
  height?: number;
}) {
  const hasData = data.some((d) => d[dataKey] > 0);
  return (
    <Panel>
      <SectionHeader title={title} subtitle={subtitle} icon={Icon} />
      {hasData ? (
        <div className='w-full' style={{ height }}>
          <ResponsiveContainer width='100%' height='100%'>
            <AreaChart
              data={data}
              margin={{ top: 4, right: 8, bottom: 0, left: -12 }}
            >
              <defs>
                <linearGradient id={gradientId} x1='0' y1='0' x2='0' y2='1'>
                  <stop
                    offset='0%'
                    stopColor='var(--primary)'
                    stopOpacity={0.32}
                  />
                  <stop
                    offset='100%'
                    stopColor='var(--primary)'
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke='var(--border)'
                strokeOpacity={0.4}
                vertical={false}
              />
              <XAxis
                dataKey='date'
                tickFormatter={shortDate}
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                width={44}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ stroke: 'var(--primary)', strokeOpacity: 0.4 }}
                content={<ChartTooltip format={format} />}
              />
              <Area
                type='monotone'
                dataKey={dataKey}
                stroke='var(--primary)'
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 3.5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyHint>No activity in this range.</EmptyHint>
      )}
    </Panel>
  );
}
