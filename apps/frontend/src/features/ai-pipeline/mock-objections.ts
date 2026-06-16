/**
 * Demo fixtures for the Objection Intelligence screen. Activated with `?mock=1`
 * so the UI can be previewed without a backend or an AI run. Remove this file
 * (and the `mock` branch in objection-intelligence.tsx) once no longer needed.
 */
import {
  ActivationSummary,
  ObjectionInsight,
  ObjectionInsightsView,
  RunPreview
} from './types';

const daysAgo = (n: number) =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

export const mockSummary: ActivationSummary = {
  pipeline: {
    type: 'objection_intelligence',
    name: 'Objection Intelligence',
    valueProposition: 'Discover what blocks your prospects and how to respond.',
    detailRoute: '/dashboard/ai-pipeline/objection-intelligence',
    implemented: true
  },
  campaigns: [
    {
      contextKey: 'campaign:demo-q3',
      contextType: 'campaign',
      label: 'Q3 Outbound — Mid-Market',
      descriptor: { type: 'campaign', campaignId: 'demo-q3' },
      enabled: true,
      newEligibleSinceLastRun: 18,
      lastRunAt: daysAgo(1),
      pendingActionCount: 4,
      lastConfidence: 'high'
    },
    {
      contextKey: 'campaign:demo-eu',
      contextType: 'campaign',
      label: 'EU Expansion',
      descriptor: { type: 'campaign', campaignId: 'demo-eu' },
      enabled: true,
      newEligibleSinceLastRun: 7,
      lastRunAt: daysAgo(3),
      pendingActionCount: 2,
      lastConfidence: 'medium'
    }
  ],
  organization: {
    contextKey: 'org_no_campaign:demo-org',
    contextType: 'organization_outside_campaign',
    label: 'Organization calls outside campaigns',
    descriptor: { type: 'organization_outside_campaign' },
    enabled: false,
    newEligibleSinceLastRun: 31,
    lastRunAt: null,
    pendingActionCount: 0,
    lastConfidence: null
  },
  personal: null
};

