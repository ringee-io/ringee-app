import type { Faq } from '../components/faq';
import { PRICING } from '../site';
import { CALL_RATE_FROM } from './phone-numbers';

/**
 * "{Competitor} alternatives" pages (/alternatives/[slug]). Searchers comparing
 * alternatives get a list, not a one-on-one page, so these are honest
 * listicles: Ringee first — disclosed as ours — then the other tools people
 * really evaluate, each with who it suits and what to watch for.
 *
 * The same honesty rules as `comparisons.ts` apply to every third-party entry:
 * category-level, durable facts only (pricing model, focus, well-known
 * strengths), never exact prices, and a pointer to the vendor's own site.
 */

export type AlternativeOption = {
  name: string;
  /** Link to our one-on-one comparison, when there is one. */
  compareSlug?: string;
  isRingee?: boolean;
  bestFor: string;
  pricingModel: string;
  summary: string;
  strengths: string[];
  watchOuts: string[];
};

export type AlternativesContent = {
  /** Matches the competitor's `/compare/{slug}` page. */
  slug: string;
  competitor: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string[];
  /** Why teams start looking — stated fairly. */
  reasons: string[];
  criteria: { title: string; description: string }[];
  options: AlternativeOption[];
  faqs: Faq[];
};

const TEAM_PRICE = `$${PRICING.organization.price}/month`;

const RINGEE_PRICING = `Free for one person; ${TEAM_PRICE} per organization with unlimited users; calls from ${CALL_RATE_FROM}/min`;

/** Ringee's entry, tuned to what the reader is leaving. */
function ringeeOption(bestFor: string, summary: string): AlternativeOption {
  return {
    name: 'Ringee',
    isRingee: true,
    bestFor,
    pricingModel: RINGEE_PRICING,
    summary,
    strengths: [
      'Progressive and preview dialing, caller ID rotation and team campaigns',
      'AI voice agents that place outbound calls, book meetings and deliver reminders',
      'Bring your own carrier: connect your SIP carrier or PBX and keep your numbers',
      'MCP server, CLI and API: run calls and follow-up from Claude or ChatGPT',
      'Open source (MIT) and self-hostable'
    ],
    watchOuts: [
      'No IVR menus or call queues for inbound call centers',
      'Calling-first: texting is not the core of the product',
      'No predictive or parallel dialing'
    ]
  };
}

