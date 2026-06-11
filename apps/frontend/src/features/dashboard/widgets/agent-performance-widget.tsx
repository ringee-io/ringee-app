'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { WidgetShell } from '../components/widget-shell';
import { useWidgetData } from '../hooks/use-widget-data';

interface AgentRow {
  userId: string;
  name: string;
  totalCalls: number;
  answeredCalls: number;
  meetingsBooked: number;
  sales: number;
  interested: number;
  conversionRate: number;
  meetingRate: number;
}

export function AgentPerformanceWidget({
  title,
  onRemove
}: {
  title: string;
  onRemove?: () => void;
}) {
  const t = useTranslations('dashboard.widgets.agentPerformance');
  const { data, loading, error } = useWidgetData<AgentRow[]>(
    '/dashboard/agent-performance'
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
      contentClassName='p-0'
    >
      <div className='overflow-x-auto'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='border-border text-muted-foreground border-b text-left text-xs'>
              <th className='px-4 py-2 font-medium'>{t('headers.agent')}</th>
              <th className='px-3 py-2 text-right font-medium'>
                {t('headers.calls')}
              </th>
              <th className='px-3 py-2 text-right font-medium'>
                {t('headers.answered')}
              </th>
              <th className='px-3 py-2 text-right font-medium'>
                {t('headers.meetings')}
              </th>
              <th className='px-3 py-2 text-right font-medium'>
                {t('headers.sales')}
              </th>
              <th className='px-3 py-2 text-right font-medium'>
                {t('headers.interested')}
              </th>
              <th className='px-3 py-2 text-right font-medium'>
                {t('headers.conversion')}
              </th>
              <th className='px-3 py-2 text-right font-medium'>
                {t('headers.meetRate')}
              </th>
            </tr>
          </thead>
          <tbody>
            {data?.map((row) => (
              <tr
                key={row.userId}
                className='border-border border-b last:border-0'
              >
                <td className='px-4 py-2 font-medium'>{row.name}</td>
                <td className='px-3 py-2 text-right tabular-nums'>
                  {row.totalCalls}
                </td>
                <td className='px-3 py-2 text-right tabular-nums'>
                  {row.answeredCalls}
                </td>
                <td className='px-3 py-2 text-right tabular-nums'>
                  {row.meetingsBooked}
                </td>
                <td className='px-3 py-2 text-right tabular-nums'>
                  {row.sales}
                </td>
                <td className='px-3 py-2 text-right tabular-nums'>
                  {row.interested}
                </td>
                <td className='px-3 py-2 text-right tabular-nums'>
                  {row.conversionRate.toFixed(1)}%
                </td>
                <td className='px-3 py-2 text-right tabular-nums'>
                  {row.meetingRate.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WidgetShell>
  );
}
