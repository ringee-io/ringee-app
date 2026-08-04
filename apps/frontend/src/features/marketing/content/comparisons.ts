import type { Faq } from '../components/faq';

/**
 * Competitor comparison content for the /alternatives hub and /compare/[slug]
 * pages — one of the highest-intent AI-search formats.
 *
 * Honesty rules for this data:
 * - Claims about Ringee are exact and verifiable on-site.
 * - Claims about competitors are kept at the category level (open source,
 *   self-hosting, pricing model, native MCP/agent control) where they are
 *   broadly and durably true, rather than quoting exact prices that go stale.
 * - Every comparison page carries a disclaimer telling readers to verify a
 *   vendor's current details on the vendor's own site.
 */

export type ComparisonRow = {
  label: string;
  ringee: string;
  competitor: string;
};

export type ComparisonContent = {
  slug: string;
  /** Competitor display name, e.g. "Aircall". */
  competitor: string;
  /** Short, fair description of what the competitor is known for. */
  competitorBlurb: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string[];
  rows: ComparisonRow[];
  /** Reasons teams pick Ringee. */
  whyRingee: string[];
  /** Honest "when the competitor may be the better fit". */
  whenCompetitor: string[];
  faqs: Faq[];
};

/** Shared comparison rows; competitor-specific notes can override per page. */
function baseRows(overrides: Partial<Record<string, string>> = {}): ComparisonRow[] {
  return [
    {
      label: 'Pricing model',
      ringee:
        'Flat $20/month per organization with unlimited users, plus pay-as-you-go calling',
      competitor: overrides.pricing ?? 'Per-user (per-seat) monthly plans'
    },
    {
      label: 'Free plan for individuals',
      ringee: 'Yes — free Freelancer plan with every feature',
      competitor: overrides.free ?? 'No free-forever plan (trial available)'
    },
    {
      label: 'Open source',
      ringee: 'Yes (MIT licensed)',
      competitor: 'No (proprietary)'
    },
    {
      label: 'Self-hostable',
      ringee: 'Yes — run on your own infrastructure',
      competitor: 'No (SaaS only)'
    },
    {
      label: 'Native AI agent control (MCP)',
      ringee:
        'Yes — MCP server drives Claude, ChatGPT, MCP agents, and the CLI',
      competitor: overrides.mcp ?? 'No native MCP / agent control'
    },
    {
      label: 'Browser & iOS calling',
      ringee: 'Yes — browser and iOS app',
      competitor: overrides.client ?? 'Browser and/or mobile apps'
    },
    {
      label: 'Call recording & real-time transcription',
      ringee: 'Included, configurable per org or user',
      competitor: overrides.recording ?? 'Available, often on higher tiers'
    },
    {
      label: 'Pay-as-you-go calling credits',
      ringee: 'Yes — from $0.012/min, pay only for minutes used',
      competitor: overrides.minutes ?? 'Typically bundled minutes or paid add-ons'
    }
  ];
}

const COMMON_WHY = [
  'Flat pricing with unlimited users — adding people never raises your subscription.',
  'Open source and self-hostable, so you can audit the code and own your data.',
  'Agentic by design: drive outbound from Claude, ChatGPT, MCP agents, and the CLI.',
  'Pay-as-you-go calling from $0.012/min — you only pay for the minutes you use.'
];