const OPTIONS = {
  aircall: {
    name: 'Aircall',
    compareSlug: 'aircall',
    bestFor: 'Support and sales teams that want a full cloud call center',
    pricingModel:
      'Per user per month, typically with a minimum number of users',
    summary:
      'A polished cloud phone and call-center system with shared numbers, IVR and a large integration marketplace.',
    strengths: [
      'Inbound call-center features: IVR, queues, shared inbox',
      'A large marketplace of CRM and helpdesk integrations',
      'Widely adopted by support and sales teams'
    ],
    watchOuts: [
      'Per-user pricing grows with every hire',
      'Proprietary SaaS; no self-hosting'
    ]
  },
  justcall: {
    name: 'JustCall',
    compareSlug: 'justcall',
    bestFor: 'Sales teams that call and text from one tool',
    pricingModel: 'Per user per month',
    summary:
      'A sales and support phone system with business texting, several dialer modes and AI products.',
    strengths: [
      'SMS, MMS and bulk texting built in',
      'Several dialer modes, including predictive and parallel',
      'AI products such as an AI voice agent and AI coaching'
    ],
    watchOuts: [
      'Per-user pricing grows with every hire',
      'Proprietary SaaS; no self-hosting'
    ]
  },
  ringover: {
    name: 'Ringover',
    compareSlug: 'ringover',
    bestFor: 'European teams that want calling bundled into each seat',
    pricingModel:
      'Per user per month, with calling to many destinations included',
    summary:
      'A European cloud phone system with international numbers, a power dialer, call-center features and AI tools.',
    strengths: [
      'Calling to many destinations included in the plans',
      'International numbers in many countries',
      'IVR and call-center routing'
    ],
    watchOuts: [
      'Per-user pricing grows with every hire',
      'Proprietary SaaS; no self-hosting'
    ]
  },
  cloudtalk: {
    name: 'CloudTalk',
    bestFor: 'SMB sales and support teams that want call-center features',
    pricingModel: 'Per user per month',
    summary:
      'Cloud call-center software for sales and support, with dialers, IVR and CRM integrations.',
    strengths: [
      'Call-center features for inbound and outbound',
      'Dialers for outbound teams',
      'CRM integrations'
    ],
    watchOuts: [
      'Per-user pricing grows with every hire',
      'Proprietary SaaS; no self-hosting'
    ]
  },
  dialpad: {
    name: 'Dialpad',
    bestFor: 'Companies that want one AI-first communications vendor',
    pricingModel: 'Per user per month',
    summary:
      'An AI-first cloud communications platform covering business phone, meetings and contact center.',
    strengths: [
      'Built-in AI transcription and call insights',
      'Phone, meetings and contact center from one vendor'
    ],
    watchOuts: [
      'Per-user pricing grows with every hire',
      'Broad platform; more than an outbound team may need'
    ]
  },
  kixie: {
    name: 'Kixie',
    compareSlug: 'kixie',
    bestFor: 'SDR teams centered on a power dialer and CRM automation',
    pricingModel: 'Per user per month',
    summary:
      'A sales-engagement platform built around a power dialer, local presence and CRM automation.',
    strengths: [
      'Power dialing and local presence',
      'Tight CRM automations',
      'Popular with SDR and inside-sales teams'
    ],
    watchOuts: [
      'Per-user pricing grows with every hire',
      'Proprietary SaaS; no self-hosting'
    ]
  },
  quo: {
    name: 'Quo (formerly OpenPhone)',
    bestFor: 'Small teams that mostly need a shared business line',
    pricingModel: 'Per user per month',
    summary:
      'A simple business phone for small teams, with shared numbers and texting.',
    strengths: [
      'Easy setup for small teams',
      'Shared numbers and business texting',
      'Mobile and desktop apps'
    ],
    watchOuts: [
      'Not built for high-volume outbound dialing',
      'Per-user pricing grows with every hire'
    ]
  },
  retell: {
    name: 'Retell AI',
    bestFor: 'Teams building custom voice agents for phone automation',
    pricingModel: 'Usage-based, per minute',
    summary:
      'A voice-agent platform for automating phone calls, with a builder and an API.',
    strengths: [
      'Focused on voice-agent quality and flexibility',
      'API for developers, plus a visual builder',
      'Inbound and outbound call automation'
    ],
    watchOuts: [
      'Voice agents only — no dialer for your human reps',
      'You assemble the calling operation around the agent'
    ]
  },
  vapi: {
    name: 'Vapi',
    bestFor: 'Developers building voice AI into their own product',
    pricingModel: 'Usage-based, per minute',
    summary:
      'A developer platform and API for building, testing and deploying voice agents.',
    strengths: [
      'Deep control over the voice pipeline',
      'Built for developers and custom integrations',
      'Works with many model and voice providers'
    ],
    watchOuts: [
      'Developer-first; needs engineering time',
      'No dialer or workspace for human reps'
    ]
  },
  synthflow: {
    name: 'Synthflow',
    bestFor: 'Businesses that want no-code voice agents',
    pricingModel: 'Subscription plans with included minutes',
    summary:
      'A no-code voice AI platform for automating inbound and outbound phone calls.',
    strengths: [
      'No-code agent builder',
      'Templates for common call types',
      'Integrations with business tools'
    ],
    watchOuts: [
      'Voice agents only — no dialer for your human reps',
      'Proprietary SaaS; no self-hosting'
    ]
  }
} satisfies Record<string, AlternativeOption>;

