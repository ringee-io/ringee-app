/**
 * Demo fixtures for the AI pipeline detail pages.
 *
 * Rendered instead of the API responses when the page URL carries `?mock=1`
 * (e.g. `/dashboard/ai-pipeline/objection-intelligence?mock=1`). Nothing here
 * touches the backend: every mutation the pages expose (toggle a context, run
 * the analysis, save a response, complete an action) is applied to local state
 * so the screens stay explorable end to end.
 *
 * Dates are computed at call time so the data always looks freshly generated.
 */

import type {
  PaginatedActions,
  PendingActionView
} from '@/features/pending-actions/types';
import type {
  ActivationRow,
  ActivationSummary,
  ObjectionInsight,
  ObjectionInsightsView,
  ObjectionTrendPoint,
  RunPreview
} from './types';

/** True when the current URL asks for the demo dataset. */
export function isMockParam(value: string | null): boolean {
  return value === '1' || value === 'true';
}

/* ── time helpers ── */

const HOUR = 3600_000;
const DAY = 24 * HOUR;

const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * DAY).toISOString();
const daysAhead = (d: number) => new Date(Date.now() + d * DAY).toISOString();
const todayAt = (hour: number) => {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

/** Stable per-context seed so each context shows its own (repeatable) numbers. */
function seedFor(contextKey: string): number {
  let h = 2166136261;
  for (let i = 0; i < contextKey.length; i++) {
    h = (Math.imul(h, 16777619) ^ contextKey.charCodeAt(i)) >>> 0;
  }
  return h;
}

/* ── activation summary (shared by both pipelines) ── */

const CAMPAIGN_ONE = 'campaign:11111111-1111-4111-8111-111111111111';
const CAMPAIGN_TWO = 'campaign:22222222-2222-4222-8222-222222222222';
const ORGANIZATION = 'org_no_campaign:33333333-3333-4333-8333-333333333333';

const PIPELINE_META: Record<
  string,
  { name: string; valueProposition: string; detailRoute: string }
> = {
  objection_intelligence: {
    name: 'Objection Intelligence',
    valueProposition: 'Discover what blocks your prospects and how to respond.',
    detailRoute: '/dashboard/ai-pipeline/objection-intelligence'
  },
  follow_up_recommendations: {
    name: 'Follow-up Recommendations',
    valueProposition: 'Turn every call outcome into the next best action.',
    detailRoute: '/dashboard/ai-pipeline/follow-up-recommendations'
  }
};

export function mockActivationSummary(pipeline: string): ActivationSummary {
  const meta = PIPELINE_META[pipeline] ?? {
    name: pipeline,
    valueProposition: '',
    detailRoute: `/dashboard/ai-pipeline/${pipeline}`
  };

  const campaigns: ActivationRow[] = [
    {
      contextKey: CAMPAIGN_ONE,
      contextType: 'campaign',
      label: 'Q3 Outbound — SaaS Founders',
      descriptor: {
        type: 'campaign',
        campaignId: CAMPAIGN_ONE.split(':')[1]
      },
      enabled: true,
      newEligibleSinceLastRun: 23,
      lastRunAt: hoursAgo(19),
      pendingActionCount: 12,
      lastConfidence: 'high'
    },
    {
      contextKey: CAMPAIGN_TWO,
      contextType: 'campaign',
      label: 'Renewals — EMEA',
      descriptor: {
        type: 'campaign',
        campaignId: CAMPAIGN_TWO.split(':')[1]
      },
      enabled: true,
      newEligibleSinceLastRun: 8,
      lastRunAt: daysAgo(3),
      pendingActionCount: 5,
      lastConfidence: 'medium'
    }
  ];

  const organization: ActivationRow = {
    contextKey: ORGANIZATION,
    contextType: 'organization_outside_campaign',
    label: 'Organization (outside campaigns)',
    descriptor: { type: 'organization_outside_campaign' },
    enabled: false,
    newEligibleSinceLastRun: 41,
    lastRunAt: null,
    pendingActionCount: 0,
    lastConfidence: null
  };

  return {
    pipeline: { type: pipeline, ...meta, implemented: true },
    campaigns,
    organization,
    // Personal is freelancer-only; the demo org has none.
    personal: null
  };
}

/** Immutably updates one activation row — the demo stand-in for a POST + refetch. */
export function patchSummaryRow(
  summary: ActivationSummary,
  contextKey: string,
  patch: Partial<ActivationRow>
): ActivationSummary {
  const apply = (row: ActivationRow | null) =>
    row && row.contextKey === contextKey ? { ...row, ...patch } : row;
  return {
    ...summary,
    campaigns: summary.campaigns.map((r) => apply(r) as ActivationRow),
    organization: apply(summary.organization),
    personal: apply(summary.personal)
  };
}

/** Calls already analyzed in a context — the base every other number derives from. */
function analyzedCount(contextKey: string): number {
  return Math.round(148 * (0.75 + (seedFor(contextKey) % 6) * 0.1));
}

export function mockRunPreview(row: ActivationRow): RunPreview {
  // A run covers everything analyzed so far plus what came in since. A context
  // that never ran only has the new calls waiting for it.
  const eligibleCount =
    (row.lastRunAt ? analyzedCount(row.contextKey) : 0) +
    row.newEligibleSinceLastRun;
  return {
    enabled: row.enabled,
    isRunning: false,
    eligibleCount,
    newEligibleSinceLastRun: row.newEligibleSinceLastRun,
    estimatedConfidence:
      eligibleCount >= 100 ? 'high' : eligibleCount >= 50 ? 'medium' : 'low',
    lowData: eligibleCount < 50,
    lastRunAt: row.lastRunAt
  };
}

/* ── Objection Intelligence ── */

type InsightSeed = Omit<
  ObjectionInsight,
  'id' | 'count' | 'appearanceRate' | 'updatedAt'
> & { count: number };

const INSIGHT_SEEDS: InsightSeed[] = [
  {
    objectionType: 'price_vs_current_stack',
    label: 'Too expensive next to what they already pay',
    dynamic: true,
    count: 44,
    convertedRate: 0.19,
    underlyingObjection:
      'They are not comparing you to nothing — they are comparing you to a tool they already pay for. The real question is what they can drop, not what your plan costs.',
    winningPattern:
      'Reps who asked "what are you paying for that today?" before quoting kept the conversation alive. Framing the price as a swap (not an addition) recovered most of these calls.',
    losingPattern:
      'Jumping straight to a discount. Every call where the rep offered a percentage off in the first 60 seconds ended without a next step.',
    recommendedResponse:
      "Totally fair — most teams we talk to are already paying for something here. Out of curiosity, what does that line item look like today? If we can't replace it, I'd rather tell you now than sell you a second tool.",
    savedResponse: null,
    examples: [
      {
        excerpt:
          "It's more than we pay right now, and honestly I'd have to justify the jump to finance.",
        outcome: 'handled'
      },
      {
        excerpt: "We just renewed our current vendor, so the budget's gone.",
        outcome: 'killed'
      }
    ],
    status: 'new',
    confidence: 'high'
  },
  {
    objectionType: 'send_me_information',
    label: null,
    dynamic: false,
    count: 37,
    convertedRate: 0.08,
    underlyingObjection:
      'A polite exit in 4 of every 5 calls. When it is genuine, the prospect names who else needs to read it — that is the tell.',
    winningPattern:
      'Asking "happy to — who else will read it?" before sending. Naming a second reader turned the brush-off into a real thread.',
    losingPattern:
      'Agreeing to send and hanging up without a date. None of those calls came back.',
    recommendedResponse:
      "Happy to send it over. So I don't fill your inbox with the wrong thing — who else on your side would read it, and what would you want it to answer?",
    savedResponse:
      "Happy to send it. Quick one first — who else reads it with you? I'll cut it down to the part that matters to them.",
    examples: [
      {
        excerpt: 'Just send me some information and I’ll take a look.',
        outcome: 'killed'
      },
      {
        excerpt: 'Send it to me and my ops lead, we review these on Fridays.',
        outcome: 'handled'
      }
    ],
    status: 'saved',
    confidence: 'high'
  },
  {
    objectionType: 'annual_contract_lock_in',
    label: 'Locked into an annual contract',
    dynamic: true,
    count: 29,
    convertedRate: 0.14,
    underlyingObjection:
      'Rarely about the contract itself — it is about not wanting to run a migration mid-quarter. The renewal date is the opening, not the wall.',
    winningPattern:
      'Getting the renewal month on the call and booking the follow-up against it. Those calls converted at more than twice the rate of the rest.',
    losingPattern:
      'Offering to buy out the contract. It moved the conversation to procurement and stalled every time.',
    recommendedResponse:
      "Makes sense — no one rips out a tool mid-contract. When does it come up for renewal? I'd rather come back six weeks before that with numbers than push you now.",
    savedResponse: null,
    examples: [
      {
        excerpt: "We're locked in with them until March, so there's no rush.",
        outcome: 'handled'
      }
    ],
    status: 'new',
    confidence: 'high'
  },
  {
    objectionType: 'not_the_right_person',
    label: null,
    dynamic: false,
    count: 21,
    convertedRate: 0.26,
    underlyingObjection:
      'Usually true, and the highest-converting objection you get — these calls end with a warm internal hand-off when the rep asks for one.',
    winningPattern:
      'Asking for the name and offering to mention who sent you. Referred calls in this set converted at 26%.',
    losingPattern:
      'Pitching anyway. Two thirds of those calls ended before the 90-second mark.',
    recommendedResponse:
      "Appreciate you saying so — who owns this on your side? If you're happy for me to mention we spoke, I'll keep it short with them.",
    savedResponse: null,
    examples: [
      {
        excerpt: "That's really Marta's call, I just handle the day to day.",
        outcome: 'handled'
      }
    ],
    status: 'new',
    confidence: 'medium'
  },
  {
    objectionType: 'no_time',
    label: null,
    dynamic: false,
    count: 16,
    convertedRate: 0.11,
    // Measured but not yet enriched — shows the "no AI analysis yet" state.
    underlyingObjection: null,
    winningPattern: null,
    losingPattern: null,
    recommendedResponse: null,
    savedResponse: null,
    examples: null,
    status: 'new',
    confidence: 'medium'
  },
  {
    objectionType: 'security_review_required',
    label: 'Needs to clear a security review',
    dynamic: true,
    count: 11,
    convertedRate: 0.31,
    underlyingObjection:
      'Not a rejection — it is a buying signal with a queue in front of it. These prospects have already decided they want the tool.',
    winningPattern:
      'Sending the security packet before the call ended and booking the next step in the same breath.',
    losingPattern:
      'Waiting for them to ask for the documents. Those threads went quiet for weeks.',
    recommendedResponse:
      "Good — that's the part we're ready for. I'll send our SOC 2 report and the DPA today. Can we hold 20 minutes next week so your security lead can ask questions directly?",
    savedResponse: null,
    examples: [
      {
        excerpt: 'Anything new has to go through our security review first.',
        outcome: 'handled'
      }
    ],
    status: 'new',
    confidence: 'medium'
  },
  {
    objectionType: 'bad_timing',
    label: null,
    dynamic: false,
    count: 9,
    convertedRate: 0.07,
    underlyingObjection:
      'Half of these name a concrete event (end of quarter, a hire, a migration). The other half are soft nos.',
    winningPattern: 'Asking what changes after the event they named.',
    losingPattern: 'Accepting "call me next quarter" without a date.',
    recommendedResponse:
      "Understood. What changes for you after that? If it's the right time then, I'd rather put a date on the calendar now than guess.",
    savedResponse: null,
    examples: [
      { excerpt: 'Call me after the quarter closes.', outcome: 'killed' }
    ],
    // Dismissed rows stay out of the ranked list.
    status: 'dismissed',
    confidence: 'medium'
  }
];

/** Cumulative share of the final count at each of the last four runs. */
const TREND_STEPS = [0.32, 0.58, 0.81, 1];

function buildTrend(
  insights: ObjectionInsight[],
  seed: number
): ObjectionTrendPoint[] {
  const runDays = [26, 18, 9, 1];
  return TREND_STEPS.map((step, runIdx) => {
    const counts: Record<string, number> = {};
    insights.forEach((insight, i) => {
      if (runIdx === TREND_STEPS.length - 1) {
        counts[insight.objectionType] = insight.count;
        return;
      }
      // Small deterministic jitter so the sparklines are not all identical.
      const jitter = (((seed + i * 7 + runIdx * 13) % 7) - 3) / 100;
      counts[insight.objectionType] = Math.max(
        1,
        Math.round(insight.count * (step + jitter))
      );
    });
    return { runAt: daysAgo(runDays[runIdx]), counts };
  });
}

export function mockObjectionView(row: ActivationRow): ObjectionInsightsView {
  const contextKey = row.contextKey;

  // A context that never ran has nothing to show — that is the empty state.
  if (!row.lastRunAt) {
    return {
      contextKey,
      confidence: null,
      eligibleCount: 0,
      lastRunAt: null,
      aiApplied: false,
      insights: [],
      trend: []
    };
  }

  const seed = seedFor(contextKey);
  const eligibleCount = analyzedCount(contextKey);
  const scale = eligibleCount / 148;

  const insights: ObjectionInsight[] = INSIGHT_SEEDS.map((base, i) => {
    const count = Math.max(3, Math.round(base.count * scale));
    return {
      ...base,
      id: `${contextKey}:${base.objectionType}`,
      count,
      appearanceRate: count / eligibleCount,
      updatedAt: hoursAgo(6 + i)
    };
  }).sort((a, b) => b.count - a.count);

  return {
    contextKey,
    confidence: 'high',
    eligibleCount,
    lastRunAt: row.lastRunAt,
    aiApplied: true,
    insights,
    trend: buildTrend(insights, seed)
  };
}

/* ── Follow-up Recommendations ── */

type ActionSeed = Pick<
  PendingActionView,
  | 'type'
  | 'status'
  | 'priority'
  | 'source'
  | 'title'
  | 'reason'
  | 'suggestedMessage'
  | 'nextBestAction'
> & {
  /** Offset in days from now; null = no due date. */
  dueInDays: number | null;
  contact: NonNullable<PendingActionView['contact']>;
  outcome: string;
};

const ACTION_SEEDS: ActionSeed[] = [
  {
    type: 'send_pricing_or_info',
    status: 'pending',
    priority: 'high',
    source: 'ai',
    title: 'Send the security packet to Marta Ferreira',
    reason:
      'Asked for SOC 2 and the DPA before looping in her security lead. She named a decision date two weeks out.',
    suggestedMessage:
      "Hi Marta — as promised, our SOC 2 Type II report and DPA are attached. Happy to jump on 20 minutes with your security lead if that's faster than a document review.",
    nextBestAction: 'Attach SOC 2 + DPA and propose a 20-minute security call.',
    dueInDays: 0,
    contact: {
      id: 'mock-contact-1',
      name: 'Marta Ferreira',
      phoneNumber: '+351912345678',
      company: 'Nordwind Logistics'
    },
    outcome: 'interested'
  },
  {
    type: 'book_meeting',
    status: 'pending',
    priority: 'high',
    source: 'ai',
    title: 'Book the technical demo with Daniel Reyes',
    reason:
      'Ran 14 minutes, asked about the API twice and pulled in his CTO at the end. Strongest signal in this context today.',
    suggestedMessage:
      "Daniel — great call. I've held two slots for the technical walkthrough: Thursday 10:00 or Friday 15:00. Which works for you and your CTO?",
    nextBestAction: 'Offer two concrete slots this week.',
    dueInDays: 0,
    contact: {
      id: 'mock-contact-2',
      name: 'Daniel Reyes',
      phoneNumber: '+13475550142',
      company: 'Brightpath Health'
    },
    outcome: 'meeting_requested'
  },
  {
    type: 'create_callback',
    status: 'pending',
    priority: 'high',
    source: 'rule',
    title: 'Call Aisha Karim back — she asked for Tuesday',
    reason:
      'Explicit callback request during the call. No callback has been scheduled yet.',
    suggestedMessage: null,
    nextBestAction: 'Schedule the callback for Tuesday morning.',
    dueInDays: -1,
    contact: {
      id: 'mock-contact-3',
      name: 'Aisha Karim',
      phoneNumber: '+447700900233',
      company: 'Levo Retail Group'
    },
    outcome: 'callback_requested'
  },
  {
    type: 'send_follow_up',
    status: 'pending',
    priority: 'medium',
    source: 'ai',
    title: 'Follow up with Tomás Ribeiro on the renewal date',
    reason:
      'Locked into an annual contract until March. Agreed to a check-in six weeks before renewal.',
    suggestedMessage:
      "Tomás — noting your renewal for March as you mentioned. I'll come back mid-January with a like-for-like comparison so you can decide with numbers in hand.",
    nextBestAction: 'Send the renewal-date recap and set a January reminder.',
    dueInDays: 2,
    contact: {
      id: 'mock-contact-4',
      name: 'Tomás Ribeiro',
      phoneNumber: '+34611223344',
      company: 'Ancora Seguros'
    },
    outcome: 'not_now'
  },
  {
    type: 'ask_for_referral',
    status: 'pending',
    priority: 'medium',
    source: 'ai',
    title: 'Ask Lena Vogt for the right owner',
    reason:
      'Not the decision maker but offered to point you to the ops lead. Referred intros convert at 26% in this context.',
    suggestedMessage:
      "Lena — thanks for being straight with me. Could you point me to whoever owns this? Happy to mention we spoke so it isn't a cold call for them.",
    nextBestAction: 'Request the introduction by name.',
    dueInDays: 1,
    contact: {
      id: 'mock-contact-5',
      name: 'Lena Vogt',
      phoneNumber: '+4915112345678',
      company: 'Halden Manufacturing'
    },
    outcome: 'wrong_person'
  },
  {
    type: 'update_crm',
    status: 'pending',
    priority: 'low',
    source: 'rule',
    title: 'Log the outcome for Priya Nair',
    reason: 'Call completed 3 days ago with no CRM note attached.',
    suggestedMessage: null,
    nextBestAction: 'Add the call outcome and next step to the CRM record.',
    dueInDays: 3,
    contact: {
      id: 'mock-contact-6',
      name: 'Priya Nair',
      phoneNumber: '+919820098200',
      company: 'Corevance Analytics'
    },
    outcome: 'answered'
  },
  {
    type: 'add_to_nurture',
    status: 'pending',
    priority: 'low',
    source: 'rule',
    title: 'Move Jonas Lindqvist to nurture',
    reason:
      'Third no-answer in a row. Rule threshold for switching from dialing to nurture reached.',
    suggestedMessage: null,
    nextBestAction: 'Add to the quarterly nurture sequence.',
    dueInDays: 5,
    contact: {
      id: 'mock-contact-7',
      name: 'Jonas Lindqvist',
      phoneNumber: '+46701234567',
      company: 'Sundby Energi'
    },
    outcome: 'no_answer'
  },
  {
    type: 'review_objection_response',
    status: 'pending',
    priority: 'medium',
    source: 'ai',
    title: 'Review the response for "locked into an annual contract"',
    reason:
      'Objection Intelligence drafted a response for the objection that appeared in 29 calls this month.',
    suggestedMessage: null,
    nextBestAction:
      'Approve or edit the drafted response, then add it to the script.',
    dueInDays: 4,
    contact: {
      id: 'mock-contact-8',
      name: 'Hannah Weiss',
      phoneNumber: '+4917612345678',
      company: 'Kestrel Freight'
    },
    outcome: 'objection'
  },
  {
    type: 'send_follow_up',
    status: 'completed',
    priority: 'medium',
    source: 'ai',
    title: 'Recap sent to Owen Bradley',
    reason: 'Asked for a one-pager after a positive discovery call.',
    suggestedMessage: null,
    nextBestAction: 'Completed — recap sent with pricing tiers.',
    dueInDays: -4,
    contact: {
      id: 'mock-contact-9',
      name: 'Owen Bradley',
      phoneNumber: '+353861234567',
      company: 'Ferrow Systems'
    },
    outcome: 'interested'
  },
  {
    type: 'mark_not_interested',
    status: 'dismissed',
    priority: 'low',
    source: 'rule',
    title: 'Close out Sofia Almeida',
    reason:
      'Asked not to be contacted again. Marked and removed from the queue.',
    suggestedMessage: null,
    nextBestAction: 'No further action.',
    dueInDays: -6,
    contact: {
      id: 'mock-contact-10',
      name: 'Sofia Almeida',
      phoneNumber: '+5511998877665',
      company: 'Vela Consultoria'
    },
    outcome: 'not_interested'
  }
];

/** Pending rows a demo run produces — mirrors the summary's pending counter. */
export const MOCK_PENDING_ACTION_COUNT = ACTION_SEEDS.filter(
  (s) => s.status === 'pending'
).length;

function buildActions(row: ActivationRow): PendingActionView[] {
  // Nothing has been generated for a context that never ran.
  if (!row.lastRunAt) return [];

  const campaignId =
    row.contextType === 'campaign' ? row.contextKey.split(':')[1] : null;

  return ACTION_SEEDS.map((seed, i) => ({
    id: `${row.contextKey}:action-${i}`,
    type: seed.type,
    status: seed.status,
    priority: seed.priority,
    source: seed.source,
    title: seed.title,
    reason: seed.reason,
    suggestedMessage: seed.suggestedMessage,
    nextBestAction: seed.nextBestAction,
    dueAt:
      seed.dueInDays === null
        ? null
        : seed.dueInDays === 0
          ? todayAt(17)
          : seed.dueInDays > 0
            ? daysAhead(seed.dueInDays)
            : daysAgo(-seed.dueInDays),
    snoozedUntil: null,
    expiresAt: null,
    contextType: row.contextType,
    contextKey: row.contextKey,
    campaignId,
    // Left null on purpose: the demo rows point at contacts that do not exist,
    // so the table renders without a link into a 404.
    contactId: null,
    callId: `${row.contextKey}:call-${i}`,
    createdAt: hoursAgo(6 + i * 5),
    completedAt: seed.status === 'completed' ? daysAgo(2) : null,
    contact: seed.contact,
    call: {
      id: `${row.contextKey}:call-${i}`,
      outcome: seed.outcome,
      startedAt: hoursAgo(8 + i * 5)
    },
    campaign: campaignId ? { id: campaignId, name: row.label } : null
  }));
}

const isToday = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
};

