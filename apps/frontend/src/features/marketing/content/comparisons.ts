import type { Faq } from '../components/faq';
import { PRICING } from '../site';
import { CALL_RATE_FROM, PHONE_NUMBER_COUNTRIES } from './phone-numbers';

/**
 * Competitor comparison content for the /alternatives hub and /compare/[slug]
 * pages — one of the highest-intent AI-search formats.
 *
 * Honesty rules for this data:
 * - Claims about Ringee are exact and verifiable on-site.
 * - Claims about competitors are kept at the category level (open source,
 *   self-hosting, pricing model, native MCP/agent control) where they are
 *   broadly and durably true, rather than quoting exact prices that go stale.
 *   A row we cannot state fairly for both sides is left out, not guessed.
 * - Rows name the side they favor, including the rows the competitor wins.
 * - Every comparison page carries a disclaimer telling readers to verify a
 *   vendor's current details on the vendor's own site.
 */

export type ComparisonRow = {
  label: string;
  ringee: string;
  competitor: string;
  /** The side this row favors; a row that is a matter of fit has none. */
  edge?: 'ringee' | 'competitor';
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
  /** The short answer, for readers who stop at the top of the page. */
  summary?: string[];
  rows: ComparisonRow[];
  /** The competitor sells per-user seats, so the seat calculator applies. */
  perSeat: boolean;
  /** Reasons teams pick Ringee. */
  whyRingee: string[];
  /** Honest "when the competitor may be the better fit". */
  whenCompetitor: string[];
  /** How a team moves over, step by step. */
  switching?: { title: string; description: string }[];
  faqs: Faq[];
};

const TEAM_PRICE = `$${PRICING.organization.price}/month`;
const COUNTRY_COUNT = PHONE_NUMBER_COUNTRIES.length;

/** Shared comparison rows; competitor-specific notes can override per page. */
function baseRows(
  overrides: Partial<Record<string, string>> = {}
): ComparisonRow[] {
  return [
    {
      label: 'Pricing model',
      ringee: `Flat ${TEAM_PRICE} per organization with unlimited users, plus pay-as-you-go calling`,
      competitor: overrides.pricing ?? 'Per-user monthly plans',
      edge: 'ringee'
    },
    {
      label: 'Free plan for individuals',
      ringee: 'Yes — free Freelancer plan for human calling and automation',
      competitor: overrides.free ?? 'No free-forever plan (trial available)',
      edge: 'ringee'
    },
    {
      label: 'Open source',
      ringee: 'Yes (MIT licensed)',
      competitor: 'No (proprietary)',
      edge: 'ringee'
    },
    {
      label: 'Self-hostable',
      ringee: 'Yes — run on your own infrastructure',
      competitor: 'No (SaaS only)',
      edge: 'ringee'
    },
    {
      label: 'Human + AI agent calling',
      ringee:
        'Yes — human dialers and AI voice agents on one stack, with MCP control',
      competitor: overrides.mcp ?? 'No native MCP / agent control',
      edge: 'ringee'
    },
    {
      label: 'Browser & mobile calling',
      ringee: 'Yes — browser, Chrome extension, iOS and Android apps',
      competitor: overrides.client ?? 'Browser and/or mobile apps'
    },
    {
      label: 'Call recording & real-time transcription',
      ringee: 'Included, configurable per org or user',
      competitor: overrides.recording ?? 'Available, often on higher tiers',
      edge: 'ringee'
    },
    {
      label: 'Pay-as-you-go calling credits',
      ringee: `Yes — from ${CALL_RATE_FROM}/min, pay only for minutes used`,
      competitor:
        overrides.minutes ?? 'Typically bundled minutes or paid add-ons',
      edge: 'ringee'
    }
  ];
}

