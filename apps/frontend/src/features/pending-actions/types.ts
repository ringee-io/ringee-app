export interface PendingActionView {
  id: string;
  type: string;
  status: 'pending' | 'completed' | 'dismissed' | 'snoozed';
  priority: 'low' | 'medium' | 'high';
  source: 'rule' | 'ai' | 'manual';
  title: string;
  reason: string | null;
  suggestedMessage: string | null;
  nextBestAction: string | null;
  dueAt: string | null;
  snoozedUntil: string | null;
  expiresAt: string | null;
  contextType: 'campaign' | 'organization_outside_campaign' | 'personal';
  contextKey: string;
  campaignId: string | null;
  contactId: string | null;
  callId: string | null;
  createdAt: string;
  completedAt: string | null;
  contact: {
    id: string;
    name: string | null;
    phoneNumber: string;
    company: string | null;
  } | null;
  call: { id: string; outcome: string | null; startedAt: string | null } | null;
  campaign: { id: string; name: string } | null;
}

export interface PaginatedActions {
  data: PendingActionView[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export const ACTION_TYPE_LABELS: Record<string, string> = {
  send_follow_up: 'Send follow-up',
  create_callback: 'Make callback',
  book_meeting: 'Book meeting',
  ask_for_referral: 'Ask for referral',
  send_pricing_or_info: 'Send info / pricing',
  update_crm: 'Update CRM',
  add_to_nurture: 'Add to nurture',
  mark_not_interested: 'Mark not interested',
  review_call: 'Review call',
  review_script_suggestion: 'Review script suggestion',
  approve_script_version: 'Approve script version',
  review_objection_response: 'Review objection response',
  add_objection_response_to_script: 'Add objection response',
  review_campaign_insight: 'Review campaign insight'
};

export const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600'
};

export const SOURCE_COLORS: Record<string, string> = {
  ai: 'bg-violet-100 text-violet-700',
  rule: 'bg-blue-100 text-blue-700',
  manual: 'bg-slate-100 text-slate-600'
};

export const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-green-100 text-green-700',
  dismissed: 'bg-slate-100 text-slate-500',
  snoozed: 'bg-amber-100 text-amber-700'
};

export function contextLabel(a: PendingActionView): string {
  if (a.contextType === 'campaign') return a.campaign?.name ?? 'Campaign';
  if (a.contextType === 'organization_outside_campaign')
    return 'Organization (outside campaigns)';
  return 'Personal';
}
