import {
  Bot,
  Building2,
  CalendarCheck,
  Database,
  type LucideIcon,
  Sparkles,
  Target,
  Terminal,
  UserSearch,
  Workflow
} from 'lucide-react';

import type { Faq } from '../components/faq';

export type IntegrationCategory =
  | 'Lead sources'
  | 'CRMs'
  | 'Calendar'
  | 'AI tools';

export type IntegrationContent = {
  slug: string;
  name: string;
  category: IntegrationCategory;
  icon: LucideIcon;
  tagline: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string[];
  /** What the integration enables. */
  enables: string[];
  /** Example outbound workflow, step by step. */
  workflow: string[];
  benefits: string[];
  /** Slugs of related integrations. */
  related: string[];
  faqs: Faq[];
};

export type IntegrationCategoryMeta = {
  name: IntegrationCategory;
  blurb: string;
  icon: LucideIcon;
};

export const INTEGRATION_CATEGORIES: IntegrationCategoryMeta[] = [
  {
    name: 'Lead sources',
    blurb: 'Find and enrich leads, then pull them straight into Ringee.',
    icon: UserSearch
  },
  {
    name: 'CRMs',
    blurb: 'Keep your system of record in sync with every call.',
    icon: Database
  },
  {
    name: 'Calendar',
    blurb: 'Connect Google Calendar and book meetings straight from a call.',
    icon: CalendarCheck
  },
  {
    name: 'AI tools',
    blurb: 'Drive outbound from ChatGPT, Claude, MCP agents, and the CLI.',
    icon: Sparkles
  }
];