const COMMON_WHY = [
  'Flat pricing with unlimited users — adding people never raises your subscription.',
  'Open source and self-hostable, so you can audit the code and own your data.',
  'Human and AI calling on one stack: reps dial directly, while voice agents place calls and hold conversations.',
  `Pay-as-you-go calling from ${CALL_RATE_FROM}/min — you only pay for the minutes you use.`
];

/** The reasons that hold against every per-user phone system. */
const OUTBOUND_WHY = [
  `Flat pricing: unlimited users on one ${TEAM_PRICE} plan, instead of a bill that grows with every hire.`,
  'Humans and AI on one stack: reps dial in progressive or preview mode while AI voice agents place their own calls.',
  'Keep your carrier: connect your SIP trunk or PBX instead of porting your numbers.',
  'Agent-ready: run calls, calling sessions and follow-up from Claude, ChatGPT or any MCP client.',
  `Open source and self-hostable, with pay-as-you-go calling from ${CALL_RATE_FROM}/min.`
];

/** Moving over from a per-user phone system. */
function switchingFrom(competitor: string) {
  return [
    {
      title: 'Keep or add your numbers',
      description: `Connect the carrier or PBX you already use with bring your own carrier, buy new numbers in ${COUNTRY_COUNT} countries, or verify a number you own as a caller ID.`
    },
    {
      title: 'Bring your contacts',
      description: `Export contacts from your CRM or ${competitor}, import the CSV into Ringee, and group the leads into campaigns.`
    },
    {
      title: 'Invite the whole team',
      description:
        'Add everyone to your organization with no per-user fee, connect your CRM, and start calling from the browser.'
    }
  ];
}

