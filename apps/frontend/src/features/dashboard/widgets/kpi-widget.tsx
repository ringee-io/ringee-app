'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { WidgetShell } from '../components/widget-shell';
import { useWidgetData } from '../hooks/use-widget-data';
import type { KpisData, WidgetType } from '../lib/types';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';

type KpiTranslator = (
  key: string,
  values?: Record<string, string | number>
) => string;

interface KpiSpec {
  /** Translation key under `dashboard.widgets.kpi.<key>` */
  key: string;
  /** Pull value from KPI response */
  value: (k: KpisData) => number;
  /** Optional secondary line — receives the t function so it can localize */
  hint?: (k: KpisData, t: KpiTranslator) => string;
  /** Format the value (e.g. percent vs count) */
  format?: (n: number) => string;
}

const KPI_SPECS: Partial<Record<WidgetType, KpiSpec>> = {
  kpi_total_calls: {
    key: 'totalCalls',
    value: (k) => k.totalCalls,
    hint: (k, t) => t('totalCalls.hint', { rate: k.answerRate.toFixed(1) })
  },
  kpi_answered_calls: {
    key: 'answeredCalls',
    value: (k) => k.answeredCalls,
    hint: (k, t) => t('answeredCalls.hint', { rate: k.answerRate.toFixed(1) })
  },
  kpi_meetings_booked: {
    key: 'meetingsBooked',
    value: (k) => k.meetingsBooked,
    hint: (k, t) =>
      k.meetingOutcomeNoEvent > 0
        ? t('meetingsBooked.hintExtra', { count: k.meetingOutcomeNoEvent })
        : t('meetingsBooked.hintFromScheduled')
  },
  kpi_sales: {
    key: 'sales',
    value: (k) => k.sales,
    hint: (k, t) => t('sales.hint', { rate: k.conversionRate.toFixed(1) })
  },
  kpi_interested: {
    key: 'interested',
    value: (k) => k.interested
  },
  kpi_follow_ups: {
    key: 'followUps',
    value: (k) => k.followUps
  },
  kpi_no_answer: {
    key: 'noAnswer',
    value: (k) => k.noAnswer
  },
  kpi_voicemail: {
    key: 'voicemail',
    value: (k) => k.voicemail
  },
  kpi_wrong_number: {
    key: 'wrongNumber',
    value: (k) => k.wrongNumber
  },
  kpi_conversion_rate: {
    key: 'conversionRate',
    value: (k) => k.conversionRate,
    format: (n) => `${n.toFixed(1)}%`,
    hint: (k, t) =>
      t('conversionRate.hint', { sales: k.sales, answered: k.answeredCalls })
  },
  kpi_meeting_rate: {
    key: 'meetingRate',
    value: (k) => k.meetingRate,
    format: (n) => `${n.toFixed(1)}%`,
    hint: (k, t) =>
      t('meetingRate.hint', {
        meetings: k.meetingsBooked,
        answered: k.answeredCalls
      })
  },
  kpi_positive_outcome_rate: {
    key: 'positiveOutcomeRate',
    value: (k) => k.positiveOutcomeRate,
    format: (n) => `${n.toFixed(1)}%`,
    hint: (_k, t) => t('positiveOutcomeRate.hint')
  }
};

export function KpiWidget({
  type,
  title,
  onRemove
}: {
  type: WidgetType;
  title: string;
  onRemove?: () => void;
}) {
  const t = useTranslations('dashboard.widgets.kpi');
  const tShell = useTranslations('dashboard.widgets.shell');
  const spec = KPI_SPECS[type];
  const { data, loading, error } = useWidgetData<KpisData>('/dashboard/kpis');

  if (!spec) {
    return (
      <WidgetShell title={title} onRemove={onRemove}>
        <div className='text-muted-foreground text-sm'>
          {tShell('unknownKpi', { type })}
        </div>
      </WidgetShell>
    );
  }

  const empty = !!data && spec.value(data) === 0;
  const value = data ? spec.value(data) : 0;
  const formatted = spec.format ? spec.format(value) : value.toLocaleString();
  const label = t(`${spec.key}.label`);
  const emptyHint = t(`${spec.key}.emptyHint`);

  return (
    <WidgetShell
      title={label || title}
      loading={loading}
      error={error}
      empty={empty}
      emptyHint={emptyHint}
      onRemove={onRemove}
      contentClassName='flex flex-col justify-center'
    >
      <div className='flex flex-col gap-1'>
        <span className='text-3xl font-semibold tabular-nums'>{formatted}</span>
        {spec.hint && data && (
          <Badge
            variant='secondary'
            className='text-muted-foreground w-fit text-xs'
          >
            {spec.hint(data, t as KpiTranslator)}
          </Badge>
        )}
      </div>
    </WidgetShell>
  );
}
