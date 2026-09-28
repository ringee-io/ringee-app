import type { Faq } from '../components/faq';
import { PRICING } from '../site';
import { CALL_RATE_FROM, PHONE_NUMBER_COUNTRIES } from './phone-numbers';

/**
 * Solution pages: the landing pages written for one buying question each —
 * "AI outbound calling", "AI SDR", "sales dialer", "bring your own carrier".
 * Features describe one capability; a solution answers a search with the
 * capabilities, limits, pricing and comparisons someone needs to decide.
 *
 * Every claim here is about Ringee and must be true in the product today:
 * - AI voice agents: appointment-booking and reminders blueprints, outbound
 *   only, one call per trigger, the same DNC / credit / caller-ID gates on
 *   every surface (AGENT-004, AGENT-008), no live transfer (AGENT-010).
 * - The AI receptionist is not public yet: do not mention it until it ships.
 * - Dialer modes are progressive and preview only — never claim predictive or
 *   parallel dialing.
 * - Prices come from `PRICING` and the pricing snapshot, never from literals
 *   (BILL-021).
 */

export type SolutionSection =
  | {
      kind: 'cards';
      id: string;
      title: string;
      description?: string;
      items: { title: string; description: string }[];
    }
  | {
      kind: 'table';
      id: string;
      title: string;
      description?: string;
      /** First column holds the row label. */
      columns: string[];
      rows: string[][];
      note?: string;
    }
  | {
      kind: 'checklist';
      id: string;
      title: string;
      description?: string;
      items: string[];
    };

export type SolutionContent = {
  slug: string;
  /** Canonical path; solutions live where their parent topic lives. */
  path: string;
  /** Breadcrumb parent, when the page sits under a hub. */
  parent?: { name: string; href: string };
  /** Short name for breadcrumbs, menus and cards. */
  name: string;
  eyebrow: string;
  /** One line for cards, related links and the machine view. */
  tagline: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string[];
  whoFor: string[];
  benefits: string[];
  capabilitiesTitle: string;
  capabilities: { title: string; description: string }[];
  howItWorksTitle: string;
  howItWorks: { title: string; description: string }[];
  sections: SolutionSection[];
  pricing: { title: string; body: string[] };
  related: { name: string; href: string; tagline: string }[];
  cta: { title: string; description: string };
  /** AI voice agent pages carry the "requires the team plan" note. */
  ai?: boolean;
  faqs: Faq[];
};

const TEAM_PRICE = `$${PRICING.organization.price}/month`;
const COUNTRY_COUNT = PHONE_NUMBER_COUNTRIES.length;

/** Guardrails that apply to every AI voice agent call, whatever started it. */
const AGENT_GUARDRAILS = [
  'Every agent call checks your do-not-call list before it dials — from the dashboard, the API, the CLI or MCP alike.',
  'The agent presents the number you assigned to it. With several numbers and no assignment, Ringee refuses the call instead of guessing a caller ID.',
  'An agent call is refused when the workspace has no credit.',
  'Every agent call is recorded and transcribed, so you can check exactly what was said.',
  'The agent tells someone a person will follow up only after the follow-up request has actually been created.'
];

const AGENT_PRICING_BODY = [
  `AI voice agents are part of the Organization plan: ${TEAM_PRICE} for the whole organization, with unlimited users and no per-seat fee for agents.`,
  `Each call is billed per minute from workspace credit: the phone call itself, from ${CALL_RATE_FROM}/min, plus the agent minute that covers speech, voice and the AI model. The exact price for every country is on the phone numbers pages.`,
  'Browser test conversations place no phone call and use no calling credit.'
];

const AI_CALLING_LAW_FAQ: Faq = {
  question: 'Is it legal to make outbound calls with an AI voice agent?',
  answer:
    'It depends on the country you call and the consent you have. In the US, for example, the FCC ruled in 2024 that AI-generated voices count as artificial voices under the TCPA, so those calls generally need the prior express consent of the person you call. Check the rules for every country you call — this is not legal advice. Ringee checks your do-not-call list on every agent call and records each one; consent is yours to collect.'
};