export const COMPARISONS: ComparisonContent[] = [
  {
    slug: 'aircall',
    competitor: 'Aircall',
    competitorBlurb:
      'Aircall is a cloud phone and call-center system known for shared team numbers, IVR, and a large marketplace of CRM and helpdesk integrations.',
    metaTitle: 'Ringee vs Aircall — Pricing, AI Calling & Dialer Compared',
    metaDescription: `Ringee vs Aircall: a flat ${TEAM_PRICE} for unlimited users vs per-user plans. Compare dialers, AI voice agents, bring your own carrier, MCP and open source.`,
    h1: 'Ringee vs Aircall',
    intro: [
      'Aircall is a polished cloud phone system for teams that want shared numbers, IVR and a deep integration catalog. It is priced per user, typically with a minimum number of users, so the bill grows with every person you add.',
      `Ringee is built for outbound: a sales dialer with progressive and preview modes, AI voice agents that place real calls, and one ${TEAM_PRICE} plan for your whole team. It is open source, lets you bring your own carrier, and can be driven from Claude, ChatGPT or any MCP client.`
    ],
    summary: [
      'Choose Ringee for outbound calling with human reps and AI agents at one flat price.',
      'Choose Aircall for an inbound-heavy call center with IVR, queues and a large integration marketplace.',
      'Both record calls and run in the browser; they differ most in pricing model, AI calling and how open the stack is.'
    ],
    rows: [
      {
        label: 'Pricing model',
        ringee: `Free for one person; ${TEAM_PRICE} per organization with unlimited users`,
        competitor:
          'Per-user monthly plans, typically with a minimum number of users',
        edge: 'ringee'
      },
      {
        label: 'Calling costs',
        ringee: `Pay as you go from ${CALL_RATE_FROM}/min`,
        competitor: 'Depends on plan and destination'
      },
      {
        label: 'Outbound dialer',
        ringee:
          'Progressive and preview dialing, caller ID rotation, calling windows',
        competitor: 'Power dialer'
      },
      {
        label: 'AI voice agents',
        ringee:
          'Agents place outbound calls, book meetings, deliver reminders and return structured results',
        competitor: 'AI voice agent for answering calls and automated outbound'
      },
      {
        label: 'AI agents & automation',
        ringee:
          'MCP server for Claude, ChatGPT and any MCP client, plus a CLI and API',
        competitor:
          'API, webhooks, integration marketplace and external MCP tools for AI agents'
      },
      {
        label: 'Keep your numbers',
        ringee: 'Bring your own carrier: connect your SIP carrier or PBX',
        competitor:
          'Buy or port numbers; BYOC is configured through Sales or Account Management'
      },
      {
        label: 'Inbound call center',
        ringee: 'Routing to users, ring groups and desk phones; no IVR menus',
        competitor: 'IVR, queues, shared inbox and advanced routing',
        edge: 'competitor'
      },
      {
        label: 'Integrations',
        ringee:
          'Attio, Odoo, Apollo, Prospeo, Google Calendar and a Custom Integrations API',
        competitor: 'A large marketplace of CRM and helpdesk integrations',
        edge: 'competitor'
      },
      {
        label: 'Open source & self-hosting',
        ringee: 'MIT licensed, self-hostable',
        competitor: 'Proprietary SaaS',
        edge: 'ringee'
      },
      {
        label: 'Recording & transcription',
        ringee:
          'Recording and real-time transcription, with or without keeping the audio',
        competitor: 'Available; AI features depend on the plan'
      }
    ],
    perSeat: true,
    whyRingee: OUTBOUND_WHY,
    whenCompetitor: [
      'You need a full inbound call-center setup (IVR, queues, shared inboxes) more than outbound calling.',
      'You rely on a specific Aircall-only integration from its large marketplace.',
      'You prefer a fully managed SaaS and do not want open source or self-hosting.'
    ],
    switching: switchingFrom('Aircall'),
    faqs: [
      {
        question: 'Is Ringee a good Aircall alternative?',
        answer: `Yes, especially for outbound teams that want flat pricing instead of per-user fees. Ringee gives unlimited users on a ${TEAM_PRICE} organization plan, pay-as-you-go calling from ${CALL_RATE_FROM}/min, a progressive dialer, AI voice agents that place outbound calls, and bring your own carrier — and it is open source and self-hostable.`
      },
      {
        question: 'How is Ringee’s pricing different from Aircall’s?',
        answer: `Aircall charges per user per month, usually with a minimum number of users, so your bill scales with headcount. Ringee is a flat ${TEAM_PRICE} per organization with unlimited users, plus pay-as-you-go calling credits from ${CALL_RATE_FROM}/min — so cost scales with usage, not team size.`
      },
      {
        question: 'Can I keep my phone numbers if I move from Aircall?',
        answer: `If your numbers are with a carrier or PBX you control, yes: connect it with bring your own carrier and keep calling from them. Otherwise you can buy new local numbers in Ringee in ${COUNTRY_COUNT} countries.`
      },
      {
        question:
          'Can I self-host Ringee instead of using a SaaS phone system?',
        answer:
          'Yes. Ringee is open source under the MIT license and can be self-hosted on your own infrastructure, which Aircall does not offer.'
      }
    ]
  },
  {
    slug: 'justcall',
    competitor: 'JustCall',
    competitorBlurb:
      'JustCall is a sales and support phone system with business texting, several dialer modes, and AI products, sold per user.',
    metaTitle: 'Ringee vs JustCall — Pricing, Dialers & AI Compared',
    metaDescription: `Ringee vs JustCall: one flat ${TEAM_PRICE} for unlimited users vs per-user plans. Compare dialers, AI voice agents, texting, bring your own carrier and MCP.`,
    h1: 'Ringee vs JustCall',
    intro: [
      'JustCall is a sales phone system with a wide range of dialers, business texting and AI products such as an AI voice agent and AI coaching. Like most tools in the category, it is priced per user per month, so a growing team means a growing bill.',
      'Ringee covers the outbound calling job — progressive and preview dialing, campaigns, recording, real-time transcription, outcomes, callbacks and CRM sync — plus AI voice agents, at one flat price for your whole team. It is open source, lets you bring your own carrier, and runs from Claude or ChatGPT through MCP.'
    ],
    summary: [
      'Choose Ringee for flat-priced outbound calling with a progressive dialer and AI voice agents you can drive from your AI tools.',
      'Choose JustCall if business texting is central to your workflow, or if you need predictive or parallel dialing.',
      'Both run in the browser and record calls; they differ most in pricing model, texting and dialer modes.'
    ],
    rows: [
      {
        label: 'Pricing model',
        ringee: `Free for one person; ${TEAM_PRICE} per organization with unlimited users`,
        competitor: 'Per-user monthly plans',
        edge: 'ringee'
      },
      {
        label: 'Free plan for individuals',
        ringee: 'Yes — free Freelancer plan for human calling and automation',
        competitor: 'No free-forever plan (trial available)',
        edge: 'ringee'
      },
      {
        label: 'Dialer modes',
        ringee: 'Progressive and preview',
        competitor: 'Several modes, including power, predictive and parallel',
        edge: 'competitor'
      },
      {
        label: 'Business texting',
        ringee: 'Calling-first',
        competitor: 'SMS, MMS and bulk texting built in',
        edge: 'competitor'
      },
      {
        label: 'AI voice agents',
        ringee: `Included in the ${TEAM_PRICE} plan; calls billed per minute`,
        competitor: 'AI voice agent and AI SDR products'
      },
      {
        label: 'AI agents & automation',
        ringee:
          'MCP server for Claude, ChatGPT and any MCP client, plus a CLI and API',
        competitor: 'MCP server, API and integrations'
      },
      {
        label: 'Keep your numbers',
        ringee: 'Bring your own carrier: connect your SIP carrier or PBX',
        competitor: 'Standard path: buy numbers from JustCall or port them in',
        edge: 'ringee'
      },
      {
        label: 'Open source & self-hosting',
        ringee: 'MIT licensed, self-hostable',
        competitor: 'Proprietary SaaS',
        edge: 'ringee'
      },
      {
        label: 'Recording & transcription',
        ringee:
          'Recording and real-time transcription, with or without keeping the audio',
        competitor:
          'Available, with AI summaries and analytics depending on plan'
      }
    ],
    perSeat: true,
    whyRingee: OUTBOUND_WHY,
    whenCompetitor: [
      'Built-in SMS/texting is central to your workflow today.',
      'You need predictive or parallel dialing, which Ringee deliberately does not do.',
      'You prefer managed SaaS only and do not need open source or self-hosting.'
    ],
    switching: switchingFrom('JustCall'),
    faqs: [
      {
        question: 'Is Ringee a good JustCall alternative?',
        answer: `Yes. For outbound teams that want to avoid per-user pricing, Ringee offers unlimited users on a flat ${TEAM_PRICE} plan, pay-as-you-go calling from ${CALL_RATE_FROM}/min, a progressive dialer, AI voice agents, recording and real-time transcription, and CRM sync — and it is open source and self-hostable.`
      },
      {
        question: 'Does Ringee charge per user like JustCall?',
        answer: `No. Ringee is a flat ${TEAM_PRICE} per organization with unlimited users. JustCall, like most dialers, charges per user per month.`
      },
      {
        question: 'Does Ringee have a predictive dialer like JustCall?',
        answer:
          'No. Ringee dials one lead per rep at a time, in progressive or preview mode, so the person who answers always reaches a rep who is ready. If predictive dialing is a must, JustCall offers it.'
      }
    ]
  },
  {
    slug: 'ringover',
    competitor: 'Ringover',
    competitorBlurb:
      'Ringover is a European cloud phone system with international numbers, a power dialer, call-center features and AI tools, sold per user.',
    metaTitle: 'Ringee vs Ringover — Pricing, AI & Dialer Compared',
    metaDescription: `Ringee vs Ringover: one flat ${TEAM_PRICE} for unlimited users vs per-user plans. Compare AI voice agents, dialers, international numbers and BYOC.`,
    h1: 'Ringee vs Ringover',
    intro: [
      'Ringover is a cloud phone system popular with European teams: international numbers, a power dialer, IVR and call-center features, and AI tools, sold per user per month with calling to many destinations included in its plans.',
      `Ringee takes a different path for outbound teams: one flat price for unlimited users, pay-as-you-go calling from ${CALL_RATE_FROM}/min, a progressive dialer, AI voice agents that place real calls, and an open-source stack you can self-host or connect to your own carrier.`
    ],
    summary: [
      'Choose Ringee for outbound teams that want flat pricing, AI voice agents and control over their stack.',
      'Choose Ringover for a full cloud phone system with IVR, queues and calling bundled into each seat.',
      'Both sell numbers in many countries; Ringee publishes the price and the paperwork for each one.'
    ],
    rows: [
      {
        label: 'Pricing model',
        ringee: `Free for one person; ${TEAM_PRICE} per organization with unlimited users`,
        competitor: 'Per-user monthly plans',
        edge: 'ringee'
      },
      {
        label: 'Calling costs',
        ringee: `Pay as you go from ${CALL_RATE_FROM}/min, no bundles`,
        competitor: 'Calling to many destinations included in per-user plans'
      },
      {
        label: 'Phone numbers',
        ringee: `Local, toll-free and mobile numbers in ${COUNTRY_COUNT} countries, with prices and requirements published`,
        competitor: 'International numbers in many countries'
      },
      {
        label: 'Outbound dialer',
        ringee: 'Progressive and preview dialing, caller ID rotation',
        competitor: 'Power dialer'
      },
      {
        label: 'AI voice agents',
        ringee:
          'Agents place outbound calls, book meetings and deliver reminders',
        competitor: 'AI voice agent focused on answering incoming calls'
      },
      {
        label: 'AI agents & automation',
        ringee:
          'MCP server for Claude, ChatGPT and any MCP client, plus a CLI and API',
        competitor: 'Public API, CRM integrations and read-only MCP server'
      },
      {
        label: 'Keep your numbers',
        ringee: 'Bring your own carrier: connect your SIP carrier or PBX',
        competitor: 'Number porting and BYOC with a compatible carrier'
      },
      {
        label: 'Inbound call center',
        ringee: 'Routing to users, ring groups and desk phones; no IVR menus',
        competitor: 'IVR, queues and call-center routing',
        edge: 'competitor'
      },
      {
        label: 'Open source & self-hosting',
        ringee: 'MIT licensed, self-hostable',
        competitor: 'Proprietary SaaS',
        edge: 'ringee'
      }
    ],
    perSeat: true,
    whyRingee: OUTBOUND_WHY,
    whenCompetitor: [
      'You need a full inbound call center with IVR menus and queues.',
      'You prefer calling bundled into a per-user seat over pay-as-you-go minutes.',
      'You want one vendor for phone, text messaging and video meetings.'
    ],
    switching: switchingFrom('Ringover'),
    faqs: [
      {
        question: 'Is Ringee a good Ringover alternative?',
        answer: `Yes, especially for outbound teams. Ringee gives unlimited users on a ${TEAM_PRICE} plan, pay-as-you-go calling from ${CALL_RATE_FROM}/min, a progressive dialer, AI voice agents that place outbound calls, and bring your own carrier — and it is open source and self-hostable.`
      },
      {
        question: 'Is Ringee cheaper than Ringover?',
        answer: `It depends on team size and call volume. Ringover charges per user with calling included in its plans; Ringee charges one ${TEAM_PRICE} for the organization, and minutes are pay as you go. Flat pricing wins as the team grows; bundled minutes can win for a few people who call all day.`
      },
      {
        question: 'Does Ringee have numbers in Spain, France and Mexico?',
        answer: `Yes. Ringee sells local and toll-free numbers in Spain and France, and local, toll-free and mobile numbers in Mexico — ${COUNTRY_COUNT} countries in total, each with its price and regulatory requirements published.`
      }
    ]
  },
  {
    slug: 'dapta',
    competitor: 'Dapta',
    competitorBlurb:
      'Dapta is an AI agent platform for small and mid-sized businesses, with AI voice and WhatsApp agents and workflow automations for sales and support.',
    metaTitle: 'Ringee vs Dapta — AI Voice Agents & Calling Compared',
    metaDescription: `Ringee vs Dapta: AI voice agents plus a dialer for your human reps, bring your own carrier and MCP, on one flat ${TEAM_PRICE} plan. See where each one fits.`,
    h1: 'Ringee vs Dapta',
    intro: [
      'Dapta is built around AI agents: voice and WhatsApp agents that call, text and follow up, plus automations that connect them to the rest of your tools. It fits well when the job is automating conversations end to end.',
      'Ringee is calling infrastructure for humans and AI together. AI voice agents place outbound calls, and your reps work the same numbers from a progressive dialer, with shared history, recordings and CRM sync. It is open source, lets you bring your own carrier, and runs from Claude, ChatGPT or any MCP client.'
    ],
    summary: [
      'Choose Ringee when your human reps and your AI agents need to call from the same stack.',
      'Choose Dapta when you want AI agents across voice and WhatsApp with ready-made automations.',
      'Both work with Claude: Dapta to build agents and read analytics, Ringee to run calls, calling sessions and follow-up.'
    ],
    rows: [
      {
        label: 'Focus',
        ringee: 'Calling for human reps and AI voice agents on one stack',
        competitor: 'AI agents and automations for sales and support'
      },
      {
        label: 'Dialer for human reps',
        ringee:
          'Progressive and preview dialing, campaigns, browser and mobile apps',
        competitor: 'Focused on AI agents rather than on a dialer for reps',
        edge: 'ringee'
      },
      {
        label: 'AI voice agents',
        ringee:
          'Booking and reminder agents with knowledge, tools and structured results',
        competitor: 'AI voice agents for sales, support, collections and more'
      },
      {
        label: 'WhatsApp and text agents',
        ringee: 'Voice only',
        competitor: 'WhatsApp and text agents',
        edge: 'competitor'
      },
      {
        label: 'MCP',
        ringee:
          'MCP server for any client: leads, contacts, calling sessions, agent calls and follow-up',
        competitor: 'MCP for Claude to build agents and read analytics'
      },
      {
        label: 'Pricing',
        ringee: `Free for one person; ${TEAM_PRICE} for unlimited users; usage billed per minute`,
        competitor: 'Monthly subscription plans'
      },
      {
        label: 'Open source & self-hosting',
        ringee: 'MIT licensed, self-hostable',
        competitor: 'Proprietary SaaS',
        edge: 'ringee'
      }
    ],
    perSeat: false,
    whyRingee: [
      'Your reps and your AI agents share numbers, credit, call history and results.',
      'A real dialer for people: progressive and preview modes, campaigns and local presence.',
      'Bring your own carrier and keep your numbers where they are.',
      `Open source and self-hostable, with one flat ${TEAM_PRICE} for unlimited users.`,
      'Driven by any MCP client, the CLI or the API.'
    ],
    whenCompetitor: [
      'You want AI agents on WhatsApp and text as well as voice.',
      'You want ready-made automations that connect agents to many business tools.',
      'Your team has no human callers and does not need a dialer.'
    ],
    switching: [
      {
        title: 'Rebuild the agent',
        description:
          'Start from the booking or reminders blueprint, paste your instructions and knowledge, and test it in the browser.'
      },
      {
        title: 'Set up your numbers',
        description: `Buy local numbers in ${COUNTRY_COUNT} countries, or connect the carrier you already use with bring your own carrier.`
      },
      {
        title: 'Connect your tools',
        description:
          'Plug Ringee into your workflow with Attio, Odoo, the Custom Integrations API, or MCP from Claude and ChatGPT.'
      }
    ],
    faqs: [
      {
        question: 'Is Ringee a good Dapta alternative?',
        answer: `Yes, if you need human reps and AI agents on the same calling stack. Ringee pairs AI voice agents with a progressive dialer for your team, shared history and recordings, bring your own carrier and MCP control, on a flat ${TEAM_PRICE} plan. If you need WhatsApp agents, Dapta covers that and Ringee does not.`
      },
      {
        question: 'Can I use Ringee from Claude, like Dapta?',
        answer:
          'Yes. Ringee’s MCP server works with Claude, ChatGPT and any MCP client: search and import leads, create calling sessions, start AI voice agent calls, log outcomes and schedule follow-up.'
      },
      {
        question: 'Is Ringee available in Spanish?',
        answer:
          'Yes. The Ringee app is available in Spanish for Spain and Mexico, as well as English, French, Portuguese, German, Italian and Dutch.'
      }
    ]
  },
  {
    slug: 'kixie',
    competitor: 'Kixie',
    competitorBlurb:
      'Kixie is a sales-engagement platform with a power dialer, local presence, and CRM automation, popular with SDR and inside-sales teams.',
    metaTitle: 'Ringee vs Kixie — Open-Source, Flat-Price Alternative',
    metaDescription: `Ringee vs Kixie: flat ${TEAM_PRICE} with unlimited users, pay-as-you-go calling, open source and native AI agent control, versus Kixie’s per-user power dialer.`,
    h1: 'Ringee vs Kixie',
    intro: [
      'Kixie is a sales-engagement platform built around a power dialer and tight CRM automation. It is priced per user per month, often with add-ons for higher-volume dialing features.',
      'Ringee focuses on giving outbound teams a fast browser dialer, campaigns, recording, real-time transcription, and clean activity data — at flat pricing, open source, self-hostable, and driven by the AI tools you already use.'
    ],
    rows: baseRows(),
    perSeat: true,
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
          'Yes. Ringee ships an MCP server so Claude, ChatGPT, compatible agents, and the CLI can orchestrate outbound. Ringee AI voice agents can also place real calls, hold conversations, use tools, and return structured results.'
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
      'Ringee vs Orum: flat team pricing with unlimited users, pay-as-you-go calling, open source and AI agent control, versus Orum’s per-user parallel dialer.',
    h1: 'Ringee vs Orum',
    intro: [
      'Orum is a parallel dialer: it dials several numbers simultaneously and routes reps to live answers to maximize conversations per hour. It is sold per user and is typically positioned at the premium end of the market.',
      'Ringee is a human-and-AI calling platform rather than a parallel dialer. It pairs human dialers and campaigns with AI voice agents that place and hold calls, plus shared recording, transcription, outcomes, CRM events, flat pricing, open source, and self-hosting.'
    ],
    rows: baseRows({
      mcp: 'AI features focused on parallel dialing; no native MCP/agent control',
      minutes: 'Per-user plans (calling/usage terms vary)'
    }),
    perSeat: true,
    whyRingee: [
      'Flat pricing with unlimited users instead of premium per-user plans.',
      'Open source and self-hostable, so you can audit the code and own your data.',
      'Human and AI calling on one stack, with AI voice agents that place calls and hold conversations.',
      `Pay-as-you-go calling from ${CALL_RATE_FROM}/min — you only pay for the minutes you use.`
    ],
    whenCompetitor: [
      'Raw parallel-dialing throughput (many simultaneous dials) is your single most important metric.',
      'You have the volume and budget to justify a premium per-user parallel dialer.',
      'You prefer managed SaaS only and do not need open source or self-hosting.'
    ],
    faqs: [
      {
        question: 'Is Ringee a parallel dialer like Orum?',
        answer:
          'No. Ringee does not parallel-dial many numbers to connect only answered calls to a rep. It provides human dialers and AI voice agents on the same stack; a voice agent can place one outbound call and hold that conversation itself.'
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
