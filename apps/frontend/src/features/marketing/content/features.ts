import {
  Bot,
  CalendarClock,
  ClipboardList,
  type LucideIcon,
  Megaphone,
  Mic,
  PhoneOutgoing,
  RefreshCw,
  Waypoints
} from 'lucide-react';

import type { Faq } from '../components/faq';

export type FeatureCategory =
  | 'Communicate'
  | 'Record & Learn'
  | 'Automate'
  | 'Sync'
  | 'Control';

export type FeatureContent = {
  slug: string;
  name: string;
  category: FeatureCategory;
  icon: LucideIcon;
  /** One-line description used on cards and in the catalog. */
  tagline: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  /** Lead paragraphs explaining the feature. */
  intro: string[];
  whoFor: string[];
  howItWorks: { title: string; description: string }[];
  benefits: string[];
  /** Slugs of related features. */
  related: string[];
  faqs: Faq[];
};

export type CategoryMeta = {
  name: FeatureCategory;
  blurb: string;
  icon: LucideIcon;
};

export const FEATURE_CATEGORIES: CategoryMeta[] = [
  {
    name: 'Communicate',
    blurb: 'Calls, campaigns, outcomes, notes, and callbacks.',
    icon: PhoneOutgoing
  },
  {
    name: 'Record & Learn',
    blurb: 'Record calls, transcribe conversations, and review history.',
    icon: Mic
  },
  {
    name: 'Automate',
    blurb:
      'Use ChatGPT, Claude, MCP-compatible agents, and CLI workflows to automate outbound.',
    icon: Bot
  },
  {
    name: 'Sync',
    blurb: 'Connect Ringee with Apollo, Prospeo, Attio, Odoo, and CRM workflows.',
    icon: RefreshCw
  },
  {
    name: 'Control',
    blurb: 'Manage teams, credits, recording settings, security, and hosting.',
    icon: Waypoints
  }
];