export const SOLUTIONS: SolutionContent[] = [
  {
    slug: 'outbound-calling',
    path: '/ai-voice-agents/outbound-calling',
    parent: { name: 'AI Voice Agents', href: '/ai-voice-agents' },
    name: 'AI outbound calling',
    eyebrow: 'AI Voice Agents',
    tagline:
      'AI voice agents that place your outbound calls, hold the conversation, and log the result.',
    metaTitle: 'AI Outbound Calling Software — Agents That Call | Ringee',
    metaDescription:
      'AI outbound calling with voice agents that place real calls, book meetings, deliver reminders and log every result. DNC checks built in, no per-seat fees.',
    h1: 'AI outbound calling that books the meeting and logs the result',
    intro: [
      'Ringee AI voice agents place real outbound phone calls for your team. Each agent has its own voice, instructions and company context. It holds the live conversation, checks your calendar before it offers a time, books the meeting or delivers the reminder, and writes the outcome to the same call history your reps use.',
      'Start calls from the dashboard, the REST API, the CLI, or an AI assistant such as ChatGPT or Claude through MCP. Every agent call passes the same checks as a human dial — calling rights, your do-not-call list, workspace credit and the caller ID — and is always recorded and transcribed.'
    ],
    whoFor: [
      'Sales teams that want every new lead called back while it is warm',
      'Operations teams confirming appointments and sending reminders',
      'Agencies running calling programs for several clients',
      'Founders who need outbound running before they hire SDRs'
    ],
    benefits: [
      'Calls start the moment your workflow triggers them, not when a rep is free',
      'Meetings land only in slots your calendar says are open',
      'Outcome, summary, sentiment and custom fields after every call',
      'Human reps and AI agents share numbers, credit and call history',
      `No per-seat fees: one ${TEAM_PRICE} team plan, usage billed per minute`
    ],
    capabilitiesTitle: 'What an AI outbound call can do',
    capabilities: [
      {
        title: 'Place the call',
        description: `The agent dials from a Ringee number assigned to it — local, toll-free or mobile numbers are available in ${COUNTRY_COUNT} countries — and opens with the greeting you set.`
      },
      {
        title: 'Hold a real conversation',
        description:
          'Give it a name, a voice (including a clone of a teammate’s voice), company context and instructions. Add web pages and documents it can look up while it speaks.'
      },
      {
        title: 'Book the meeting',
        description:
          'Booking agents look up real availability before they offer a time, and book only the slot the person accepts.'
      },
      {
        title: 'Call back later',
        description:
          'When someone asks to talk another time, the agent schedules the callback and calls back at that time, with the same context.'
      },
      {
        title: 'Escalate to a person',
        description:
          'If someone asks for a human, the agent sends your admins a follow-up request with the call context by email and push. It does not promise a live transfer.'
      },
      {
        title: 'Return structured results',
        description:
          'After the call you get the recording, transcript, outcome, summary, optional sentiment, and the fields you asked it to extract.'
      }
    ],
    howItWorksTitle: 'How AI outbound calling works in Ringee',
    howItWorks: [
      {
        title: 'Pick a blueprint',
        description:
          'Start from appointment booking or reminders and notifications. Each blueprint ships with tested tools and safeguards you cannot accidentally break.'
      },
      {
        title: 'Test it in the browser',
        description:
          'Talk to the agent through your microphone before it calls anyone. Browser tests place no phone call and use no calling credit.'
      },
      {
        title: 'Trigger real calls',
        description:
          'Start calls from the dashboard, the API, the CLI, or through MCP from ChatGPT, Claude or your own agent, then read every result in Ringee.'
      }
    ],
    sections: [
      {
        kind: 'cards',
        id: 'use-cases',
        title: 'Outbound calls an AI agent handles well',
        description:
          'Repeatable calls with a clear goal are where an agent pays off first.',
        items: [
          {
            title: 'Speed-to-lead follow-up',
            description:
              'Trigger a call when a form comes in, confirm the person’s interest, and book the meeting while they still remember filling it in.'
          },
          {
            title: 'Appointment confirmations',
            description:
              'Confirm tomorrow’s appointment, answer questions from the context you supplied, and schedule a callback when the time no longer works.'
          },
          {
            title: 'Reactivating quiet leads',
            description:
              'Call leads that went silent, find out where they stand, and save their answers as fields your reps can filter on.'
          },
          {
            title: 'Event and webinar follow-up',
            description:
              'Call registrants after the event, capture their level of interest as a structured field, and book the next step.'
          }
        ]
      },
      {
        kind: 'table',
        id: 'human-or-ai',
        title: 'When the agent calls and when your team does',
        description:
          'Ringee runs both on the same numbers and history, so you can split the work by call type instead of by tool.',
        columns: ['Call type', 'AI voice agent', 'Your reps in Ringee'],
        rows: [
          [
            'Confirmations, reminders, first-touch qualification',
            'Good fit — repeatable, with clear rules',
            'Free them for higher-value calls'
          ],
          [
            'Negotiation, objections, closing',
            'Hands off with a follow-up request',
            'Good fit — judgment matters'
          ],
          [
            'Working a long list',
            'One call per trigger from your workflow or assistant',
            'Progressive dialer campaigns'
          ],
          [
            'After the call',
            'Outcome, summary and extracted fields',
            'Outcome, notes, callbacks and meetings'
          ]
        ]
      },
      {
        kind: 'checklist',
        id: 'guardrails',
        title: 'Guardrails on every AI call',
        description:
          'Rules for AI calling — consent, disclosure, calling hours — vary by country. Ringee enforces its part on every call; consent is yours to collect.',
        items: AGENT_GUARDRAILS
      }
    ],
    pricing: {
      title: 'What AI outbound calling costs',
      body: AGENT_PRICING_BODY
    },
    related: [
      {
        name: 'AI Voice Agents',
        href: '/ai-voice-agents',
        tagline:
          'How agents are built: voice, knowledge, tools, results and controls.'
      },
      {
        name: 'AI SDR',
        href: '/ai-voice-agents/ai-sdr',
        tagline:
          'An AI SDR that calls leads, qualifies them and books meetings.'
      },
      {
        name: 'Sales dialer',
        href: '/sales-dialer',
        tagline: 'Progressive and preview dialing for the calls your reps own.'
      },
      {
        name: 'MCP for AI agents',
        href: '/integrations/mcp',
        tagline: 'Start agent calls from Claude, ChatGPT or any MCP client.'
      },
      {
        name: 'Phone numbers by country',
        href: '/phone-numbers',
        tagline: `Local, toll-free and mobile numbers in ${COUNTRY_COUNT} countries.`
      },
      {
        name: 'Call transcription',
        href: '/features/call-transcription',
        tagline: 'Searchable transcripts and AI analysis of every call.'
      }
    ],
    cta: {
      title: 'Put an AI voice agent on your outbound calls',
      description:
        'Build an agent, test it in the browser, and let it place real calls from the same stack your team uses.'
    },
    ai: true,
    faqs: [
      {
        question: 'What is AI outbound calling?',
        answer:
          'AI outbound calling means an AI voice agent places the phone call and holds the conversation instead of a person. In Ringee the agent dials a real number, speaks with the person, uses tools such as calendar booking, and returns a recording, transcript and structured result.'
      },
      {
        question: 'Can an AI agent call a whole list?',
        answer:
          'Yes — one call per contact, started by your workflow. The API, the CLI and the MCP tools all start agent calls, so a script, a CRM automation or an assistant like Claude can work through a list. Every call passes the same do-not-call, credit and caller-ID checks.'
      },
      AI_CALLING_LAW_FAQ,
      {
        question: 'Can the agent transfer the call to a person?',
        answer:
          'Not live. When someone asks for a human, the agent creates a follow-up request with the contact, the call and a short explanation, and your admins receive it by email and push notification. Your rep then calls back from the same history.'
      },
      {
        question: 'Which number does the agent call from?',
        answer:
          'A Ringee number you assign to the agent, or the one you name on the call. If the workspace has several numbers and none is assigned, Ringee refuses the call rather than pick one for you.'
      },
      {
        question: 'Can I use my own AI model?',
        answer:
          'Yes. Use the Ringee-managed option, or choose a supported provider and verify your own API key when you configure the agent.'
      },
      {
        question: 'How is this different from a voice AI API?',
        answer:
          'Developer platforms give you the building blocks of a voice agent. Ringee gives you the agent and the calling operation around it — phone numbers, a dialer for your reps, shared call history, recordings, CRM sync and MCP control — in one open-source stack.'
      }
    ]
  },
  {
    slug: 'ai-sdr',
    path: '/ai-voice-agents/ai-sdr',
    parent: { name: 'AI Voice Agents', href: '/ai-voice-agents' },
    name: 'AI SDR',
    eyebrow: 'AI Voice Agents',
    tagline:
      'A voice AI SDR that calls leads, qualifies them, and books meetings on your real calendar.',
    metaTitle: 'AI SDR That Calls Leads & Books Meetings | Ringee',
    metaDescription:
      'A voice AI SDR: it calls your leads, qualifies them, books meetings on your real calendar and logs every result. Works with Apollo, Claude and ChatGPT.',
    h1: 'The AI SDR that calls, qualifies, and books the meeting',
    intro: [
      'Most AI SDR tools write emails. Ringee’s AI SDR makes phone calls. It is an AI voice agent that calls your leads, asks your qualification questions, answers from your company context and knowledge, and books a meeting on your calendar when there is a fit.',
      'It works next to your reps, not instead of them. Leads come from Apollo or Prospeo, calls and results land in the same Ringee history, and anything the agent cannot handle becomes a follow-up request for a person. You can run the whole loop from Claude or ChatGPT through MCP.'
    ],
    whoFor: [
      'SDR teams that want every lead called, not only the obvious ones',
      'Founders doing outbound before hiring their first SDR',
      'Agencies running appointment setting for clients',
      'Sales teams following up inbound demo requests'
    ],
    benefits: [
      'Every lead gets a real phone call, started by your workflow',
      'Qualification answers saved as fields you define',
      'Meetings booked only in slots your calendar says are free',
      'Reps spend their time on the conversations that are ready',
      'Prospecting, calling and follow-up in one open-source stack'
    ],
    capabilitiesTitle: 'What the AI SDR does on a call',
    capabilities: [
      {
        title: 'Calls the lead',
        description:
          'Starts a real outbound call from a number your workspace owns, with the lead’s name and details passed in as call variables.'
      },
      {
        title: 'Qualifies in conversation',
        description:
          'Asks your questions in natural language and saves the answers as custom fields — team size, timing, current tool, whatever you qualify on.'
      },
      {
        title: 'Answers questions',
        description:
          'Answers from the company profile and knowledge you add: your website pages, product documents and notes.'
      },
      {
        title: 'Books the meeting',
        description:
          'Looks up real availability on your Ringee calendar, offers open slots, and books the one the lead accepts.'
      },
      {
        title: 'Schedules the callback',
        description:
          'If now is a bad time, it agrees a time and calls back automatically, with the same context and variables.'
      },
      {
        title: 'Hands off to your team',
        description:
          'When a lead asks for a person, the agent sends your team a follow-up request with the call context attached.'
      }
    ],
    howItWorksTitle: 'How to run an AI SDR in Ringee',
    howItWorks: [
      {
        title: 'Bring in the leads',
        description:
          'Search Apollo or Prospeo from Ringee, import a list, or ask Claude or ChatGPT to find and import the right contacts.'
      },
      {
        title: 'Set up the agent',
        description:
          'Start from the appointment-booking blueprint, add your pitch, qualification fields and knowledge, then test it in the browser.'
      },
      {
        title: 'Call and review',
        description:
          'Trigger calls from the dashboard, API, CLI or MCP. Read the outcome, transcript and extracted fields, and let reps take the meetings.'
      }
    ],
    sections: [
      {
        kind: 'table',
        id: 'email-or-voice',
        title: 'Email AI SDRs and a calling AI SDR',
        description:
          'They solve different parts of the job, and they work well together: email opens the door, the phone call qualifies and books.',
        columns: ['', 'Email AI SDR', 'Ringee AI SDR'],
        rows: [
          ['Channel', 'Email, sometimes LinkedIn', 'Phone calls'],
          [
            'What it produces',
            'Sequences and replies',
            'Live conversations, booked meetings, transcripts'
          ],
          [
            'Qualification',
            'Read from written replies',
            'Asked on the call and saved as fields'
          ],
          [
            'Your human reps',
            'Work in separate tools',
            'Share the same numbers, dialer and history'
          ],
          [
            'Pricing',
            'Varies — often per seat, per contact or per credit',
            `One ${TEAM_PRICE} team plan plus per-minute usage`
          ]
        ]
      },
      {
        kind: 'checklist',
        id: 'guardrails',
        title: 'Guardrails on every AI SDR call',
        description:
          'Rules for AI calling — consent, disclosure, calling hours — vary by country. Ringee enforces its part on every call; consent is yours to collect.',
        items: AGENT_GUARDRAILS
      }
    ],
    pricing: {
      title: 'What the AI SDR costs',
      body: AGENT_PRICING_BODY
    },
    related: [
      {
        name: 'AI outbound calling',
        href: '/ai-voice-agents/outbound-calling',
        tagline:
          'AI voice agents that place outbound calls and log every result.'
      },
      {
        name: 'Sales dialer',
        href: '/sales-dialer',
        tagline: 'Progressive and preview dialing for the calls your reps own.'
      },
      {
        name: 'Apollo',
        href: '/integrations/apollo',
        tagline: 'Search and enrich Apollo leads, then call them.'
      },
      {
        name: 'Claude',
        href: '/integrations/claude',
        tagline: 'Run prospecting, calls and follow-up from Claude.'
      },
      {
        name: 'Meetings',
        href: '/features/meetings',
        tagline: 'Meetings booked on a call, synced with Google Calendar.'
      },
      {
        name: 'SDR teams',
        href: '/use-cases/sdr-teams',
        tagline: 'How SDR teams run outbound on Ringee.'
      }
    ],
    cta: {
      title: 'Give every lead a real phone call',
      description:
        'Set up an AI SDR, test it in the browser, and let your reps take the meetings it books.'
    },
    ai: true,
    faqs: [
      {
        question: 'What is an AI SDR?',
        answer:
          'An AI SDR is software that does the work of a sales development rep: reaching out to leads, qualifying them and booking meetings. Most AI SDRs work by email. Ringee’s works by phone: an AI voice agent calls the lead, qualifies them in conversation and books the meeting.'
      },
      {
        question: 'Will an AI SDR replace my SDR team?',
        answer:
          'It takes the repetitive calls — first touches, follow-ups, reminders — so your reps keep the conversations that need judgment. In Ringee both work from the same numbers, history and results, so nothing gets lost between them.'
      },
      {
        question: 'Where do the leads come from?',
        answer:
          'Connect Apollo or Prospeo and search from Ringee, import a list, or ask Claude or ChatGPT to prospect and import through MCP. Lead enrichment spends your provider’s credits, not Ringee credit.'
      },
      {
        question: 'Can the AI SDR book meetings on my calendar?',
        answer:
          'Yes. Booking agents check real availability before they offer a time and book only the slot the lead accepts.'
      },
      AI_CALLING_LAW_FAQ,
      {
        question: 'How much does an AI SDR cost?',
        answer: `There is no per-seat fee for the agent. It runs on the ${TEAM_PRICE} Organization plan, and each call is billed per minute from workspace credit: the phone call, from ${CALL_RATE_FROM}/min, plus the agent minute.`
      }
    ]
  },
  {
    slug: 'sales-dialer',
    path: '/sales-dialer',
    name: 'Sales dialer',
    eyebrow: 'Sales dialer',
    tagline:
      'A browser sales dialer with progressive and preview modes, local presence, and no per-seat fees.',
    metaTitle: 'Sales Dialer with Progressive & Power Dialing | Ringee',
    metaDescription:
      'Browser sales dialer with progressive (power) and preview modes, local presence, recording and live transcription. Free for one rep, flat price for teams.',
    h1: 'The sales dialer for teams that call every day',
    intro: [
      'Ringee is an outbound sales dialer that runs in the browser, in the iOS and Android apps, and in the Chrome extension. Reps work a queue in progressive mode, where the next lead is dialed as soon as they are free, or in preview mode, where they review each lead before they call.',
      `Calls can be recorded and transcribed live, outcomes and callbacks are logged on the same screen, and caller ID rotation shows each lead a local number. There is no per-seat fee: the dialer is free for one person, and ${TEAM_PRICE} covers your whole team.`
    ],
    whoFor: [
      'SDR and BDR teams working lists every day',
      'Recruiters calling candidates and clients',
      'Agencies calling on behalf of clients',
      'Startups doing founder-led outbound'
    ],
    benefits: [
      'Less dialing, more talking: the next lead is ready when the rep is',
      'Local presence with caller ID rotation',
      'Calling windows and retry limits built into every campaign',
      'Do-not-call checks on every dial, manual or campaign',
      `Unlimited users on one ${TEAM_PRICE} plan`
    ],
    capabilitiesTitle: 'Everything a rep needs on one screen',
    capabilities: [
      {
        title: 'Progressive dialing',
        description:
          'The dialer calls the next lead as soon as the rep finishes the last one, and never assigns a lead to a rep who is still on a call.'
      },
      {
        title: 'Preview dialing',
        description:
          'Reps see the lead first and start the call when they are ready — the right mode for high-value accounts.'
      },
      {
        title: 'Local presence',
        description:
          'Caller ID rotation picks a number matched to the lead’s area code from a healthy pool, within daily caps per number.'
      },
      {
        title: 'Outcomes, notes and callbacks',
        description:
          'Log the result the moment the call ends, add notes, and schedule the callback without leaving the screen.'
      },
      {
        title: 'Recording and live transcription',
        description:
          'Record calls and get a real-time transcript — with or without keeping the audio.'
      },
      {
        title: 'Shared team campaigns',
        description:
          'One queue for the whole team. Each lead is claimed by exactly one rep and retried up to your attempt limit.'
      }
    ],
    howItWorksTitle: 'Start dialing in three steps',
    howItWorks: [
      {
        title: 'Load the list',
        description:
          'Import a CSV, add contacts, or bring in leads from Apollo or Prospeo.'
      },
      {
        title: 'Pick the mode',
        description:
          'Choose progressive for volume or preview for accounts that need a look first, and set the number or caller ID pool you call from.'
      },
      {
        title: 'Dial and log',
        description:
          'Reps work the queue from the browser or the apps, and every call, outcome and note lands in shared history and your connected CRM.'
      }
    ],
    sections: [
      {
        kind: 'table',
        id: 'dialer-types',
        title: 'Progressive, preview, power, predictive and parallel dialers',
        description:
          'Sales dialers come in five common modes. Here is how they differ and which ones Ringee supports.',
        columns: ['Mode', 'How it dials', 'In Ringee'],
        rows: [
          ['Preview', 'The rep reviews the lead, then starts the call', 'Yes'],
          [
            'Progressive',
            'Dials the next lead automatically as soon as the rep is free — one call per rep',
            'Yes'
          ],
          [
            'Power',
            'A common name for progressive dialing; some vendors also dial a few lines per rep',
            'Yes, as progressive: one line per rep'
          ],
          [
            'Predictive',
            'Dials more numbers than there are free reps, based on expected answer rates; answered calls can be dropped when no rep is free',
            'No'
          ],
          [
            'Parallel',
            'Dials several numbers at once for one rep and connects the first person who answers',
            'No'
          ]
        ],
        note: 'Ringee dials one lead per rep at a time, so the person who answers always reaches a rep who is ready. That avoids the dropped calls that predictive and parallel dialing can create.'
      },
      {
        kind: 'cards',
        id: 'compliance',
        title: 'Compliance built into the dialer',
        items: [
          {
            title: 'Calling windows',
            description:
              'Campaigns only dial inside the hours and days you set, in the time zone you choose — 8:00 to 21:00 by default.'
          },
          {
            title: 'Do-not-call lists',
            description:
              'Every dial checks your do-not-call list, and leads marked do-not-call leave the queue.'
          },
          {
            title: 'Retry limits',
            description:
              'A lead is retried up to your attempt limit — three by default — and then marked as exhausted.'
          },
          {
            title: 'Verified caller ID',
            description:
              'Reps call from numbers you own or have verified. An unverified number is never presented.'
          }
        ]
      }
    ],
    pricing: {
      title: 'Sales dialer pricing',
      body: [
        `Freelancer: $${PRICING.freelancer.price}/month for one person — the browser, app and Chrome extension dialer, recording, transcription, callbacks, meetings and CRM sync.`,
        `Organization: ${TEAM_PRICE} for the whole organization with unlimited users, adding shared calling campaigns and AI voice agents.`,
        `Calls are pay as you go from workspace credit, from ${CALL_RATE_FROM}/min. The rate for every country is on the phone numbers pages.`
      ]
    },
    related: [
      {
        name: 'Campaigns',
        href: '/features/campaigns',
        tagline: 'Progressive and preview calling campaigns for teams.'
      },
      {
        name: 'Caller ID rotation',
        href: '/features/caller-id-rotation',
        tagline: 'Local presence from a healthy pool of numbers.'
      },
      {
        name: 'AI SDR',
        href: '/ai-voice-agents/ai-sdr',
        tagline: 'Let an AI voice agent take the first-touch calls.'
      },
      {
        name: 'Call outcomes',
        href: '/features/call-outcomes',
        tagline: 'Log a result and notes on every call.'
      },
      {
        name: 'Call recording',
        href: '/features/call-recording',
        tagline: 'Record sales calls for coaching and review.'
      },
      {
        name: 'Bring your own carrier',
        href: '/byoc',
        tagline: 'Dial through the carrier and numbers you already have.'
      }
    ],
    cta: {
      title: 'Start dialing today',
      description:
        'Free for one person. One flat price for your whole team, with pay-as-you-go calling.'
    },
    faqs: [
      {
        question: 'What is a sales dialer?',
        answer:
          'A sales dialer is software that places outbound calls for sales reps, so they spend their time talking instead of typing numbers. Ringee’s runs in the browser and the apps, with progressive and preview modes, local presence, and call logging built in.'
      },
      {
        question:
          'What is the difference between a progressive and a predictive dialer?',
        answer:
          'A progressive dialer calls one lead per rep, and only when that rep is free. A predictive dialer calls more numbers than there are free reps and bets on how many will answer, so some answered calls can be dropped. Ringee uses progressive and preview dialing.'
      },
      {
        question: 'Is a power dialer the same as a progressive dialer?',
        answer:
          'Mostly. “Power dialer” is a common name for automatic one-after-another dialing. In Ringee that is progressive mode: the next lead is dialed as soon as the rep is ready.'
      },
      {
        question: 'Is there a free sales dialer?',
        answer:
          'Yes. The Freelancer plan is free for one person: manual dialing from the browser, the Chrome extension and the apps, plus call sessions — contact queues you can work in progressive or preview mode, created from ChatGPT, Claude, the CLI or the API. Shared team campaigns need the Organization plan.'
      },
      {
        question: 'Does the dialer work with my CRM?',
        answer:
          'Ringee syncs calls and outcomes with Attio and Odoo, pulls leads from Apollo and Prospeo, and sends signed webhooks through the Custom Integrations API for anything else.'
      },
      {
        question: 'Can reps call internationally?',
        answer: `Yes. Reps can call more than 180 countries from the browser, and you can buy local, toll-free or mobile numbers in ${COUNTRY_COUNT} countries.`
      }
    ]
  },
  {
    slug: 'byoc',
    path: '/byoc',
    name: 'Bring your own carrier',
    eyebrow: 'Bring your own carrier',
    tagline:
      'Keep your numbers and your carrier. Connect them to Ringee over SIP and add its dialer on top.',
    metaTitle: 'Bring Your Own Carrier (BYOC) — Keep Your Numbers | Ringee',
    metaDescription:
      'Connect your SIP carrier or PBX to Ringee and keep your numbers, contract and rates. Your team calls through your carrier from the browser. No porting.',
    h1: 'Bring your own carrier and keep your phone numbers',
    intro: [
      'Moving to a new calling platform usually means porting your numbers and leaving your carrier. With Ringee you can skip both. Connect your carrier or PBX as a SIP extension and your numbers keep working where they are, with Ringee’s dialer and call history on top.',
      'Ringee registers to your PBX as an extension, using the SIP settings you enter. Your reps call from the browser through your carrier, and the PBX presents the caller ID you already use. Calls to your numbers can be routed into Ringee to a teammate, a ring group, an extension or a desk phone.'
    ],
    whoFor: [
      'Companies with numbers and contracts they cannot move',
      'Teams that already run a PBX and want a better dialer',
      'Businesses whose carrier rates beat any reseller’s',
      'Agencies calling from clients’ own carriers'
    ],
    benefits: [
      'No porting: your numbers never leave your carrier',
      'Keep your contract, your rates and your caller ID',
      'Live as soon as the extension registers — no porting window',
      'Your calls land in the same Ringee history as every other call',
      'Disconnect the extension at any time; nothing moved'
    ],
    capabilitiesTitle: 'What you get when you bring your carrier',
    capabilities: [
      {
        title: 'Outbound through your carrier',
        description:
          'Reps dial from the Ringee browser dialer and the call leaves through your PBX, which presents the caller ID configured for the extension.'
      },
      {
        title: 'Inbound routing in Ringee',
        description:
          'Route calls to your numbers to a teammate, a ring group, an internal extension or a desk phone registered in Ringee.'
      },
      {
        title: 'Your numbers, one route each',
        description:
          'Attach the numbers your PBX handles to the extension that carries them, and give each number its own inbound route.'
      },
      {
        title: 'Registration status',
        description:
          'Ringee shows whether the extension is registered with your PBX, so a wrong password or host shows up before anyone tries to call.'
      },
      {
        title: 'Credentials handled for you',
        description:
          'You enter only your carrier’s settings. Ringee encrypts the SIP password and configures everything else on its side.'
      },
      {
        title: 'Only Ringee can dial your PBX',
        description:
          'Every outbound call to your carrier must carry a short-lived token signed by Ringee, so nobody else can route calls through your trunk.'
      }
    ],
    howItWorksTitle: 'Connect your carrier in three steps',
    howItWorks: [
      {
        title: 'Create the extension',
        description:
          'In your PBX or carrier portal, create a SIP extension (username, password and host) for Ringee.'
      },
      {
        title: 'Enter it in Ringee',
        description:
          'Add the carrier settings in your organization, attach the numbers that extension handles, and watch it register.'
      },
      {
        title: 'Call and route',
        description:
          'Reps start calling from the browser dialer, and you choose where calls to each number ring in Ringee.'
      }
    ],
    sections: [
      {
        kind: 'table',
        id: 'byoc-vs-porting',
        title: 'Bring your own carrier or port your numbers?',
        description:
          'Both put your numbers in Ringee. They differ in who keeps the numbers and what changes on day one.',
        columns: ['', 'Bring your own carrier', 'Port your numbers'],
        rows: [
          [
            'Where the numbers live',
            'Stay with your current carrier',
            'Move to the new provider'
          ],
          [
            'Contract and rates',
            'Keep your carrier contract and rates',
            'Replaced by the new provider’s'
          ],
          [
            'Time to go live',
            'As soon as the SIP extension registers',
            'Days to weeks, depending on the carriers'
          ],
          [
            'Going back',
            'Disconnect the extension',
            'Port the numbers out again'
          ],
          [
            'Caller ID',
            'The one your PBX already presents',
            'The ported number'
          ]
        ]
      }
    ],
    pricing: {
      title: 'What bringing your carrier costs',
      body: [
        `Bring your own carrier is part of the Organization plan: ${TEAM_PRICE} for the whole organization, with unlimited users.`,
        'Your carrier keeps billing the phone minutes under your current contract. Ringee bills its own per-call usage from workspace credit, like any other call.'
      ]
    },
    related: [
      {
        name: 'Sales dialer',
        href: '/sales-dialer',
        tagline: 'Progressive and preview dialing in the browser and the apps.'
      },
      {
        name: 'Phone numbers by country',
        href: '/phone-numbers',
        tagline: `Or buy local, toll-free and mobile numbers in ${COUNTRY_COUNT} countries.`
      },
      {
        name: 'Custom caller ID',
        href: '/features/caller-id',
        tagline: 'Verify a number you own and call from it.'
      },
      {
        name: 'Self-hosted',
        href: '/self-hosted',
        tagline: 'Run the whole stack on your own infrastructure.'
      }
    ],
    cta: {
      title: 'Keep your carrier. Upgrade your calling.',
      description:
        'Connect your PBX as a SIP extension and give your team Ringee’s dialer without porting a number.'
    },
    faqs: [
      {
        question: 'What does bring your own carrier (BYOC) mean?',
        answer:
          'BYOC means you keep your existing phone carrier and numbers and connect them to a new calling platform, instead of porting the numbers to that platform. In Ringee you connect your carrier or PBX as a SIP extension.'
      },
      {
        question: 'Do I have to port my numbers to Ringee?',
        answer:
          'No. With BYOC your numbers stay with your carrier. You can also buy new numbers in Ringee or verify a number you own as a caller ID — whichever fits each number.'
      },
      {
        question: 'Which carriers and PBXs work?',
        answer:
          'Any carrier or PBX that lets you create a SIP extension that registers with a username and password. Ringee registers to it like a desk phone would.'
      },
      {
        question: 'What caller ID do people see?',
        answer:
          'The caller ID your PBX presents for that extension. Ringee does not add its own identity to calls that go out through your carrier.'
      },
      {
        question: 'Which plan do I need?',
        answer: `Bring your own carrier is available to organizations on the Organization plan, ${TEAM_PRICE} with unlimited users.`
      }
    ]
  }
];

const SOLUTION_BY_SLUG = new Map(SOLUTIONS.map((s) => [s.slug, s]));

export function getSolution(slug: string): SolutionContent | undefined {
  return SOLUTION_BY_SLUG.get(slug);
}

/** For pages with a fixed route: a missing entry fails the build, not a visit. */
export function requireSolution(slug: string): SolutionContent {
  const solution = SOLUTION_BY_SLUG.get(slug);
  if (!solution) throw new Error(`Unknown solution page: ${slug}`);
  return solution;
}

/** The solutions that live under the AI Voice Agents hub. */
export const AI_VOICE_AGENT_SOLUTIONS = SOLUTIONS.filter(
  (solution) => solution.parent?.href === '/ai-voice-agents'
);
