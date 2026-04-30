'use client';

import * as React from 'react';
import { WidgetShell } from '../components/widget-shell';
import { useWidgetData } from '../hooks/use-widget-data';
import type { KpisData, WidgetType } from '../lib/types';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';

interface KpiSpec {
  /** Display label */
  label: string;
  /** Pull value from KPI response */
  value: (k: KpisData) => number;
  /** Optional secondary line */
  hint?: (k: KpisData) => string;
  /** Format the value (e.g. percent vs count) */
  format?: (n: number) => string;
  /** Hint shown when there's no data yet */
  emptyHint: string;
}

const KPI_SPECS: Partial<Record<WidgetType, KpiSpec>> = {
  kpi_total_calls: {
    label: 'Total Calls',
    value: (k) => k.totalCalls,
    hint: (k) => `${k.answerRate.toFixed(1)}% answered`,
    emptyHint: 'Calls placed in this period will appear here.'
  },
  kpi_answered_calls: {
    label: 'Answered Calls',
    value: (k) => k.answeredCalls,
    hint: (k) => `${k.answerRate.toFixed(1)}% answer rate`,
    emptyHint: 'Calls connected to a person will appear here.'
  },
  kpi_meetings_booked: {
    label: 'Meetings Booked',
    value: (k) => k.meetingsBooked,
    hint: (k) =>
      k.meetingOutcomeNoEvent > 0
        ? `+${k.meetingOutcomeNoEvent} marked without calendar event`
        : 'From scheduled Meeting records',
    emptyHint:
      'Booked meetings will appear here after a call is marked as meeting booked or scheduled through Google/Microsoft Calendar.'
  },
  kpi_sales: {
    label: 'Sales Made',
    value: (k) => k.sales,
    hint: (k) => `${k.conversionRate.toFixed(1)}% conversion rate`,
    emptyHint: 'Calls marked with outcome "Sale" will appear here.'
  },
  kpi_interested: {
    label: 'Interested Leads',
    value: (k) => k.interested,
    emptyHint: 'Calls marked "Interested" will appear here.'
  },
  kpi_follow_ups: {
    label: 'Follow-ups',
    value: (k) => k.followUps,
    emptyHint: 'Calls marked "Follow-up" will appear here.'
  },
  kpi_no_answer: {
    label: 'No Answer',
    value: (k) => k.noAnswer,
    emptyHint: 'Calls with no answer will appear here.'
  },
  kpi_voicemail: {
    label: 'Voicemail',
    value: (k) => k.voicemail,
    emptyHint: 'Calls that hit voicemail will appear here.'
  },
  kpi_wrong_number: {
    label: 'Wrong Number',
    value: (k) => k.wrongNumber,
    emptyHint: 'Calls flagged "Wrong Number" will appear here.'
  },
  kpi_conversion_rate: {
    label: 'Conversion Rate',
    value: (k) => k.conversionRate,
    format: (n) => `${n.toFixed(1)}%`,
    hint: (k) => `${k.sales} sales / ${k.answeredCalls} answered`,
    emptyHint:
      'Conversion rate = sales ÷ answered calls. Mark calls as "Sale" to populate.'
  },
  kpi_meeting_rate: {
    label: 'Meeting Rate',
    value: (k) => k.meetingRate,
    format: (n) => `${n.toFixed(1)}%`,
    hint: (k) => `${k.meetingsBooked} meetings / ${k.answeredCalls} answered`,
    emptyHint:
      'Meeting rate = meetings booked ÷ answered calls. Book a meeting from a call to populate.'
  },
  kpi_positive_outcome_rate: {
    label: 'Positive Outcome Rate',
    value: (k) => k.positiveOutcomeRate,
    format: (n) => `${n.toFixed(1)}%`,
    hint: (k) => `(Sales + Meetings + Interested) / Answered`,
    emptyHint:
      'Counts sales, meetings booked, and interested leads as a share of answered calls.'
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
  const spec = KPI_SPECS[type];
  const { data, loading, error } = useWidgetData<KpisData>('/dashboard/kpis');

  if (!spec) {
    return (
      <WidgetShell title={title} onRemove={onRemove}>
        <div className='text-muted-foreground text-sm'>Unknown KPI: {type}</div>
      </WidgetShell>
    );
  }

  const empty = !!data && spec.value(data) === 0;
  const value = data ? spec.value(data) : 0;
  const formatted = spec.format ? spec.format(value) : value.toLocaleString();

  return (
    <WidgetShell
      title={spec.label || title}
      loading={loading}
      error={error}
      empty={empty}
      emptyHint={spec.emptyHint}
      onRemove={onRemove}
      contentClassName='flex flex-col justify-center'
    >
      <div className='flex flex-col gap-1'>
        <span className='text-3xl font-semibold tabular-nums'>{formatted}</span>
        {spec.hint && data && (
          <Badge variant='secondary' className='text-muted-foreground w-fit text-xs'>
            {spec.hint(data)}
          </Badge>
        )}
      </div>
    </WidgetShell>
  );
}