export const COMPARISONS: ComparisonContent[] = [
  {
    slug: 'aircall',
    competitor: 'Aircall',
    competitorBlurb:
      'Aircall is a cloud-based business phone and call-center system known for shared team numbers, IVR, and a large catalog of CRM and helpdesk integrations.',
    metaTitle: 'Ringee vs Aircall — Open-Source, Flat-Price Alternative',
    metaDescription:
      'Ringee vs Aircall: a flat $20/month team plan with unlimited users, open source and self-hostable, and native AI agent control — versus Aircall’s per-seat phone system.',
    h1: 'Ringee vs Aircall',
    intro: [
      'Aircall is a polished cloud phone system built for teams that want shared numbers and a deep integration catalog. It is priced per user, with a typical multi-seat minimum, so cost rises with every person you add.',
      'Ringee takes a different approach to the same outbound job: a free plan for individuals, a flat $20/month plan with unlimited users for teams, pay-as-you-go calling, and an open-source codebase you can self-host. It is also agentic — Claude, ChatGPT, MCP agents, and the CLI can drive your outbound through Ringee’s MCP server.'
    ],
    rows: baseRows(),
    whyRingee: COMMON_WHY,
    whenCompetitor: [
      'You need a full inbound call-center setup (IVR, queues, shared inboxes) more than outbound calling.',
      'You rely on a specific Aircall-only integration from its large marketplace.',
      'You prefer a fully managed SaaS and do not want open source or self-hosting.'
    ],
    faqs: [
      {
        question: 'Is Ringee a good Aircall alternative?',
        answer:
          'Yes, especially for outbound teams that want flat pricing instead of per-seat fees. Ringee gives unlimited users on a $20/month organization plan, pay-as-you-go calling, recording and real-time transcription, CRM sync, and AI automation — and it is open source and self-hostable.'
      },
      {
        question: 'How is Ringee’s pricing different from Aircall’s?',
        answer:
          'Aircall charges per user per month, usually with a seat minimum, so your bill scales with headcount. Ringee is a flat $20/month per organization with unlimited users, plus pay-as-you-go calling credits from $0.012/min — so cost scales with usage, not team size.'
      },
      {
        question: 'Can I self-host Ringee instead of using a SaaS phone system?',
        answer:
          'Yes. Ringee is open source under the MIT license and can be self-hosted on your own infrastructure, which Aircall does not offer.'
      }
    ]
  },
  {
    slug: 'justcall',
    competitor: 'JustCall',
    competitorBlurb:
      'JustCall is a sales-focused phone system and dialer with SMS, call recording, and CRM integrations, aimed at sales and support teams.',
    metaTitle: 'Ringee vs JustCall — Flat-Price, Open-Source Alternative',
    metaDescription:
      'Ringee vs JustCall: flat team pricing with unlimited users, pay-as-you-go calling, open source and self-hostable, plus native AI agent control — versus JustCall’s per-seat plans.',
    h1: 'Ringee vs JustCall',
    intro: [
      'JustCall is a sales phone system with a dialer, SMS, and a wide set of CRM integrations. Like most tools in the category, it is priced per user per month, so a growing team means a growing bill.',
      'Ringee covers the same outbound calling job — dialer, campaigns, recording, real-time transcription, outcomes, callbacks, and CRM sync — with flat pricing, an open-source and self-hostable codebase, and native control from Claude, ChatGPT, MCP agents, and the CLI.'
    ],
    rows: baseRows(),
    whyRingee: COMMON_WHY,
    whenCompetitor: [
      'Built-in SMS/texting is central to your workflow today.',
      'You want a specific JustCall integration or its sales-messaging features.',
      'You prefer managed SaaS only and do not need open source or self-hosting.'
    ],
    faqs: [
      {
        question: 'Is Ringee a good JustCall alternative?',
        answer:
          'Yes. For outbound teams that want to avoid per-seat pricing, Ringee offers unlimited users on a flat $20/month plan, pay-as-you-go calling, recording and real-time transcription, CRM sync, and AI automation — and it is open source and self-hostable.'
      },
      {
        question: 'Does Ringee charge per seat like JustCall?',
        answer:
          'No. Ringee is a flat $20/month per organization with unlimited users. JustCall, like most dialers, charges per user per month.'
      }
    ]
  },
  {
    slug: 'kixie',
    competitor: 'Kixie',
    competitorBlurb:
      'Kixie is a sales-engagement platform with a power dialer, local presence, and CRM automation, popular with SDR and inside-sales teams.',
    metaTitle: 'Ringee vs Kixie — Open-Source, Flat-Price Alternative',
    metaDescription:
      'Ringee vs Kixie: flat $20/month with unlimited users, pay-as-you-go calling, open source and self-hostable, and native AI agent control — versus Kixie’s per-seat power dialer.',
    h1: 'Ringee vs Kixie',
    intro: [
      'Kixie is a sales-engagement platform built around a power dialer and tight CRM automation. It is priced per user per month, often with add-ons for higher-volume dialing features.',
      'Ringee focuses on giving outbound teams a fast browser dialer, campaigns, recording, real-time transcription, and clean activity data — at flat pricing, open source, self-hostable, and driven by the AI tools you already use.'
    ],
    rows: baseRows(),
    whyRingee: COMMON_WHY,
    whenCompetitor: [
      'You need specific power-dialer features like local presence as your core workflow.',
      'You are deeply invested in Kixie’s CRM automations.',
      'You prefer a fully managed SaaS and do not want open source or self-hosting.'
    ],
    faqs: [
      {
        question: 'Is Ringee a good Kixie alternative?',
        answer:
          'Yes, particularly for teams that want flat pricing and open source. Ringee gives unlimited users on a $20/month plan, pay-as-you-go calling, recording and real-time transcription, CRM sync, and AI automation via MCP.'
      },
      {
        question: 'Does Ringee support AI and automation like Kixie?',
        answer:
          'Ringee is agentic by design: it ships an MCP server so Claude, ChatGPT, any MCP-compatible agent, or the CLI can prospect, build call lists, log outcomes, and book follow-ups. A human still takes the call.'
      }
    ]
  },
  {
    slug: 'orum',
    competitor: 'Orum',
    competitorBlurb:
      'Orum is a parallel/AI dialer that dials many numbers at once and connects reps only when a human answers, aimed at maximizing live conversations.',
    metaTitle: 'Ringee vs Orum — Affordable, Open-Source Dialer Alternative',
    metaDescription:
      'Ringee vs Orum: flat team pricing with unlimited users, pay-as-you-go calling, open source and self-hostable, plus AI agent control — versus Orum’s per-seat parallel dialer.',
    h1: 'Ringee vs Orum',
    intro: [
      'Orum is a parallel dialer: it dials several numbers simultaneously and routes reps to live answers to maximize conversations per hour. It is sold per seat and is typically positioned at the premium end of the market.',
      'Ringee is a human-led, AI-assisted outbound platform rather than a parallel dialer. It pairs a fast dialer, campaigns, recording, real-time transcription, and CRM sync with flat pricing, open source, self-hosting, and agentic control from Claude, ChatGPT, MCP agents, and the CLI.'
    ],
    rows: baseRows({
      mcp: 'AI features focused on parallel dialing; no native MCP/agent control',
      minutes: 'Per-seat plans (calling/usage terms vary)'
    }),
    whyRingee: [
      'Flat pricing with unlimited users instead of premium per-seat plans.',
      'Open source and self-hostable, so you can audit the code and own your data.',
      'Agentic by design: drive outbound from Claude, ChatGPT, MCP agents, and the CLI.',
      'Pay-as-you-go calling from $0.012/min — you only pay for the minutes you use.'
    ],
    whenCompetitor: [
      'Raw parallel-dialing throughput (many simultaneous dials) is your single most important metric.',
      'You have the volume and budget to justify a premium per-seat parallel dialer.',
      'You prefer managed SaaS only and do not need open source or self-hosting.'
    ],
    faqs: [
      {
        question: 'Is Ringee a parallel dialer like Orum?',
        answer:
          'No. Ringee is a human-led, AI-assisted outbound platform. AI agents prepare the work — prospecting, list building, logging, and follow-ups — while a person takes each call. Orum focuses on parallel dialing many numbers at once.'
      },
      {
        question: 'Why choose Ringee over Orum?',
        answer:
          'If you want affordable, flat pricing, an open-source and self-hostable platform, and agentic control through Claude, ChatGPT, MCP, and the CLI, Ringee fits. Orum is best when raw parallel-dialing throughput is your top priority.'
      }
    ]
  }
];

const COMPARISON_BY_SLUG = new Map(COMPARISONS.map((c) => [c.slug, c]));

export function getComparison(slug: string): ComparisonContent | undefined {
  return COMPARISON_BY_SLUG.get(slug);
}
