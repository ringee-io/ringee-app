import {
  BadgeCheck,
  Bot,
  CalendarCheck,
  CalendarClock,
  ClipboardList,
  type LucideIcon,
  Megaphone,
  Mic,
  PhoneOutgoing,
  RefreshCw,
  Shuffle,
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
    blurb: 'Record calls, transcribe conversations live, and review history.',
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
    blurb:
      'Connect Ringee with Apollo, Prospeo, Attio, Odoo, and CRM workflows.',
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
    related: ['caller-id', 'caller-id-rotation', 'campaigns', 'callbacks'],
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
      },
      {
        question: 'Can I call from my own number?',
        answer:
          'Yes. Verify a number you already own as a caller ID and use it as the number people see when you call — no need to buy a new one.'
      }
    ]
  },
  {
    slug: 'caller-id',
    name: 'Custom caller ID',
    category: 'Communicate',
    icon: BadgeCheck,
    tagline:
      'Call from a number you already own — verify it once and show it as your outbound caller ID.',
    metaTitle: 'Custom Caller ID — Call From a Number You Own | Ringee',
    metaDescription:
      'Use a number you already own as your outbound caller ID in Ringee. Verify it by SMS or phone call, then show a familiar number so more prospects pick up.',
    h1: 'Call from your own number with a verified caller ID',
    intro: [
      'People answer numbers they recognize. Ringee lets you place outbound calls from a phone number you already own — your mobile, your office line, or a local business number — by setting it as your verified caller ID, so that is the number that shows up on the other end.',
      'You do not have to buy a new number to start. Verify a number you control in a couple of minutes, switch it on, and use it as the caller ID for your calls and campaigns.'
    ],
    whoFor: [
      'Reps who get better pickup from a familiar, local number',
      'Freelancers and consultants calling from their own line',
      'Agencies calling on behalf of a client’s existing number',
      'Teams with a business number they already want to keep using'
    ],
    howItWorks: [
      {
        title: 'Add a number you own',
        description:
          'Enter the number and choose how to receive the code — by SMS or an automated phone call.'
      },
      {
        title: 'Verify ownership',
        description:
          'Enter the code Ringee sends to confirm the number is yours. A small one-time verification fee applies per number.'
      },
      {
        title: 'Call from it',
        description:
          'Activate the verified caller ID and use it for your calls and campaigns so people see that number when you reach out.'
      }
    ],
    benefits: [
      'Show a number prospects recognize and trust',
      'No need to buy a new number — reuse one you own',
      'Quick self-serve verification by SMS or phone call',
      'Use verified caller IDs for calls and campaigns'
    ],
    related: [
      'caller-id-rotation',
      'outbound-calling',
      'campaigns',
      'call-recording'
    ],
    faqs: [
      {
        question: 'Do I need to buy a number to use a caller ID?',
        answer:
          'No. A caller ID lets you call from a number you already own. You verify that you control it, then use it as the number shown on outbound calls — no purchase required.'
      },
      {
        question: 'How do I verify a number I own?',
        answer:
          'Add the number in Ringee and choose to receive a verification code by SMS or an automated phone call, then enter the code to confirm ownership. A small one-time verification fee applies per number.'
      },
      {
        question: 'Is there an extra cost to call from a verified caller ID?',
        answer:
          'Verifying a number costs a small one-time fee. Calls placed from a verified caller ID add $0.50 per minute on top of the standard per-minute rate for the destination.'
      },
      {
        question:
          'What is the difference between a caller ID and a purchased number?',
        answer:
          'A purchased number is a new line you rent from Ringee to make and receive calls. A caller ID is a number you already own that you verify and display on outbound calls — useful when you want familiar numbers without buying new ones.'
      }
    ]
  },
  {
    slug: 'caller-id-rotation',
    name: 'Caller ID rotation',
    category: 'Communicate',
    icon: Shuffle,
    tagline:
      'Show a local number that matches each lead’s area code, rotated across a healthy pool so more calls get answered.',
    metaTitle: 'Caller ID Rotation & Local Presence Dialing | Ringee',
    metaDescription:
      'Ringee’s caller ID rotation shows a local number matched to each prospect’s area code and spreads dials across a pool with daily caps and health monitoring — so more calls get answered and your numbers stay trusted.',
    h1: 'Caller ID rotation for local-presence dialing',
    intro: [
      'People answer numbers they recognize. Caller ID rotation automatically presents a local number that matches each prospect’s area code, then rotates across a pool of your numbers so no single line gets overused or flagged as spam.',
      'One engine on Ringee’s backend decides the caller ID for every outbound call — guaranteeing it always matches the destination’s country, favoring the local area code, respecting per-number daily caps, and ranking by each number’s recent health. You dial; Ringee shows the right number.'
    ],
    whoFor: [
      'Outbound teams dialing across many regions or countries',
      'SDRs who need higher pickup from cold lists',
      'Agencies running high-volume calling for clients',
      'Anyone whose connect rates suffer from unknown or foreign numbers'
    ],
    howItWorks: [
      {
        title: 'Build your number pool',
        description:
          'Turn rotation on for your workspace and every number you own joins the pool. Set a default daily cap and pick local-presence or balanced rotation.'
      },
      {
        title: 'Ringee shows the right number',
        description:
          'On each call the engine picks a number in the destination’s country — same area code first — that is under its daily cap and in good health.'
      },
      {
        title: 'The pool stays healthy on its own',
        description:
          'Caps spread out volume, health scores track answer rates, and numbers that dip are cooled off automatically, then returned once they recover.'
      }
    ],
    benefits: [
      'More answered calls from familiar, local numbers',
      'No single number burned — dials spread with daily caps',
      'Automatic health monitoring and cooling protect deliverability',
      'Safe by default: off, or unmatched calls, keep your fixed caller ID'
    ],
    related: ['caller-id', 'outbound-calling', 'campaigns', 'call-outcomes'],
    faqs: [
      {
        question: 'What is caller ID rotation?',
        answer:
          'Caller ID rotation automatically varies the number shown on your outbound calls, choosing one that matches the prospect’s region and spreading calls across a pool of your numbers. It raises pickup with local presence and keeps any single number from being flagged for high volume.'
      },
      {
        question: 'How does Ringee choose which number to show?',
        answer:
          'For every call Ringee reads the destination’s country and only considers numbers you own in that same country. It prefers a number with the same area code, skips any number that has hit its daily cap, and among the rest picks the healthiest, least-recently-used one. If it can’t safely match, it keeps your fixed caller ID instead of dialing from the wrong country.'
      },
      {
        question: 'Will rotation get my numbers flagged as spam?',
        answer:
          'It’s designed to do the opposite. Per-number daily caps keep volume human-looking, and a health score based on recent answer rates pulls weakening numbers out to cool off before they hurt you — then returns them automatically once they recover.'
      },
      {
        question: 'Do I have to use rotation?',
        answer:
          'No. Rotation is opt-in per workspace. While it’s off you keep the exact fixed caller ID you use today, and even with it on, any call Ringee can’t safely match falls back to your fixed number — so turning it on is risk-free.'
      },
      {
        question: 'Does rotation work in campaigns?',
        answer:
          'Yes. Rotation applies to the manual web dialer, to campaigns, and to shared calling links. A campaign can draw from your whole pool or be limited to a chosen set of numbers.'
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
    related: [
      'outbound-calling',
      'caller-id',
      'caller-id-rotation',
      'call-outcomes'
    ],
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
    tagline: 'Log how each call went and capture notes the moment you hang up.',
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
    related: ['meetings', 'call-outcomes', 'outbound-calling', 'campaigns'],
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
    slug: 'meetings',
    name: 'Meetings',
    category: 'Communicate',
    icon: CalendarCheck,
    tagline:
      'Book meetings on the call and sync them straight to Google Calendar — no back-and-forth.',
    metaTitle: 'Meeting Scheduling with Google Calendar | Ringee',
    metaDescription:
      'Schedule meetings from Ringee and sync them to Google Calendar automatically. Book the next step while you are still on the call — no copy-paste, no double entry.',
    h1: 'Book meetings without leaving the call',
    intro: [
      'The goal of most outbound calls is the next meeting. Ringee lets you schedule it the moment a lead says yes — pick a time and the meeting is created and synced to your connected Google Calendar automatically.',
      'Connect Google Calendar once and every meeting you book in Ringee shows up where you already plan your day, with the contact and call context attached. Your AI agent can book meetings too, through the same tools that drive the rest of your outbound.'
    ],
    whoFor: [
      'SDRs booking demos and discovery calls',
      'Recruiters scheduling interviews with candidates',
      'Freelancers and consultants booking discovery calls',
      'Anyone whose calls end in a scheduled next step'
    ],
    howItWorks: [
      {
        title: 'Connect Google Calendar',
        description:
          'Link your Google Calendar to Ringee once from your workspace settings.'
      },
      {
        title: 'Book on the call',
        description:
          'When a lead agrees to meet, schedule the meeting before you hang up — or have your AI agent do it for you.'
      },
      {
        title: 'It syncs automatically',
        description:
          'The meeting is created on your Google Calendar with the contact and call context attached.'
      }
    ],
    benefits: [
      'Turn a call into a booked meeting in seconds',
      'Meetings sync to Google Calendar automatically',
      'No copy-paste between your dialer and your calendar',
      'AI agents can schedule meetings through MCP'
    ],
    related: [
      'callbacks',
      'outbound-calling',
      'ai-call-automation',
      'call-outcomes'
    ],
    faqs: [
      {
        question: 'Which calendar does Ringee connect to?',
        answer:
          'Ringee connects to Google Calendar. Once linked, meetings you book in Ringee are created and kept in sync on your calendar automatically.'
      },
      {
        question: 'Can AI book meetings for me?',
        answer:
          'Yes. Through Ringee’s MCP tools, ChatGPT, Claude, or any MCP-compatible agent can schedule a meeting for a contact — the same way you would from the app.'
      },
      {
        question: 'What is the difference between a callback and a meeting?',
        answer:
          'A callback is a reminder to dial a contact again. A meeting is a scheduled event on your Google Calendar — use it when you and the lead agree to meet at a set time.'
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
      'Transcribe conversations in real time — with or without recording — into searchable text.',
    metaTitle: 'Real-Time Call Transcription Software | Ringee',
    metaDescription:
      'Transcribe outbound calls in Ringee in real time, whether or not you record them. Convert conversations into searchable text so you can review calls faster and capture the details that matter.',
    h1: 'Real-time call transcription that turns talk into text',
    intro: [
      'Reading is faster than re-listening. Ringee transcribes your calls into searchable text — live as the conversation happens — so you can scan what was said, find the moment that matters, and capture details without replaying anything.',
      'Transcription does not require recording. Ringee streams call audio to its transcription engine in real time, so you get a transcript even when you choose not to store the recording — ideal for teams that want the text but not the audio. Transcripts pair with outcomes (and recordings, when you keep them) to give every conversation a clear, reviewable record.'
    ],
    whoFor: [
      'Managers reviewing many calls quickly',
      'Reps capturing details without re-listening',
      'Teams that want transcripts but not stored audio',
      'Operators who want searchable call history'
    ],
    howItWorks: [
      {
        title: 'Turn on transcription',
        description:
          'Enable transcription at the organization or user level — independently of whether you record the call.'
      },
      {
        title: 'Audio is transcribed live',
        description:
          'Ringee streams the call audio to its transcription engine in real time and converts the conversation to text on the call.'
      },
      {
        title: 'Scan and act',
        description:
          'Skim the transcript, pull out next steps, and update notes and outcomes.'
      }
    ],
    benefits: [
      'Review calls far faster than re-listening',
      'Real-time transcription, recorded or not',
      'Searchable text attached to each call',
      'Capture details you would otherwise miss'
    ],
    related: ['call-recording', 'call-outcomes', 'ai-call-automation'],
    faqs: [
      {
        question: 'Does transcription require recording the call?',
        answer:
          'No. Ringee transcribes call audio in real time, so you get a transcript even when you choose not to store the recording. Recording and transcription are configured independently.'
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

export function featuresByCategory(
  category: FeatureCategory
): FeatureContent[] {
  return FEATURES.filter((f) => f.category === category);
}
