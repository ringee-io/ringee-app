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
import {
  IconCoin,
  IconPhone,
  IconSpeakerphone,
  IconChartArea
} from '@tabler/icons-react';
import type { InfraUsage, InfraUsageSeriesPoint } from '../../types';
import {
  EmptyHint,
  MiniBarRow,
  Panel,
  SectionHeader,
  formatMinutes,
  formatMoney
} from './usage-primitives';

function shortDate(iso: string): string {
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

/** A single-series area over time (primary hue, no legend — the title names it). */
function TimeArea({
  data,
  dataKey,
  gradientId,
  format,
  icon: Icon,
  title
}: {
  data: InfraUsageSeriesPoint[];
  dataKey: 'spend' | 'minutes';
  gradientId: string;
  format: (v: number) => string;
  icon: typeof IconChartArea;
  title: string;
}) {
  const hasData = data.some((d) => d[dataKey] > 0);
  return (
    <Panel>
      <SectionHeader title={title} icon={Icon} />
      {hasData ? (
        <div className='h-44 w-full'>
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

export function UsageCost({ usage }: { usage: InfraUsage }) {
  const { cost, currency } = usage;
  const maxNumberSpend = Math.max(1, ...cost.spendByNumber.map((r) => r.cost));
  const maxCampaignSpend = Math.max(
    1,
    ...cost.spendByCampaign.map((r) => r.cost)
  );

  return (
    <section>
      <SectionHeader
        title='Cost & billing'
        subtitle='Where your spend and minutes are going'
        icon={IconCoin}
      />

      <div className='grid gap-3 lg:grid-cols-2'>
        <TimeArea
          data={cost.series}
          dataKey='spend'
          gradientId='infra-spend-grad'
          format={(v) => formatMoney(v, currency)}
          icon={IconChartArea}
          title='Spend over time'
        />
        <TimeArea
          data={cost.series}
          dataKey='minutes'
          gradientId='infra-minutes-grad'
          format={(v) => formatMinutes(v)}
          icon={IconChartArea}
          title='Minutes over time'
        />

        <Panel>
          <SectionHeader title='Spend by number' icon={IconPhone} />
          {cost.spendByNumber.length ? (
            <div className='space-y-0.5'>
              {cost.spendByNumber.slice(0, 8).map((r) => (
                <MiniBarRow
                  key={r.id}
                  name={r.name}
                  value={r.cost}
                  valueLabel={formatMoney(r.cost, currency)}
                  max={maxNumberSpend}
                  icon={IconPhone}
                  barClass='bg-emerald-500'
                />
              ))}
            </div>
          ) : (
            <EmptyHint>No number spend yet.</EmptyHint>
          )}
        </Panel>

        <Panel>
          <SectionHeader title='Spend by campaign' icon={IconSpeakerphone} />
          {cost.spendByCampaign.length ? (
            <div className='space-y-0.5'>
              {cost.spendByCampaign.slice(0, 8).map((r) => (
                <MiniBarRow
                  key={r.id}
                  name={r.name}
                  value={r.cost}
                  valueLabel={formatMoney(r.cost, currency)}
                  max={maxCampaignSpend}
                  icon={IconSpeakerphone}
                  barClass='bg-amber-500'
                />
              ))}
            </div>
          ) : (
            <EmptyHint>No campaign spend yet.</EmptyHint>
          )}
        </Panel>
      </div>
    </section>
  );
}