function matchesFilter(
  action: PendingActionView,
  filterKey: string,
  actions: PendingActionView[]
): boolean {
  const open = action.status === 'pending' || action.status === 'snoozed';
  switch (filterKey) {
    case 'pending':
      return action.status === 'pending';
    case 'high':
      return open && action.priority === 'high';
    case 'due_today':
      return open && !!action.dueAt && isToday(action.dueAt);
    case 'overdue':
      return open && !!action.dueAt && new Date(action.dueAt) < new Date();
    case 'ai':
      return open && action.source === 'ai';
    case 'rule':
      return open && action.source === 'rule';
    case 'dismissed':
      return action.status === 'dismissed';
    case 'completed':
      return action.status === 'completed';
    default:
      return actions.includes(action);
  }
}

/** Full demo action set for a context, before any filter is applied. */
export function mockFollowUpActions(row: ActivationRow): PendingActionView[] {
  return buildActions(row);
}

/** Applies a results-tab filter to an (already mutated) demo action set. */
export function filterMockActions(
  actions: PendingActionView[],
  filterKey: string
): PaginatedActions {
  const data = actions.filter((a) => matchesFilter(a, filterKey, actions));
  return {
    data,
    meta: {
      total: data.length,
      page: 1,
      limit: 25,
      totalPages: Math.max(1, Math.ceil(data.length / 25))
    }
  };
}