export const INTEGRATIONS: IntegrationContent[] = [
  {
    slug: 'apollo',
    name: 'Apollo',
    category: 'Lead sources',
    icon: Target,
    tagline: 'Find and enrich leads in Apollo, then import them to call.',
    metaTitle: 'Apollo Integration | Ringee',
    metaDescription:
      'Connect Apollo to Ringee. Search and enrich leads, import them as contacts, and start calling — without retyping data between tools.',
    h1: 'Apollo + Ringee: from lead search to live call',
    intro: [
      'Apollo is where many outbound teams find their leads. Ringee connects to Apollo as an enrichment provider so you can search for prospects, reveal their details, and bring them into Ringee as contacts you can call.',
      'Because reveal and import actions consume credits, Ringee confirms before any mass action — so you stay in control of spend.'
    ],
    enables: [
      'Search for leads using your Apollo data',
      'Reveal contact details for the right prospects',
      'Import leads into Ringee as ready-to-call contacts',
      'Skip manual copy-paste between Apollo and your dialer'
    ],
    workflow: [
      'Search for prospects that match your target profile.',
      'Reveal the leads you want to pursue.',
      'Import them into Ringee as contacts.',
      'Add them to a campaign and start dialing.',
      'Log outcomes and schedule callbacks as you go.'
    ],
    benefits: [
      'Go from prospect search to live call in one flow',
      'No manual data entry between tools',
      'Credit-spend confirmation before bulk reveals',
      'Clean contact records ready for campaigns'
    ],
    related: ['prospeo', 'attio', 'chatgpt'],
    faqs: [
      {
        question: 'Does importing leads cost credits?',
        answer:
          'Revealing and importing leads consumes enrichment credits. Ringee asks you to confirm before any mass reveal or import.'
      },
      {
        question: 'Are imported leads the same as contacts?',
        answer:
          'Leads become Ringee contacts once you import them. Until then they are search results, not callable contacts.'
      }
    ]
  },
  {
    slug: 'prospeo',
    name: 'Prospeo',
    category: 'Lead sources',
    icon: UserSearch,
    tagline: 'Enrich and reveal lead details with Prospeo, then call them.',
    metaTitle: 'Prospeo Integration | Ringee',
    metaDescription:
      'Use Prospeo as your enrichment provider in Ringee. Find leads, reveal verified details, and import them as contacts ready to call.',
    h1: 'Prospeo + Ringee: enriched leads, ready to call',
    intro: [
      'Prospeo helps you find and verify contact details. Connect it as your Ringee enrichment provider to search for leads, reveal their details, and import them as contacts you can immediately add to a campaign.',
      'Reveal and import consume credits, so Ringee confirms before any bulk action to keep your spend predictable.'
    ],
    enables: [
      'Search leads through your Prospeo connection',
      'Reveal verified contact details',
      'Import leads to Ringee as callable contacts',
      'Feed campaigns without leaving Ringee'
    ],
    workflow: [
      'Search for the leads you want using Prospeo.',
      'Reveal the details for your best-fit prospects.',
      'Import them into Ringee as contacts.',
      'Queue them in a campaign and start calling.',
      'Capture outcomes and book follow-ups.'
    ],
    benefits: [
      'Verified lead details flow straight into calling',
      'One connected provider, no copy-paste',
      'Spend confirmation before bulk reveals',
      'Contacts ready for campaigns instantly'
    ],
    related: ['apollo', 'odoo', 'claude'],
    faqs: [
      {
        question: 'Can I use Apollo and Prospeo together?',
        answer:
          'Ringee uses your connected enrichment provider for lead search and reveal. You choose which provider powers your prospecting.'
      },
      {
        question: 'What happens to revealed leads?',
        answer:
          'You import them into Ringee as contacts, where they can join campaigns and receive calls, callbacks, and outcomes.'
      }
    ]
  },
  {
    slug: 'attio',
    name: 'Attio',
    category: 'CRMs',
    icon: Database,
    tagline: 'Sync calls, outcomes, and notes to your Attio records.',
    metaTitle: 'Attio Integration | Ringee',
    metaDescription:
      'Connect Attio to Ringee to keep call activity, outcomes, and notes in sync with your CRM records — no manual data entry after calls.',
    h1: 'Attio + Ringee: calling that keeps your CRM current',
    intro: [
      'Attio is the system of record for many modern sales teams. Ringee connects to Attio so the calls you make, the outcomes you log, and the notes you take are reflected against the matching record.',
      'Your reps keep calling from Ringee while your Attio workspace stays an accurate picture of your outbound activity.'
    ],
    enables: [
      'Reflect call activity against Attio records',
      'Keep outcomes and notes aligned with your CRM',
      'Reduce manual updates after every call',
      'Give the team one trustworthy activity timeline'
    ],
    workflow: [
      'Connect Ringee to your Attio workspace.',
      'Call your contacts from Ringee as usual.',
      'Log outcomes and notes on each call.',
      'See the activity reflected against the Attio record.',
      'Report on outbound effort from data you trust.'
    ],
    benefits: [
      'Less manual CRM updating',
      'Accurate activity history in Attio',
      'Calls and outcomes in one timeline',
      'Cleaner pipeline reporting'
    ],
    related: ['odoo', 'apollo', 'mcp'],
    faqs: [
      {
        question: 'What gets synced to Attio?',
        answer:
          'Call activity, outcomes, and notes can be reflected against the matching contact so Attio mirrors your outbound work.'
      },
      {
        question: 'Do I still call from Ringee?',
        answer:
          'Yes. You place calls in Ringee and the activity flows to Attio — you do not need to dial from inside the CRM.'
      }
    ]
  },
  {
    slug: 'odoo',
    name: 'Odoo',
    category: 'CRMs',
    icon: Building2,
    tagline: 'Connect Odoo so your calling activity lands in your CRM.',
    metaTitle: 'Odoo Integration | Ringee',
    metaDescription:
      'Integrate Odoo with Ringee to keep call activity, outcomes, and notes in sync with your CRM — so outbound work shows up where your team operates.',
    h1: 'Odoo + Ringee: outbound activity in your CRM',
    intro: [
      'Odoo runs the business for many teams. Ringee connects to Odoo so your outbound calls, outcomes, and notes are reflected against the right records, keeping your CRM aligned with what your reps actually do.',
      'Call from Ringee, and let the activity flow back to Odoo instead of updating two systems by hand.'
    ],
    enables: [
      'Reflect Ringee call activity in Odoo',
      'Keep outcomes and notes with the CRM record',
      'Cut down on duplicate data entry',
      'Maintain one accurate activity history'
    ],
    workflow: [
      'Connect Ringee to your Odoo instance.',
      'Call your contacts from Ringee.',
      'Log outcomes and notes per call.',
      'Activity is reflected against the Odoo record.',
      'Track outbound performance with confidence.'
    ],
    benefits: [
      'No double entry across systems',
      'Up-to-date activity in Odoo',
      'Unified call and CRM timeline',
      'Reliable reporting data'
    ],
    related: ['attio', 'prospeo', 'cli'],
    faqs: [
      {
        question: 'Which Odoo data does Ringee touch?',
        answer:
          'Ringee reflects call activity, outcomes, and notes against the matching contact so your outbound work appears in Odoo.'
      },
      {
        question: 'Can self-hosted Ringee connect to Odoo?',
        answer:
          'Self-hosting gives you full control of your deployment and its connections, including a CRM like Odoo.'
      }
    ]
  },
  {
    slug: 'google-calendar',
    name: 'Google Calendar',
    category: 'Calendar',
    icon: CalendarCheck,
    tagline:
      'Book meetings from a call and sync them to Google Calendar automatically.',
    metaTitle: 'Google Calendar Integration | Ringee',
    metaDescription:
      'Connect Google Calendar to Ringee to schedule meetings from a call and keep them in sync automatically — no copy-paste between your dialer and your calendar.',
    h1: 'Google Calendar + Ringee: book the meeting on the call',
    intro: [
      'Most outbound calls aim at one thing: the next meeting. Connect Google Calendar to Ringee and you can book that meeting while you are still on the call — Ringee creates the event and keeps it in sync on your calendar automatically.',
      'Because Ringee exposes meeting scheduling through its MCP tools, your AI agent can book meetings too. Ask ChatGPT or Claude to schedule the next step and it lands on your Google Calendar like any meeting you booked yourself.'
    ],
    enables: [
      'Schedule meetings from Ringee without leaving a call',
      'Sync booked meetings to Google Calendar automatically',
      'Let AI agents schedule meetings through MCP',
      'Keep contact and call context attached to each meeting'
    ],
    workflow: [
      'Connect your Google Calendar to Ringee.',
      'Call your contact as usual.',
      'When they agree to meet, schedule it on the call.',
      'The meeting syncs to your Google Calendar automatically.',
      'Your AI agent can book follow-up meetings the same way.'
    ],
    benefits: [
      'Turn calls into booked meetings in seconds',
      'No copy-paste between dialer and calendar',
      'AI-assisted scheduling through MCP',
      'One source of truth for your day'
    ],
    related: ['chatgpt', 'claude', 'mcp'],
    faqs: [
      {
        question: 'Which calendar providers are supported?',
        answer:
          'Ringee connects to Google Calendar. Once linked, meetings you book in Ringee are created and kept in sync there automatically.'
      },
      {
        question: 'Can AI agents schedule meetings?',
        answer:
          'Yes. Ringee exposes meeting scheduling over MCP, so ChatGPT, Claude, or any MCP-compatible agent can book a meeting that syncs to your Google Calendar.'
      }
    ]
  },
  {
    slug: 'chatgpt',
    name: 'ChatGPT',
    category: 'AI tools',
    icon: Sparkles,
    tagline: 'Run outbound prep and follow-up from inside ChatGPT.',
    metaTitle: 'ChatGPT Integration | Ringee',
    metaDescription:
      'Use ChatGPT to drive Ringee outbound workflows — prospect, import leads, start calls, log outcomes, and schedule follow-ups through Ringee’s MCP tools.',
    h1: 'ChatGPT + Ringee: outbound from a conversation',
    intro: [
      'Ringee exposes its outbound workflow through an MCP server, which means ChatGPT can use Ringee’s tools directly. Ask it to find leads, build a list, start a call, or schedule a follow-up — it does the prep so you can focus on the conversation.',
      'Calls are sent to your active device for a human to take, and sensitive actions are guarded, so AI speeds up the busywork without taking over the relationship.'
    ],
    enables: [
      'Prospect and import leads from a chat',
      'Create and update contacts by asking',
      'Start calls that ring your device',
      'Log outcomes and book callbacks and meetings'
    ],
    workflow: [
      'Ask ChatGPT to find leads that match your target.',
      'Have it import the best fits as Ringee contacts.',
      'Tell it to start a call — Ringee rings your device.',
      'Take the conversation yourself.',
      'Ask ChatGPT to log the outcome and schedule a callback.'
    ],
    benefits: [
      'Less clicking through screens',
      'Outbound prep happens in your chat',
      'Humans stay on every call',
      'Guardrails on credit-spend and destructive actions'
    ],
    related: ['claude', 'mcp', 'apollo'],
    faqs: [
      {
        question: 'Does ChatGPT make calls on its own?',
        answer:
          'No. It prepares the work and starts a call that rings your active device. A person always takes the conversation.'
      },
      {
        question: 'How is this connected?',
        answer:
          'Ringee provides an MCP server. ChatGPT uses those tools to read and act on your Ringee data within the guardrails Ringee enforces.'
      }
    ]
  },
  {
    slug: 'claude',
    name: 'Claude',
    category: 'AI tools',
    icon: Bot,
    tagline: 'Use Claude to prospect, call, and follow up through Ringee.',
    metaTitle: 'Claude Integration | Ringee',
    metaDescription:
      'Connect Claude to Ringee through MCP. Prospect leads, manage contacts, start calls, log outcomes, and schedule follow-ups from a Claude conversation.',
    h1: 'Claude + Ringee: an AI co-pilot for outbound',
    intro: [
      'Claude can drive Ringee through the same MCP server, with safety rules for sensitive operations. Ask Claude to research and import leads, queue a calling session, or handle the follow-up, and it uses Ringee’s tools to get it done.',
      'The calls still come to you. Claude handles the repetitive prep and the after-call admin so your team spends more time talking to people.'
    ],
    enables: [
      'Search and import leads into Ringee',
      'Create call sessions and shareable dialer links',
      'Start calls that ring your device',
      'Log outcomes and schedule callbacks and meetings'
    ],
    workflow: [
      'Give Claude your outbound goal for the day.',
      'It builds a contact list from your lead source.',
      'It queues a calling session for you to work.',
      'You make the calls; Claude logs each outcome.',
      'It schedules the right follow-up for every lead.'
    ],
    benefits: [
      'Hands-off prospecting and admin',
      'Safety rules on destructive and sensitive actions',
      'Works alongside your existing workflow',
      'Keeps the human on every conversation'
    ],
    related: ['chatgpt', 'mcp', 'cli'],
    faqs: [
      {
        question: 'What are the safety rules?',
        answer:
          'Ringee guards sensitive actions — like spending credits or revoking dialer links — and requires explicit confirmation before destructive actions such as deleting a contact.'
      },
      {
        question: 'Do I need to write code?',
        answer:
          'No. Claude connects to Ringee’s MCP server and uses its tools through conversation. Developers can also script workflows if they prefer.'
      }
    ]
  },
  {
    slug: 'mcp',
    name: 'MCP',
    category: 'AI tools',
    icon: Workflow,
    tagline: 'Connect any MCP-compatible agent to Ringee’s outbound toolset.',
    metaTitle: 'MCP Integration for AI Agents | Ringee',
    metaDescription:
      'Ringee ships an MCP server so any MCP-compatible agent can prospect, manage contacts, start calls, and schedule follow-ups with built-in safety guardrails.',
    h1: 'MCP: connect any agent to Ringee',
    intro: [
      'The Model Context Protocol (MCP) is an open standard for giving AI agents tools. Ringee provides an MCP server, so any MCP-compatible agent — not just ChatGPT or Claude — can read and act on your Ringee data.',
      'Agents can search and import leads, manage contacts, create call sessions, start calls, log outcomes, and schedule callbacks and meetings, all within Ringee’s safety rules for sensitive and destructive actions.'
    ],
    enables: [
      'Standard tool access for any MCP agent',
      'Lead prospecting, reveal, and import',
      'Contact, call session, and callback management',
      'Outcome logging and meeting scheduling'
    ],
    workflow: [
      'Point your MCP-compatible agent at Ringee’s MCP server.',
      'The agent discovers Ringee’s outbound tools.',
      'It runs your workflow — prospect, queue, call, log.',
      'Ringee enforces confirmation on sensitive steps.',
      'Your team takes the calls and reviews results.'
    ],
    benefits: [
      'No vendor lock-in — use any MCP agent',
      'One toolset for the whole outbound flow',
      'Guardrails built into the protocol layer',
      'A foundation for custom automation'
    ],
    related: ['cli', 'chatgpt', 'claude'],
    faqs: [
      {
        question: 'What is MCP?',
        answer:
          'MCP (Model Context Protocol) is an open standard that lets AI agents securely use external tools. Ringee implements an MCP server for its outbound workflow.'
      },
      {
        question: 'Which agents can connect?',
        answer:
          'Any MCP-compatible client — including ChatGPT, Claude, and custom agents — can use Ringee’s MCP tools.'
      }
    ]
  },
  {
    slug: 'cli',
    name: 'CLI',
    category: 'AI tools',
    icon: Terminal,
    tagline:
      'Script outbound workflows from your terminal and developer tooling.',
    metaTitle: 'CLI Workflows | Ringee',
    metaDescription:
      'Drive Ringee outbound workflows from the command line. Script prospecting, contact management, and follow-ups for repeatable, developer-friendly automation.',
    h1: 'CLI workflows for developer-driven outbound',
    intro: [
      'Ringee is built to be automated, not just clicked. Its MCP-based tooling lets you drive outbound workflows from the command line, your own scripts, and AI automation frameworks — ideal for developers and technical operators who want repeatable, version-controlled automation.',
      'Wire Ringee into the agents and tools you already run so prospecting, contact management, meeting scheduling, and follow-up become part of your normal developer workflow.'
    ],
    enables: [
      'Run outbound tasks from the terminal',
      'Script repeatable prospecting and follow-up',
      'Automate contact and call session management',
      'Build Ringee into your own tooling'
    ],
    workflow: [
      'Connect your CLI workflow to Ringee’s tools.',
      'Script the prospecting and list-building steps.',
      'Queue calling sessions programmatically.',
      'Your team works the queue and logs outcomes.',
      'Automate the follow-up and reporting steps.'
    ],
    benefits: [
      'Repeatable, version-controllable automation',
      'Fits developer and technical workflows',
      'Same safety guardrails as other agents',
      'A scriptable foundation for outbound ops'
    ],
    related: ['mcp', 'claude', 'odoo'],
    faqs: [
      {
        question: 'Is the CLI for developers only?',
        answer:
          'CLI workflows are aimed at developers and technical operators. Non-technical users can get the same automation through ChatGPT or Claude.'
      },
      {
        question: 'What can I automate from the CLI?',
        answer:
          'The same outbound toolset available over MCP — prospecting, contacts, call sessions, outcomes, and follow-ups.'
      }
    ]
  }
];

const INTEGRATION_BY_SLUG = new Map(INTEGRATIONS.map((i) => [i.slug, i]));

export function getIntegration(slug: string): IntegrationContent | undefined {
  return INTEGRATION_BY_SLUG.get(slug);
}

export function integrationsByCategory(
  category: IntegrationCategory
): IntegrationContent[] {
  return INTEGRATIONS.filter((i) => i.category === category);
}