export const FEATURES: FeatureContent[] = [
  {
    slug: 'outbound-calling',
    name: 'Outbound calling',
    category: 'Communicate',
    icon: PhoneOutgoing,
    tagline:
      'Call leads worldwide straight from your browser or the iOS app — no hardware, no desk phone.',
    metaTitle: 'Outbound Calling Software | Ringee',
    metaDescription:
      'Make outbound calls to leads worldwide from your browser or iOS app. Ringee gives outbound teams a fast dialer, call notes, and outcomes without per-seat pricing.',
    h1: 'Outbound calling software built for volume',
    intro: [
      'Ringee turns any browser into an outbound calling station. Open the dialer, work through your list, and place clear calls to leads in over 180 countries — no desk phone, SIP handset, or extra hardware required.',
      'Every call is connected through Telnyx, so audio quality stays high and you only pay for the minutes you use. Calling credits are billed separately from your subscription, which keeps your seat cost flat as your team grows.'
    ],
    whoFor: [
      'SDR and BDR teams running daily outbound dials',
      'Recruiters working candidate and client lists',
      'Agencies and freelancers calling on behalf of clients',
      'Founders and startups doing early outbound sales'
    ],
    howItWorks: [
      {
        title: 'Open the dialer',
        description:
          'Launch Ringee in your browser or the iOS app and pick the number you want to call from.'
      },
      {
        title: 'Work your list',
        description:
          'Dial contacts manually or run a campaign that queues your leads so you move from one call to the next without retyping numbers.'
      },
      {
        title: 'Log the result',
        description:
          'Capture the outcome, add a note, and schedule a callback in the same screen the moment the call ends.'
      }
    ],
    benefits: [
      'Call from anywhere with just a browser or your phone',
      'Flat per-organization pricing with unlimited users',
      'Calling credits billed separately so you only pay for minutes',
      'Notes, outcomes, and callbacks captured inline'
    ],
    related: ['campaigns', 'call-outcomes', 'callbacks', 'crm-sync'],
    faqs: [
      {
        question: 'Do I need any special hardware to make calls?',
        answer:
          'No. Ringee runs in your browser and on the iOS app. A laptop with a headset is enough to start calling.'
      },
      {
        question: 'How is calling billed?',
        answer:
          'Your subscription is a flat price per organization. Calling minutes are paid separately as credits, so you only pay for the calls you actually place.'
      },
      {
        question: 'Which countries can I call?',
        answer:
          'Ringee connects calls through Telnyx and supports outbound calling to more than 180 countries. Per-minute rates vary by destination.'
      }
    ]
  },
  {
    slug: 'campaigns',
    name: 'Campaigns',
    category: 'Communicate',
    icon: Megaphone,
    tagline:
      'Group leads into focused calling campaigns and work the queue end to end.',
    metaTitle: 'Outbound Calling Campaigns | Ringee',
    metaDescription:
      'Organize leads into outbound calling campaigns. Ringee queues contacts, tracks progress, and keeps notes and outcomes attached to every call.',
    h1: 'Run focused outbound calling campaigns',
    intro: [
      'Campaigns let you group a set of leads into a single, ordered calling queue. Instead of hunting for the next number, your reps press call and keep moving — Ringee serves the next contact automatically.',
      'Each campaign keeps its own list, notes, outcomes, and progress, so you can see how a push is performing and where calls are landing.'
    ],
    whoFor: [
      'SDR teams running outbound sequences',
      'Agencies executing client calling projects',
      'Recruiters working a role-specific shortlist',
      'Anyone who needs to call a defined list quickly'
    ],
    howItWorks: [
      {
        title: 'Build a list',
        description:
          'Import contacts or pull them from a connected lead source, then assign them to a campaign.'
      },
      {
        title: 'Dial the queue',
        description:
          'Reps work through the campaign one contact at a time, with the lead context in front of them on every call.'
      },
      {
        title: 'Track outcomes',
        description:
          'Outcomes and notes roll up to the campaign so you can see connects, callbacks, and conversions in one place.'
      }
    ],
    benefits: [
      'Keep reps dialing instead of searching for numbers',
      'See progress and outcomes per campaign',
      'Reuse lists across follow-up rounds',
      'Attach every note and result to the right campaign'
    ],
    related: ['outbound-calling', 'call-outcomes', 'callbacks', 'crm-sync'],
    faqs: [
      {
        question: 'How do leads get into a campaign?',
        answer:
          'Import them from a CSV, add contacts manually, or bring them in from a connected lead source such as Apollo or Prospeo.'
      },
      {
        question: 'Can multiple reps work the same campaign?',
        answer:
          'Yes. Because every plan supports unlimited users on the Organization plan, your whole team can work shared campaigns.'
      }
    ]
  },
  {
    slug: 'call-outcomes',
    name: 'Call outcomes',
    category: 'Communicate',
    icon: ClipboardList,
    tagline:
      'Log how each call went and capture notes the moment you hang up.',
    metaTitle: 'Call Outcomes & Notes Tracking | Ringee',
    metaDescription:
      'Track call outcomes and notes in Ringee. Record how every outbound call went, capture context, and feed clean activity data into your CRM.',
    h1: 'Track call outcomes and notes',
    intro: [
      'Every call needs a result. Ringee lets you log the outcome — connected, no answer, callback, not interested, converted, and more — the moment the call ends, while the conversation is still fresh.',
      'Outcomes pair with free-text notes, so the next person to touch the lead has the full picture. That clean activity history is what makes follow-up, reporting, and CRM sync reliable.'
    ],
    whoFor: [
      'Sales managers who need accurate pipeline data',
      'Reps who want fast, consistent disposition',
      'Agencies reporting activity back to clients',
      'Teams that sync call activity to a CRM'
    ],
    howItWorks: [
      {
        title: 'Pick an outcome',
        description:
          'Choose from the outcome options as soon as the call ends — it takes one tap.'
      },
      {
        title: 'Add a note',
        description:
          'Capture what was said, objections raised, or the next step to take.'
      },
      {
        title: 'Use it everywhere',
        description:
          'Outcomes drive callbacks, reporting, and CRM activity sync so nothing slips.'
      }
    ],
    benefits: [
      'Consistent disposition across the whole team',
      'Notes stay attached to the contact and call',
      'Cleaner reporting and forecasting',
      'Reliable data to push into your CRM'
    ],
    related: ['callbacks', 'campaigns', 'crm-sync', 'call-transcription'],
    faqs: [
      {
        question: 'Can I add notes during a call?',
        answer:
          'Yes. You can take notes while the call is live and finalize the outcome the moment you hang up.'
      },
      {
        question: 'Do outcomes sync to my CRM?',
        answer:
          'When you connect a CRM such as Attio or Odoo, call activity and outcomes can be reflected against the matching record.'
      }
    ]
  },
  {
    slug: 'callbacks',
    name: 'Callbacks',
    category: 'Communicate',
    icon: CalendarClock,
    tagline:
      'Schedule the next call without leaving the conversation — and never lose a follow-up.',
    metaTitle: 'Callback Scheduling for Outbound Teams | Ringee',
    metaDescription:
      'Schedule callbacks in Ringee so no follow-up slips. Set a time the moment a call ends and keep your outbound pipeline moving.',
    h1: 'Schedule callbacks that never slip',
    intro: [
      'Most outbound deals are won on the follow-up, not the first call. Ringee lets you schedule a callback the instant a call ends, so the next touch is locked in before you move to the next lead.',
      'Callbacks stay tied to the contact and surface when it is time to dial again, keeping your pipeline moving without spreadsheets or reminders scattered across other tools.'
    ],
    whoFor: [
      'SDRs juggling dozens of open conversations',
      'Recruiters coordinating candidate timing',
      'Freelancers managing their own follow-up',
      'Any team that lives on the follow-up'
    ],
    howItWorks: [
      {
        title: 'Set it on the call',
        description:
          'When a lead says "call me later," schedule the callback before you hang up.'
      },
      {
        title: 'Get it back at the right time',
        description:
          'The callback resurfaces when it is due so the follow-up is never forgotten.'
      },
      {
        title: 'Dial and disposition',
        description:
          'Call straight from the callback, log the new outcome, and schedule the next step if needed.'
      }
    ],
    benefits: [
      'Lock in follow-ups before they slip',
      'Keep callbacks tied to the right contact',
      'Reduce no-shows and dropped deals',
      'Less manual reminder management'
    ],
    related: ['call-outcomes', 'outbound-calling', 'campaigns', 'crm-sync'],
    faqs: [
      {
        question: 'What happens when a callback is due?',
        answer:
          'It resurfaces so the right rep can dial the contact at the scheduled time, with the previous notes and outcome in view.'
      },
      {
        question: 'Can I reschedule a callback?',
        answer:
          'Yes. If a lead asks for a different time, update the callback and it moves with the contact.'
      }
    ]
  },
  {
    slug: 'call-recording',
    name: 'Call recording',
    category: 'Record & Learn',
    icon: Mic,
    tagline:
      'Record calls automatically and keep a searchable history for coaching and compliance.',
    metaTitle: 'Call Recording Software | Ringee',
    metaDescription:
      'Record outbound calls in Ringee with configurable settings. Keep a call history for coaching, quality review, and your own compliance needs.',
    h1: 'Call recording for outbound teams',
    intro: [
      'Ringee can record your calls so you keep an accurate record of what was said. Recordings attach to the call and contact, giving managers material for coaching and giving teams a reference when details matter.',
      'Recording behavior is configurable at the organization or user level, so you can apply the policy that fits your workflow and the rules that apply to your region.'
    ],
    whoFor: [
      'Managers coaching reps on real calls',
      'Teams that need a record of conversations',
      'Agencies demonstrating work to clients',
      'Operators who review calls for quality'
    ],
    howItWorks: [
      {
        title: 'Configure recording',
        description:
          'Set recording preferences at the organization or user level to match your policy.'
      },
      {
        title: 'Calls are captured',
        description:
          'Eligible calls are recorded and saved automatically, attached to the contact and call.'
      },
      {
        title: 'Review and coach',
        description:
          'Play back recordings to coach reps, settle details, or review quality.'
      }
    ],
    benefits: [
      'Automatic capture with no manual steps',
      'Recordings tied to the contact and call',
      'Org- or user-level recording controls',
      'A reliable reference for coaching and review'
    ],
    related: ['call-transcription', 'call-outcomes', 'outbound-calling'],
    faqs: [
      {
        question: 'Can I control whether calls are recorded?',
        answer:
          'Yes. Recording settings can be configured at the organization or user level so you record only what you intend to.'
      },
      {
        question: 'Where are recordings stored?',
        answer:
          'Recordings are saved to your Ringee workspace and attached to the relevant call and contact. Self-hosting lets you keep them in your own storage.'
      },
      {
        question: 'Is call recording legal?',
        answer:
          'Recording laws vary by country and region. Ringee gives you the controls; you are responsible for following the consent and notification rules that apply to your calls.'
      }
    ]
  },
  {
    slug: 'call-transcription',
    name: 'Call transcription',
    category: 'Record & Learn',
    icon: Mic,
    tagline:
      'Turn recorded conversations into searchable text you can scan in seconds.',
    metaTitle: 'Call Transcription Software | Ringee',
    metaDescription:
      'Transcribe outbound calls in Ringee. Convert conversations into searchable text so you can review calls faster and capture the details that matter.',
    h1: 'Call transcription that turns talk into text',
    intro: [
      'Reading is faster than re-listening. Ringee transcribes calls so you can scan a conversation, find the moment that matters, and capture the details without replaying the whole recording.',
      'Transcripts pair with recordings and outcomes to give every conversation a clear, reviewable record — useful for coaching, handoffs, and keeping context across a long sales cycle.'
    ],
    whoFor: [
      'Managers reviewing many calls quickly',
      'Reps capturing details without re-listening',
      'Teams handing off leads between people',
      'Operators who want searchable call history'
    ],
    howItWorks: [
      {
        title: 'Record the call',
        description:
          'Transcription works from your recorded calls, so it follows your recording settings.'
      },
      {
        title: 'Get the transcript',
        description:
          'The conversation is converted to text and attached to the call.'
      },
      {
        title: 'Scan and act',
        description:
          'Skim the transcript, pull out next steps, and update notes and outcomes.'
      }
    ],
    benefits: [
      'Review calls far faster than re-listening',
      'Searchable text attached to each call',
      'Better handoffs with full context',
      'Capture details you would otherwise miss'
    ],
    related: ['call-recording', 'call-outcomes', 'ai-call-automation'],
    faqs: [
      {
        question: 'Does transcription require recording?',
        answer:
          'Yes. Transcripts are generated from recorded calls, so transcription follows the same recording controls.'
      },
      {
        question: 'Can I search transcripts?',
        answer:
          'Transcripts are text attached to the call, so you can scan and find the parts of the conversation you need.'
      }
    ]
  },
  {
    slug: 'crm-sync',
    name: 'CRM sync',
    category: 'Sync',
    icon: RefreshCw,
    tagline:
      'Keep your CRM up to date by syncing calls, outcomes, and activity automatically.',
    metaTitle: 'CRM Sync for Calling | Ringee',
    metaDescription:
      'Sync calls, outcomes, and notes from Ringee to your CRM. Keep Attio, Odoo, and your outbound activity aligned without manual data entry.',
    h1: 'Keep your CRM in sync with every call',
    intro: [
      'Outbound only works when your records stay current. Ringee connects to CRMs such as Attio and Odoo so your call activity, outcomes, and notes show up where your team already works.',
      'Instead of copying data by hand after every call, let Ringee reflect what happened against the matching record — so your CRM is an accurate picture of your outbound effort.'
    ],
    whoFor: [
      'Sales teams that run their pipeline in a CRM',
      'Operators who hate manual data entry',
      'Agencies reporting activity to clients',
      'Anyone who needs trustworthy activity data'
    ],
    howItWorks: [
      {
        title: 'Connect your CRM',
        description:
          'Link Ringee to a supported CRM such as Attio or Odoo from your workspace settings.'
      },
      {
        title: 'Call as usual',
        description:
          'Place calls and log outcomes and notes the way you normally do.'
      },
      {
        title: 'Stay in sync',
        description:
          'Call activity is reflected against the matching CRM record so your data stays current.'
      }
    ],
    benefits: [
      'Less manual data entry after calls',
      'Accurate activity history in your CRM',
      'Calls, notes, and outcomes in one timeline',
      'Cleaner reporting and handoffs'
    ],
    related: ['call-outcomes', 'campaigns', 'outbound-calling'],
    faqs: [
      {
        question: 'Which CRMs does Ringee support?',
        answer:
          'Ringee integrates with Attio and Odoo today, plus lead sources like Apollo and Prospeo for getting contacts into Ringee.'
      },
      {
        question: 'What syncs to the CRM?',
        answer:
          'Call activity, outcomes, and notes can be reflected against the matching contact so your CRM mirrors your outbound work.'
      }
    ]
  },
  {
    slug: 'ai-call-automation',
    name: 'AI call automation',
    category: 'Automate',
    icon: Bot,
    tagline:
      'Drive outbound from ChatGPT, Claude, MCP-compatible agents, and the CLI.',
    metaTitle: 'AI Call Automation with ChatGPT, Claude & MCP | Ringee',
    metaDescription:
      'Automate outbound workflows with Ringee. Use ChatGPT, Claude, MCP-compatible agents, and CLI workflows to prospect, call, log outcomes, and schedule follow-ups.',
    h1: 'Automate outbound calling with AI agents',
    intro: [
      'Ringee exposes its outbound workflow through an MCP server, so AI assistants and agents can do the busywork: search and import leads, create contacts, start calls, log outcomes, and schedule callbacks and meetings.',
      'That means you can run outbound from the tools you already use — ChatGPT, Claude, any MCP-compatible agent, or the command line — instead of clicking through screens. The AI prepares the work; you make the human calls.'
    ],
    whoFor: [
      'Operators who live in ChatGPT or Claude',
      'Developers who want scriptable outbound',
      'Lean teams automating repetitive prep',
      'Builders connecting agents to real calling'
    ],
    howItWorks: [
      {
        title: 'Connect an agent',
        description:
          'Point ChatGPT, Claude, an MCP-compatible agent, or the CLI at your Ringee workspace.'
      },
      {
        title: 'Describe the goal',
        description:
          'Ask the agent to prospect, build a list, or queue a calling session, and it uses Ringee’s tools to do it.'
      },
      {
        title: 'Keep humans on the calls',
        description:
          'The agent handles prep and follow-up; calls are sent to your devices for a person to take.'
      }
    ],
    benefits: [
      'Less manual prep before and after calls',
      'Run outbound from the tools you already use',
      'Scriptable, repeatable workflows',
      'Safety rules guard sensitive and destructive actions'
    ],
    related: ['crm-sync', 'call-outcomes', 'campaigns', 'callbacks'],
    faqs: [
      {
        question: 'Does AI place the calls for me?',
        answer:
          'No. Ringee’s automation prepares the work and sends a call to your active device — a person still takes the conversation. This keeps your outbound human.'
      },
      {
        question: 'What can agents actually do?',
        answer:
          'Through the MCP server, agents can search and import leads, create and update contacts, start calls, log outcomes, and schedule callbacks and meetings, with guardrails on sensitive actions.'
      },
      {
        question: 'Which tools are supported?',
        answer:
          'ChatGPT, Claude, any MCP-compatible agent, and CLI workflows can drive Ringee.'
      }
    ]
  }
];

const FEATURE_BY_SLUG = new Map(FEATURES.map((f) => [f.slug, f]));

export function getFeature(slug: string): FeatureContent | undefined {
  return FEATURE_BY_SLUG.get(slug);
}

export function featuresByCategory(category: FeatureCategory): FeatureContent[] {
  return FEATURES.filter((f) => f.category === category);
}