const insights: ObjectionInsight[] = [
  {
    id: 'mk-too-expensive',
    objectionType: 'too_expensive',
    label: null,
    dynamic: false,
    count: 52,
    appearanceRate: 0.37,
    convertedRate: 0.28,
    underlyingObjection:
      'Usually not literally about price — the prospect has not yet seen enough value to justify any spend. "Too expensive" is a proxy for "you have not shown me the ROI".',
    winningPattern:
      'Reps who reframed around cost-of-inaction and tied the price to a concrete outcome ("this pays for itself after ~2 recovered deals") kept the conversation alive.',
    losingPattern:
      'Immediately discounting or defending the list price made it the whole conversation. Calls that jumped to "I can ask for 10% off" stalled.',
    recommendedResponse:
      "Totally fair to weigh the cost. Most teams find it pays for itself once they recover a couple of deals they'd normally lose — can I show you the two places that usually happens for teams like yours?",
    savedResponse: null,
    examples: [
      {
        excerpt:
          "honestly it sounds great but it's just out of our budget right now",
        outcome: 'killed'
      },
      {
        excerpt:
          'ok if it actually recovers those deals then the price makes sense, send me the breakdown',
        outcome: 'handled'
      }
    ],
    status: 'new',
    confidence: 'high',
    updatedAt: daysAgo(1)
  },
  {
    id: 'mk-send-info',
    objectionType: 'send_me_information',
    label: null,
    dynamic: false,
    count: 34,
    appearanceRate: 0.24,
    convertedRate: 0.41,
    underlyingObjection:
      '"Send me information" is most often a polite brush-off — it usually means "you have not earned my time yet", not genuine interest in a PDF.',
    winningPattern:
      'Reps who asked one qualifying question before agreeing to send anything, then booked a 15-min slot to "walk through it together", converted far more.',
    losingPattern:
      'Just saying "sure, I\'ll email it over" and hanging up. Those emails went unanswered.',
    recommendedResponse:
      "Happy to — so I send the right thing and not a generic deck, what's the one outcome you'd most want this to help with? Then let's grab 15 minutes to walk through it.",
    savedResponse:
      "Happy to send it over. Quick thing so I send the right piece — what's the main outcome you're hoping to improve? Then let's find 15 minutes to walk through it together.",
    examples: [
      {
        excerpt: 'yeah just send me some info and i’ll take a look',
        outcome: 'killed'
      },
      {
        excerpt:
          "sure, improving connect rates — ok let's do 15 minutes thursday",
        outcome: 'handled'
      }
    ],
    status: 'saved',
    confidence: 'high',
    updatedAt: daysAgo(1)
  },
  {
    id: 'mk-competitor',
    objectionType: 'using_another_solution',
    label: null,
    dynamic: false,
    count: 21,
    appearanceRate: 0.148,
    convertedRate: 0.19,
    underlyingObjection:
      'Inertia, not loyalty. They are rarely thrilled with the incumbent — they just have not felt enough pain to justify the switching cost.',
    winningPattern:
      'Asking "what would have to be true for you to switch?" surfaced the gap and let the rep map specifically to it.',
    losingPattern:
      'Bashing the competitor put reps on the defensive and made the prospect defend their past choice.',
    recommendedResponse:
      "Makes sense — most folks we talk to are on something already. Out of curiosity, if there were one thing your current setup did better, what would it be? That's usually where we fit.",
    savedResponse: null,
    examples: [
      {
        excerpt: "we're already using one of your competitors and it's fine",
        outcome: 'killed'
      }
    ],
    status: 'new',
    confidence: 'high',
    updatedAt: daysAgo(1)
  },
  {
    id: 'mk-no-time',
    objectionType: 'no_time',
    label: null,
    dynamic: false,
    count: 16,
    appearanceRate: 0.113,
    convertedRate: 0.33,
    underlyingObjection:
      'A priority signal, not a calendar one. "No time" means this is not yet important enough to make time for.',
    winningPattern:
      'Offering an extremely small, specific next step ("8 minutes, just the one number that matters to you") respected the objection and still moved forward.',
    losingPattern:
      'Pushing for a full 30-minute demo "this week" against a stated time objection.',
    recommendedResponse:
      "I hear you, last thing I want is to add to the pile. Give me 8 minutes and I'll show you just the one number teams in your seat care about — if it's not useful, we drop it.",
    savedResponse: null,
    examples: [
      {
        excerpt: "look i really don't have time for this right now",
        outcome: 'killed'
      },
      {
        excerpt: 'ok 8 minutes, but that’s it',
        outcome: 'handled'
      }
    ],
    status: 'new',
    confidence: 'high',
    updatedAt: daysAgo(1)
  },
  {
    id: 'mk-dynamic-security',
    objectionType: 'dynamic:security_compliance_review',
    label: 'Security & compliance review required',
    dynamic: true,
    count: 12,
    appearanceRate: 0.085,
    convertedRate: null,
    underlyingObjection:
      'Discovered cluster: prospects raising SOC 2 / data-residency / vendor-review hurdles before they will even evaluate. It is a process gate, not a "no".',
    winningPattern: '',
    losingPattern: '',
    recommendedResponse:
      "Great question — security is usually one of the first things teams check. We're SOC 2 Type II and can share our data-processing terms up front. Want me to loop in the doc so your security team can start in parallel?",
    savedResponse: null,
    examples: [
      {
        excerpt:
          "before anything we'd need to run you through our vendor security review and check data residency"
      }
    ],
    status: 'new',
    confidence: 'high',
    updatedAt: daysAgo(1)
  },
  {
    id: 'mk-dynamic-budget-freeze',
    objectionType: 'dynamic:budget_freeze_next_fiscal',
    label: 'Budget frozen until next fiscal year',
    dynamic: true,
    count: 7,
    appearanceRate: 0.049,
    convertedRate: null,
    underlyingObjection:
      'Discovered cluster: a hard timing gate tied to the fiscal calendar, distinct from a general "bad timing" — these prospects are interested but cannot transact now.',
    winningPattern: '',
    losingPattern: '',
    recommendedResponse:
      "Totally understand — let's not fight the budget cycle. How about we do the evaluation now so you're ready to move day one of next quarter, with nothing owed until then?",
    savedResponse: null,
    examples: [
      {
        excerpt:
          'we love it but our budget is locked until the new fiscal year starts in january'
      }
    ],
    status: 'new',
    confidence: 'high',
    updatedAt: daysAgo(1)
  }
];

// Trend across the last 5 runs (oldest → newest) drives the sparklines + deltas.
const trend = [
  {
    too_expensive: 38,
    send_me_information: 41,
    using_another_solution: 15,
    no_time: 12,
    'dynamic:security_compliance_review': 4,
    'dynamic:budget_freeze_next_fiscal': 2
  },
  {
    too_expensive: 42,
    send_me_information: 38,
    using_another_solution: 17,
    no_time: 13,
    'dynamic:security_compliance_review': 6,
    'dynamic:budget_freeze_next_fiscal': 3
  },
  {
    too_expensive: 45,
    send_me_information: 33,
    using_another_solution: 19,
    no_time: 15,
    'dynamic:security_compliance_review': 8,
    'dynamic:budget_freeze_next_fiscal': 4
  },
  {
    too_expensive: 49,
    send_me_information: 28,
    using_another_solution: 20,
    no_time: 14,
    'dynamic:security_compliance_review': 10,
    'dynamic:budget_freeze_next_fiscal': 5
  },
  {
    too_expensive: 52,
    send_me_information: 34,
    using_another_solution: 21,
    no_time: 16,
    'dynamic:security_compliance_review': 12,
    'dynamic:budget_freeze_next_fiscal': 7
  }
].map((counts, i, arr) => ({
  runAt: daysAgo((arr.length - 1 - i) * 4 + 1),
  counts
}));

export const mockView: ObjectionInsightsView = {
  contextKey: 'campaign:demo-q3',
  confidence: 'high',
  eligibleCount: 142,
  lastRunAt: daysAgo(1),
  aiApplied: true,
  insights,
  trend
};

export const mockRunPreview: RunPreview = {
  enabled: true,
  isRunning: false,
  eligibleCount: 142,
  newEligibleSinceLastRun: 18,
  estimatedConfidence: 'high',
  lowData: false,
  lastRunAt: daysAgo(1)
};
