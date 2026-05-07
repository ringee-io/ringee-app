'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { WidgetShell } from '../components/widget-shell';
import { useWidgetData } from '../hooks/use-widget-data';

interface HourBucket {
  hour: number;
  sales: number;
  meetings: number;
  interested: number;
  total: number;
}

type Metric = 'sales' | 'meetings' | 'interested';

const METRICS: Metric[] = ['sales', 'meetings', 'interested'];

function formatHour(hour: number) {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${h}${ampm}`;
}

export function BestTimeOfDayWidget({ title, onRemove }: { title: string; onRemove?: () => void }) {
  const t = useTranslations('dashboard.widgets.bestTime');
  const [metric, setMetric] = React.useState<Metric>('meetings');
  const { data, loading, error } = useWidgetData<HourBucket[]>('/dashboard/best-time-of-day');
  const max = Math.max(...((data ?? []).map((d) => d[metric])), 1);
  const empty = !!data && data.every((d) => d[metric] === 0);

  return (
    <WidgetShell
      title={title}
      loading={loading}
      error={error}
      empty={empty}
      emptyHint={t('emptyHint')}
      onRemove={onRemove}
    >
      <div className='flex h-full flex-col gap-3'>
        <div className='flex flex-wrap gap-1 text-xs'>
          {METRICS.map((m) => (
            <button
              key={m}
              type='button'
              onClick={() => setMetric(m)}
              className={[
                'rounded-full border px-3 py-1 transition',
                metric === m
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:bg-muted'
              ].join(' ')}
            >
              {t(`metrics.${m}`)}
            </button>
          ))}
        </div>
        <div className='grid flex-1 grid-cols-12 items-end gap-1'>
          {data?.map((b) => {
            const pct = (b[metric] / max) * 100;
            return (
              <div key={b.hour} className='flex flex-col items-center gap-1'>
                <div className='bg-muted relative h-full w-full overflow-hidden rounded'>
                  <div
                    className='bg-primary absolute right-0 bottom-0 left-0'
                    style={{ height: `${Math.max(pct, b[metric] > 0 ? 6 : 0)}%` }}
                    title={t('tooltip', { count: b[metric], hour: formatHour(b.hour) })}
                  />
                </div>
                <span className='text-muted-foreground text-[10px] tabular-nums'>
                  {b.hour % 3 === 0 ? formatHour(b.hour) : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </WidgetShell>
  );
}
