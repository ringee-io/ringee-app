export type DashboardScope = 'personal' | 'organization';

export type DashboardRangeKey =
  | 'today'
  | 'yesterday'
  | '7d'
  | '30d'
  | 'this_month'
  | 'last_month'
  | 'custom';

export interface DashboardFilters {
  range: DashboardRangeKey;
  from?: string; // ISO when range === 'custom'
  to?: string;
  scope: DashboardScope;
  memberId?: string | null;
  campaignId?: string | null;
  outcome?: string | null;
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config?: Record<string, unknown> | null;
  isVisible: boolean;
}

export interface DashboardLayoutResponse {
  id: string;
  userId: string;
  organizationId: string | null;
  name: string;
  scope: DashboardScope;
  isDefault: boolean;
  widgets: DashboardWidget[];
}

export type WidgetType =
  | 'kpi_total_calls'
  | 'kpi_answered_calls'
  | 'kpi_meetings_booked'
  | 'kpi_sales'
  | 'kpi_interested'
  | 'kpi_follow_ups'
  | 'kpi_no_answer'
  | 'kpi_voicemail'
  | 'kpi_wrong_number'
  | 'kpi_conversion_rate'
  | 'kpi_meeting_rate'
  | 'kpi_positive_outcome_rate'
  | 'chart_outcome_funnel'
  | 'chart_outcomes_over_time'
  | 'chart_best_time_of_day'
  | 'chart_calls_by_outcome'
  | 'table_recent_high_value_calls'
  | 'table_upcoming_meetings'
  | 'table_agent_performance';

export interface KpisData {
  totalCalls: number;
  answeredCalls: number;
  meetingsBooked: number;
  meetingOutcomeNoEvent: number;
  sales: number;
  interested: number;
  followUps: number;
  notInterested: number;
  noAnswer: number;
  voicemail: number;
  wrongNumber: number;
  gatekeeper: number;
  conversionRate: number;
  meetingRate: number;
  positiveOutcomeRate: number;
  answerRate: number;
  averageDuration: number;
  rangeStart: string;
  rangeEnd: string;
}
