export type ContextDescriptor =
  | { type: 'campaign'; campaignId: string }
  | { type: 'organization_outside_campaign' }
  | { type: 'personal' };

export interface ActivationRow {
  contextKey: string;
  contextType: 'campaign' | 'organization_outside_campaign' | 'personal';
  label: string;
  descriptor: ContextDescriptor;
  enabled: boolean;
  newEligibleSinceLastRun: number;
  lastRunAt: string | null;
  pendingActionCount: number;
  lastConfidence: string | null;
}

export interface ActivationSummary {
  pipeline: {
    type: string;
    name: string;
    valueProposition: string;
    detailRoute: string;
    implemented: boolean;
  };
  campaigns: ActivationRow[];
  organization: ActivationRow | null;
  // null inside an organization — personal context is freelancer-only.
  personal: ActivationRow | null;
}

export interface RunPreview {
  enabled: boolean;
  isRunning: boolean;
  eligibleCount: number;
  newEligibleSinceLastRun: number;
  estimatedConfidence: 'low' | 'medium' | 'high';
  lowData: boolean;
  lastRunAt: string | null;
}

export function allRows(summary: ActivationSummary): ActivationRow[] {
  return [
    ...summary.campaigns,
    ...(summary.organization ? [summary.organization] : []),
    ...(summary.personal ? [summary.personal] : [])
  ];
}

// ── Objection Intelligence ──

export type ObjectionInsightStatus = 'new' | 'saved' | 'dismissed';

export interface ObjectionExample {
  excerpt: string;
  outcome?: 'handled' | 'killed';
}

export interface ObjectionInsight {
  id: string;
  objectionType: string;
  // AI-authored dynamic label; null only on historical canonical rows.
  label: string | null;
  dynamic: boolean;
  count: number;
  appearanceRate: number;
  // null until medium/high confidence; correlational when shown.
  convertedRate: number | null;
  underlyingObjection: string | null;
  winningPattern: string | null;
  losingPattern: string | null;
  recommendedResponse: string | null;
  savedResponse: string | null;
  examples: ObjectionExample[] | null;
  status: ObjectionInsightStatus;
  confidence: 'low' | 'medium' | 'high';
  updatedAt: string;
}

export interface ObjectionTrendPoint {
  runAt: string;
  counts: Record<string, number>;
}

export interface ObjectionInsightsView {
  contextKey: string;
  confidence: 'low' | 'medium' | 'high' | null;
  eligibleCount: number;
  lastRunAt: string | null;
  aiApplied: boolean;
  insights: ObjectionInsight[];
  trend: ObjectionTrendPoint[];
}

const OBJECTION_LABELS: Record<string, string> = {
  send_me_information: 'Send me information',
  no_time: 'No time',
  too_expensive: 'Too expensive',
  using_another_solution: 'Using another solution',
  not_interested: 'Not interested',
  call_me_later: 'Call me later',
  not_the_right_person: 'Not the right person',
  need_to_ask_boss: 'Need to ask my boss',
  bad_timing: 'Bad timing',
  we_do_this_internally: 'We do this internally',
  other: 'Other'
};

export function objectionLabel(type: string): string {
  return OBJECTION_LABELS[type] ?? type;
}

/** Label for an insight: AI-named for dynamic objections, else the taxonomy. */
export function insightLabel(insight: ObjectionInsight): string {
  return insight.label ?? objectionLabel(insight.objectionType);
}
