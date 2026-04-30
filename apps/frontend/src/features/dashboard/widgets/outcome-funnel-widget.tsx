'use client';

import * as React from 'react';
import { WidgetShell } from '../components/widget-shell';
import { useWidgetData } from '../hooks/use-widget-data';

interface FunnelStep {
  label: string;
  value: number;
}

export function OutcomeFunnelWidget({ title, onRemove }: { title: string; onRemove?: () => void }) {
  const { data, loading, error } = useWidgetData<FunnelStep[]>('/dashboard/outcome-funnel');
  const max = Math.max(...(data?.map((d) => d.value) ?? [0]), 1);
  const empty = !!data && data.every((d) => d.value === 0);

  return (
    <WidgetShell
      title={title}
      loading={loading}
      error={error}
      empty={empty}
      emptyHint='Once you log call outcomes, the funnel from total calls to sales will populate here.'
      onRemove={onRemove}
    >
      <div className='flex h-full flex-col justify-center gap-2'>
        {data?.map((step, i) => {
          const pct = (step.value / max) * 100;
          const prev = i > 0 ? data[i - 1].value : null;
          const conversion =
            prev && prev > 0 ? `${((step.value / prev) * 100).toFixed(0)}%` : null;
          return (
            <div key={step.label} className='flex flex-col gap-1'>
              <div className='flex items-baseline justify-between text-xs'>
                <span className='font-medium'>{step.label}</span>
                <span className='tabular-nums'>
                  {step.value.toLocaleString()}
                  {conversion && (
                    <span className='text-muted-foreground ml-2'>{conversion}</span>
                  )}
                </span>
              </div>
              <div className='bg-muted h-3 w-full overflow-hidden rounded'>
                <div
                  className='bg-primary h-full rounded'
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </WidgetShell>
  );
}
