'use client';

import * as React from 'react';
import type { WidgetType } from '../lib/types';
import { KpiWidget } from './kpi-widget';
import { OutcomeFunnelWidget } from './outcome-funnel-widget';
import { OutcomesOverTimeWidget } from './outcomes-over-time-widget';
import { BestTimeOfDayWidget } from './best-time-of-day-widget';
import { CallsByOutcomeWidget } from './calls-by-outcome-widget';
import { RecentHighValueWidget } from './recent-high-value-widget';
import { UpcomingMeetingsWidget } from './upcoming-meetings-widget';
import { AgentPerformanceWidget } from './agent-performance-widget';

interface WidgetMeta {
  type: WidgetType;
  defaultTitle: string;
  description: string;
  category: 'KPI' | 'Chart' | 'Table';
  defaultSize: { w: number; h: number };
}

export const WIDGET_CATALOG: WidgetMeta[] = [
  {
    type: 'kpi_total_calls',
    defaultTitle: 'Total Calls',
    description: 'Calls placed in the selected period.',
    category: 'KPI',
    defaultSize: { w: 3, h: 2 }
  },
  {
    type: 'kpi_answered_calls',
    defaultTitle: 'Answered Calls',
    description: 'Calls answered by a person.',
    category: 'KPI',
    defaultSize: { w: 3, h: 2 }
  },
  {
    type: 'kpi_meetings_booked',
    defaultTitle: 'Meetings Booked',
    description: 'Meetings on the calendar from this period.',
    category: 'KPI',
    defaultSize: { w: 3, h: 2 }
  },
  {
    type: 'kpi_sales',
    defaultTitle: 'Sales Made',
    description: 'Calls with outcome "Sale".',
    category: 'KPI',
    defaultSize: { w: 3, h: 2 }
  },
  {
    type: 'kpi_interested',
    defaultTitle: 'Interested Leads',
    description: 'Calls with outcome "Interested".',
    category: 'KPI',
    defaultSize: { w: 3, h: 2 }
  },
  {
    type: 'kpi_follow_ups',
    defaultTitle: 'Follow-ups',
    description: 'Calls flagged for follow-up.',
    category: 'KPI',
    defaultSize: { w: 3, h: 2 }
  },
  {
    type: 'kpi_no_answer',
    defaultTitle: 'No Answer',
    description: 'Calls that went unanswered.',
    category: 'KPI',
    defaultSize: { w: 3, h: 2 }
  },
  {
    type: 'kpi_voicemail',
    defaultTitle: 'Voicemail',
    description: 'Calls that hit voicemail.',
    category: 'KPI',
    defaultSize: { w: 3, h: 2 }
  },
  {
    type: 'kpi_wrong_number',
    defaultTitle: 'Wrong Number',
    description: 'Calls flagged as wrong number.',
    category: 'KPI',
    defaultSize: { w: 3, h: 2 }
  },
  {
    type: 'kpi_conversion_rate',
    defaultTitle: 'Conversion Rate',
    description: 'Sales / answered calls.',
    category: 'KPI',
    defaultSize: { w: 3, h: 2 }
  },
  {
    type: 'kpi_meeting_rate',
    defaultTitle: 'Meeting Rate',
    description: 'Meetings booked / answered calls.',
    category: 'KPI',
    defaultSize: { w: 3, h: 2 }
  },
  {
    type: 'kpi_positive_outcome_rate',
    defaultTitle: 'Positive Outcome Rate',
    description: '(Sales + Meetings + Interested) / answered.',
    category: 'KPI',
    defaultSize: { w: 3, h: 2 }
  },
  {
    type: 'chart_outcome_funnel',
    defaultTitle: 'Outcome Funnel',
    description: 'Total → Answered → Interested → Meetings → Sales.',
    category: 'Chart',
    defaultSize: { w: 6, h: 5 }
  },
  {
    type: 'chart_outcomes_over_time',
    defaultTitle: 'Outcomes Over Time',
    description: 'Stacked outcomes by day/week/month.',
    category: 'Chart',
    defaultSize: { w: 6, h: 5 }
  },
  {
    type: 'chart_best_time_of_day',
    defaultTitle: 'Best Hours to Call',
    description: 'Hours that produce the most results.',
    category: 'Chart',
    defaultSize: { w: 8, h: 5 }
  },
  {
    type: 'chart_calls_by_outcome',
    defaultTitle: 'Calls by Outcome',
    description: 'Distribution of dispositions.',
    category: 'Chart',
    defaultSize: { w: 4, h: 5 }
  },
  {
    type: 'table_recent_high_value_calls',
    defaultTitle: 'High-Value Calls',
    description: 'Recent sales, meetings, interested, follow-ups.',
    category: 'Table',
    defaultSize: { w: 6, h: 6 }
  },
  {
    type: 'table_upcoming_meetings',
    defaultTitle: 'Upcoming Meetings & Callbacks',
    description: 'Scheduled meetings and callbacks, soonest first.',
    category: 'Table',
    defaultSize: { w: 6, h: 6 }
  },
  {
    type: 'table_agent_performance',
    defaultTitle: 'Agent Performance',
    description: 'Per-agent breakdown (org admins only).',
    category: 'Table',
    defaultSize: { w: 12, h: 6 }
  }
];

export function getWidgetMeta(type: WidgetType): WidgetMeta | undefined {
  return WIDGET_CATALOG.find((w) => w.type === type);
}

interface RenderProps {
  type: WidgetType;
  title: string;
  onRemove?: () => void;
}

export function renderWidget(props: RenderProps) {
  const { type } = props;
  if (type.startsWith('kpi_')) {
    return <KpiWidget {...props} />;
  }
  switch (type) {
    case 'chart_outcome_funnel':
      return <OutcomeFunnelWidget {...props} />;
    case 'chart_outcomes_over_time':
      return <OutcomesOverTimeWidget {...props} />;
    case 'chart_best_time_of_day':
      return <BestTimeOfDayWidget {...props} />;
    case 'chart_calls_by_outcome':
      return <CallsByOutcomeWidget {...props} />;
    case 'table_recent_high_value_calls':
      return <RecentHighValueWidget {...props} />;
    case 'table_upcoming_meetings':
      return <UpcomingMeetingsWidget {...props} />;
    case 'table_agent_performance':
      return <AgentPerformanceWidget {...props} />;
    default:
      return null;
  }
}