export const ALTERNATIVES: AlternativesContent[] = [
  {
    slug: 'aircall',
    competitor: 'Aircall',
    metaTitle: '7 Aircall Alternatives for Outbound & AI Calling | Ringee',
    metaDescription:
      'The best Aircall alternatives for outbound and AI calling: Ringee, JustCall, Ringover, CloudTalk, Dialpad, Kixie and Quo compared on pricing model and fit.',
    h1: 'Aircall alternatives for outbound and AI calling',
    intro: [
      'Aircall is a strong cloud phone system, especially for inbound support. Teams usually start looking elsewhere when the per-user bill grows faster than the team’s results, when outbound calling becomes the main job, or when they want AI agents that place calls.',
      'Here are seven alternatives worth evaluating, with who each one suits and what to watch for. We make Ringee, so it is listed first; every other option is a real alternative worth a trial.'
    ],
    reasons: [
      'Per-user pricing, typically with a minimum number of users',
      'An inbound call-center design when the team mostly calls out',
      'AI voice agents and AI automation that need their own add-ons or tools',
      'BYOC setup that requires Sales or Account Management assistance'
    ],
    criteria: [
      {
        title: 'Pricing model',
        description:
          'Per user, per organization or pay as you go — and what happens to the bill when you hire.'
      },
      {
        title: 'Outbound tools',
        description:
          'Dialer modes, local presence, campaigns, calling windows and do-not-call handling.'
      },
      {
        title: 'AI on the call',
        description:
          'Whether AI only takes notes, or can place calls, book meetings and return structured results.'
      },
      {
        title: 'Your numbers',
        description:
          'Buying, porting, or bringing the carrier you already have.'
      }
    ],
    options: [
      ringeeOption(
        'Outbound teams that want flat pricing and AI voice agents',
        'Calling infrastructure for human reps and AI voice agents on one stack, with a progressive dialer, bring your own carrier and MCP control.'
      ),
      OPTIONS.justcall,
      OPTIONS.ringover,
      OPTIONS.cloudtalk,
      OPTIONS.dialpad,
      OPTIONS.kixie,
      OPTIONS.quo
    ],
    faqs: [
      {
        question: 'What is the best Aircall alternative?',
        answer: `It depends on the job. For outbound teams that want flat pricing and AI voice agents, Ringee fits: ${TEAM_PRICE} for unlimited users, a progressive dialer and agents that place real calls. For texting-heavy sales teams, JustCall; for European teams that want calling bundled into each seat, Ringover.`
      },
      {
        question: 'Is there a free Aircall alternative?',
        answer:
          'Ringee has a free Freelancer plan for one person, with browser calling, recording, transcription, callbacks, meetings and CRM sync. Calls are pay as you go from workspace credit.'
      },
      {
        question: 'Which Aircall alternative is cheapest for a growing team?',
        answer: `With per-user tools, the bill grows with each hire. Ringee charges one ${TEAM_PRICE} for the whole organization with unlimited users, and calls are pay as you go from ${CALL_RATE_FROM}/min.`
      }
    ]
  },
  {
    slug: 'justcall',
    competitor: 'JustCall',
    metaTitle: '6 JustCall Alternatives for Sales Calling | Ringee',
    metaDescription:
      'The best JustCall alternatives for sales calling: Ringee, Aircall, Ringover, CloudTalk, Dialpad and Kixie, compared on pricing model, dialers and AI.',
    h1: 'JustCall alternatives for sales calling',
    intro: [
      'JustCall packs calling, texting, dialers and AI products into one sales phone system. Teams look for alternatives when per-user pricing and add-ons outgrow the budget, or when they want AI agents and automation they can control from their own tools.',
      'These six alternatives cover the main directions teams take. We make Ringee, so it is listed first; every other option is a real alternative worth a trial.'
    ],
    reasons: [
      'Per-user pricing that grows with the team',
      'AI features sold as separate products',
      'A preference for open source or self-hosting',
      'Wanting AI assistants such as Claude or ChatGPT to run the calling workflow'
    ],
    criteria: [
      {
        title: 'Pricing model',
        description:
          'Per user or per organization, and which features are add-ons.'
      },
      {
        title: 'Dialer modes',
        description:
          'Progressive, preview, predictive or parallel — and the compliance trade-offs.'
      },
      {
        title: 'Texting',
        description: 'Whether SMS is central to how your team sells.'
      },
      {
        title: 'AI and automation',
        description:
          'AI that places calls, and whether your own AI tools can drive the workflow.'
      }
    ],
    options: [
      ringeeOption(
        'Outbound teams that want flat pricing, AI voice agents and MCP control',
        'Calling infrastructure for human reps and AI voice agents, with progressive dialing, bring your own carrier and an MCP server for Claude and ChatGPT.'
      ),
      OPTIONS.aircall,
      OPTIONS.ringover,
      OPTIONS.cloudtalk,
      OPTIONS.dialpad,
      OPTIONS.kixie
    ],
    faqs: [
      {
        question: 'What is the best JustCall alternative?',
        answer: `For outbound teams that want flat pricing and AI voice agents, Ringee: ${TEAM_PRICE} for unlimited users, a progressive dialer and agents that place real calls. If texting is central, look at tools with SMS at their core; if inbound support matters most, Aircall.`
      },
      {
        question: 'Is there a JustCall alternative without per-user pricing?',
        answer: `Yes. Ringee charges one ${TEAM_PRICE} for the whole organization with unlimited users, and calls are pay as you go from ${CALL_RATE_FROM}/min. One person can use it for free.`
      }
    ]
  },
  {
    slug: 'ringover',
    competitor: 'Ringover',
    metaTitle: '6 Ringover Alternatives for Outbound Teams | Ringee',
    metaDescription:
      'The best Ringover alternatives: Ringee, Aircall, CloudTalk, JustCall, Dialpad and Quo, compared on pricing model, calling costs, dialers and AI.',
    h1: 'Ringover alternatives for outbound teams',
    intro: [
      'Ringover is a well-rounded cloud phone system with calling bundled into each seat. Teams look for alternatives when per-user pricing stops making sense for a growing team, when they want AI agents that place outbound calls, or when they need more control over their stack.',
      'Here are six alternatives, with who each one suits and what to watch for. We make Ringee, so it is listed first; every other option is a real alternative worth a trial.'
    ],
    reasons: [
      'Per-user pricing, even for people who call occasionally',
      'Wanting AI voice agents for outbound, not only for answering calls',
      'Comparing BYOC compatibility and costs to keep the current carrier',
      'A preference for open source or self-hosting'
    ],
    criteria: [
      {
        title: 'Pricing model',
        description:
          'Seats with bundled minutes, or a flat plan with pay-as-you-go calling.'
      },
      {
        title: 'International coverage',
        description:
          'Which countries you can buy numbers in, and what the paperwork is.'
      },
      {
        title: 'AI on the call',
        description: 'AI that answers calls, AI that places them, or both.'
      },
      {
        title: 'Inbound needs',
        description: 'Whether you need IVR menus and queues.'
      }
    ],
    options: [
      ringeeOption(
        'Outbound teams that want flat pricing, AI voice agents and control over their stack',
        'Calling infrastructure for human reps and AI voice agents, with numbers in dozens of countries, bring your own carrier and MCP control.'
      ),
      OPTIONS.aircall,
      OPTIONS.cloudtalk,
      OPTIONS.justcall,
      OPTIONS.dialpad,
      OPTIONS.quo
    ],
    faqs: [
      {
        question: 'What is the best Ringover alternative?',
        answer: `For outbound teams, Ringee: one ${TEAM_PRICE} for unlimited users, pay-as-you-go calling from ${CALL_RATE_FROM}/min, a progressive dialer and AI voice agents that place calls. For an inbound call center with IVR and queues, Aircall or CloudTalk.`
      },
      {
        question: 'Is there a Ringover alternative in Spanish?',
        answer:
          'Yes. Ringee’s app is available in Spanish for Spain and Mexico, and Ringee sells numbers in Spain, Mexico, Colombia and many other countries.'
      }
    ]
  },
  {
    slug: 'dapta',
    competitor: 'Dapta',
    metaTitle: 'Dapta Alternatives for AI Voice Agents & Calling | Ringee',
    metaDescription:
      'Dapta alternatives for AI voice agents and calling: Ringee, Retell AI, Vapi and Synthflow, compared on who each fits, pricing model and trade-offs.',
    h1: 'Dapta alternatives for AI voice agents',
    intro: [
      'Dapta helps small and mid-sized businesses run AI voice and WhatsApp agents with automations around them. Teams look at alternatives when they need a dialer for their human reps next to the agents, more control over the calling stack, or a developer platform to build their own.',
      'Here are four alternatives with different trade-offs. We make Ringee, so it is listed first; every other option is a real alternative worth a trial.'
    ],
    reasons: [
      'Needing human reps and AI agents on the same numbers and history',
      'Wanting to keep the current carrier and numbers',
      'Wanting open source or self-hosting',
      'Building a fully custom voice agent'
    ],
    criteria: [
      {
        title: 'Humans and AI',
        description:
          'Whether your reps get a dialer next to the agents, or the tool is AI-only.'
      },
      {
        title: 'Build or buy',
        description:
          'A developer platform to build on, or a product your team configures.'
      },
      {
        title: 'Channels',
        description: 'Voice only, or voice plus WhatsApp and text.'
      },
      {
        title: 'Pricing model',
        description: 'Flat plans, included minutes, or pure usage.'
      }
    ],
    options: [
      ringeeOption(
        'Teams whose human reps and AI agents need to call from one stack',
        'AI voice agents plus a progressive dialer for your reps, shared history and recordings, bring your own carrier and MCP control.'
      ),
      OPTIONS.retell,
      OPTIONS.vapi,
      OPTIONS.synthflow
    ],
    faqs: [
      {
        question: 'What is the best Dapta alternative?',
        answer:
          'For teams that also have human callers, Ringee: AI voice agents and a progressive dialer on the same numbers and history. For custom voice agents built by developers, Vapi or Retell AI; for no-code agents, Synthflow.'
      },
      {
        question: 'Is there a Dapta alternative with a dialer for human reps?',
        answer:
          'Yes. Ringee gives your reps a progressive and preview dialer in the browser and the apps, next to AI voice agents that place their own calls.'
      }
    ]
  }
];

const ALTERNATIVES_BY_SLUG = new Map(ALTERNATIVES.map((a) => [a.slug, a]));

export function getAlternatives(slug: string): AlternativesContent | undefined {
  return ALTERNATIVES_BY_SLUG.get(slug);
}
