import {
  Briefcase,
  Building,
  type LucideIcon,
  Megaphone,
  Rocket,
  User,
  Users
} from 'lucide-react';

import type { Faq } from '../components/faq';

export type UseCaseContent = {
  slug: string;
  name: string;
  icon: LucideIcon;
  tagline: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string[];
  painPoints: string[];
  solutions: { title: string; description: string }[];
  /** Slugs of recommended features. */
  recommendedFeatures: string[];
  /** Example workflow, step by step. */
  workflow: string[];
  faqs: Faq[];
};

export const USE_CASES: UseCaseContent[] = [
  {
    slug: 'sdr-teams',
    name: 'SDR teams',
    icon: Users,
    tagline:
      'Keep reps dialing, dispositioning, and following up without per-seat costs.',
    metaTitle: 'Ringee for SDR Teams | Outbound Calling Software',
    metaDescription:
      'Ringee helps SDR teams call more leads, log outcomes, and schedule callbacks — with unlimited users on a flat $20/month organization plan.',
    h1: 'Outbound calling software for SDR teams',
    intro: [
      'SDR teams live and die by activity. Ringee gives every rep a fast browser dialer, queued campaigns, and one-tap dispositioning so they spend their day talking to prospects instead of fighting tools.',
      'And because the Organization plan is a flat $20 per month with unlimited users, you can add the whole team without watching your bill climb per seat.'
    ],
    painPoints: [
      'Per-seat pricing punishes you for growing the team',
      'Reps waste time hunting for the next number',
      'Inconsistent call logging breaks reporting',
      'Follow-ups slip through the cracks'
    ],
    solutions: [
      {
        title: 'Flat pricing as you scale',
        description:
          'Unlimited users on a single $20/month organization plan, so adding SDRs never raises your subscription.'
      },
      {
        title: 'Queues that keep reps dialing',
        description:
          'Campaigns serve the next contact automatically so reps stay in flow.'
      },
      {
        title: 'Consistent disposition',
        description:
          'One-tap outcomes and inline notes give managers clean, comparable activity data.'
      },
      {
        title: 'Follow-ups locked in',
        description:
          'Schedule callbacks on the call so no warm lead goes cold.'
      }
    ],
    recommendedFeatures: [
      'outbound-calling',
      'campaigns',
      'call-outcomes',
      'callbacks',
      'crm-sync'
    ],
    workflow: [
      'Import or enrich a target list from Apollo or Prospeo.',
      'Group leads into a campaign for the day.',
      'Reps dial the queue from the browser.',
      'Each call gets an outcome, a note, and a callback if needed.',
      'Activity syncs to your CRM for reporting.'
    ],
    faqs: [
      {
        question: 'How does Ringee handle a growing team?',
        answer:
          'The Organization plan includes unlimited users for a flat $20/month, so adding SDRs does not increase your subscription. You only pay extra for calling credits.'
      },
      {
        question: 'Can managers review rep calls?',
        answer:
          'Yes. With call recording and transcription, managers can review conversations for coaching and quality.'
      }
    ]
  },
  {
    slug: 'recruiters',
    name: 'Recruiters',
    icon: Briefcase,
    tagline:
      'Reach candidates and clients faster, with notes and callbacks that keep every search moving.',
    metaTitle: 'Ringee for Recruiters | Calling Software for Hiring',
    metaDescription:
      'Recruiters use Ringee to call candidates and clients, capture notes, and schedule callbacks — affordable outbound calling with unlimited users.',
    h1: 'Calling software for recruiters',
    intro: [
      'Recruiting is an outbound game: candidates to reach, clients to update, and timing that changes by the hour. Ringee gives recruiters a simple dialer, fast note-taking, and reliable callbacks so no candidate or role falls through.',
      'Work from your browser or phone, keep every conversation attached to the right person, and never lose track of who to call next.'
    ],
    painPoints: [
      'Candidate timing is constantly shifting',
      'Context gets lost between conversations',
      'Manual logging eats into calling time',
      'Per-seat tools are overkill for a small desk'
    ],
    solutions: [
      {
        title: 'Callbacks that match candidate timing',
        description:
          'Schedule the next touch on the call so you reach people when they said to.'
      },
      {
        title: 'Notes that travel with the contact',
        description:
          'Every conversation stays attached to the candidate or client record.'
      },
      {
        title: 'Fast dispositioning',
        description:
          'Log outcomes in a tap and keep moving through your list.'
      },
      {
        title: 'Affordable for any desk size',
        description:
          'Start free, or run a whole agency on the flat organization plan.'
      }
    ],
    recommendedFeatures: [
      'outbound-calling',
      'callbacks',
      'call-outcomes',
      'call-recording',
      'crm-sync'
    ],
    workflow: [
      'Build a shortlist of candidates for a role.',
      'Call through the list from your browser.',
      'Capture notes and an outcome on each call.',
      'Schedule callbacks around candidate availability.',
      'Keep your CRM or ATS updated with the activity.'
    ],
    faqs: [
      {
        question: 'Can I record screening calls?',
        answer:
          'Yes, with configurable recording settings. Make sure you follow the consent rules that apply where you and your candidates are located.'
      },
      {
        question: 'Is Ringee good for a solo recruiter?',
        answer:
          'Absolutely. The Freelancer plan is free to start, and you can move to the Organization plan as your desk grows.'
      }
    ]
  },
  {
    slug: 'agencies',
    name: 'Agencies',
    icon: Building,
    tagline:
      'Run calling for multiple clients with workspaces, recordings, and clean reporting.',
    metaTitle: 'Ringee for Agencies | Outbound Calling for Clients',
    metaDescription:
      'Agencies use Ringee to run outbound calling for clients — campaigns, recordings, and CRM sync with unlimited users on a flat organization plan.',
    h1: 'Outbound calling for agencies',
    intro: [
      'Agencies run calling on behalf of clients, which means juggling lists, recordings, and reporting across several accounts. Ringee keeps each effort organized with campaigns, recorded calls, and clean activity data you can show clients.',
      'With unlimited users on a flat organization plan, you can staff campaigns without per-seat costs eating your margin.'
    ],
    painPoints: [
      'Per-seat pricing erodes agency margins',
      'Client reporting needs reliable activity data',
      'Proof of work matters for retention',
      'Switching between client efforts is messy'
    ],
    solutions: [
      {
        title: 'Margins that survive scaling',
        description:
          'Flat $20/month per organization with unlimited users keeps staffing affordable.'
      },
      {
        title: 'Campaigns per effort',
        description:
          'Keep each client push organized with its own list, outcomes, and progress.'
      },
      {
        title: 'Recorded proof of work',
        description:
          'Recordings and transcripts give clients confidence in the work delivered.'
      },
      {
        title: 'Reporting clients trust',
        description:
          'Consistent outcomes and CRM sync produce activity data you can present.'
      }
    ],
    recommendedFeatures: [
      'campaigns',
      'call-recording',
      'call-transcription',
      'call-outcomes',
      'crm-sync'
    ],
    workflow: [
      'Set up a campaign for each client effort.',
      'Staff reps onto campaigns at no extra seat cost.',
      'Record and transcribe calls for quality and proof.',
      'Log outcomes for clean, client-ready reporting.',
      'Sync activity to the client’s CRM where needed.'
    ],
    faqs: [
      {
        question: 'Can I separate work by client?',
        answer:
          'Use campaigns to keep each client’s list, outcomes, and progress organized, and recordings to demonstrate the work delivered.'
      },
      {
        question: 'How does pricing work for an agency?',
        answer:
          'The Organization plan is a flat $20/month with unlimited users; you only pay extra for the calling credits you use.'
      }
    ]
  },
  {
    slug: 'freelancers',
    name: 'Freelancers',
    icon: User,
    tagline:
      'Start calling for free, keep your follow-ups tight, and only pay for minutes.',
    metaTitle: 'Ringee for Freelancers | Free Outbound Calling',
    metaDescription:
      'Freelancers start calling for free with Ringee. Make calls from your browser, capture notes and callbacks, and pay only for the minutes you use.',
    h1: 'Free outbound calling for freelancers',
    intro: [
      'When you are a team of one, you need a calling tool that is cheap, simple, and reliable. Ringee’s Freelancer plan is free to start — open your browser, call your prospects, and keep your follow-ups tight without a monthly seat fee.',
      'You only pay for the calling minutes you use, so your costs scale with your work, not with a subscription tier.'
    ],
    painPoints: [
      'Monthly seat fees are hard to justify solo',
      'Follow-ups slip when you wear every hat',
      'Context lives in scattered notes',
      'Enterprise tools are overkill'
    ],
    solutions: [
      {
        title: 'Free to start',
        description:
          'The Freelancer plan costs $0/month — you only pay for calling credits.'
      },
      {
        title: 'Tight follow-ups',
        description:
          'Schedule callbacks on the call so nothing slips while you juggle everything.'
      },
      {
        title: 'Notes in one place',
        description:
          'Keep every conversation attached to the contact, not in a side document.'
      },
      {
        title: 'No bloat',
        description:
          'A clean dialer and the essentials, without enterprise complexity.'
      }
    ],
    recommendedFeatures: [
      'outbound-calling',
      'callbacks',
      'call-outcomes',
      'ai-call-automation'
    ],
    workflow: [
      'Sign up for the free Freelancer plan.',
      'Add a few credits for calling minutes.',
      'Call your prospects from the browser.',
      'Log outcomes and schedule callbacks.',
      'Let AI tools handle the repetitive prep.'
    ],
    faqs: [
      {
        question: 'Is the Freelancer plan really free?',
        answer:
          'Yes. The Freelancer plan is $0/month. You only pay for the calling credits you use to place calls.'
      },
      {
        question: 'Can I upgrade later?',
        answer:
          'Yes. When you bring on help, move to the Organization plan for a flat $20/month with unlimited users.'
      }
    ]
  },
  {
    slug: 'startups',
    name: 'Startups',
    icon: Rocket,
    tagline:
      'Stand up outbound fast, automate the busywork, and keep costs predictable.',
    metaTitle: 'Ringee for Startups | Affordable Outbound Calling',
    metaDescription:
      'Startups use Ringee to launch outbound quickly — flat pricing, unlimited users, CRM sync, and AI automation without enterprise complexity.',
    h1: 'Affordable outbound calling for startups',
    intro: [
      'Early-stage teams need to test outbound without committing to expensive, complex tooling. Ringee lets founders and small teams stand up calling in minutes, automate the repetitive parts with AI, and keep costs predictable as they grow.',
      'A flat organization price with unlimited users means your calling stack does not become a line item you dread as you hire.'
    ],
    painPoints: [
      'Limited budget for sales tooling',
      'Small team wearing many hats',
      'Need to validate outbound quickly',
      'Per-seat costs scale the wrong way'
    ],
    solutions: [
      {
        title: 'Predictable, flat pricing',
        description:
          'A single $20/month organization plan with unlimited users keeps spend in check.'
      },
      {
        title: 'Automate the busywork',
        description:
          'Use ChatGPT, Claude, MCP agents, or the CLI to prospect and follow up.'
      },
      {
        title: 'Stand up outbound fast',
        description:
          'Call from the browser today — no hardware or lengthy setup.'
      },
      {
        title: 'Grow without re-platforming',
        description:
          'Start free, add the team, and connect your CRM when you are ready.'
      }
    ],
    recommendedFeatures: [
      'outbound-calling',
      'ai-call-automation',
      'campaigns',
      'crm-sync',
      'callbacks'
    ],
    workflow: [
      'Create an organization and invite the team.',
      'Connect a lead source and your CRM.',
      'Let an AI agent build your first call list.',
      'Run a campaign and validate your messaging.',
      'Track outcomes to see what is working.'
    ],
    faqs: [
      {
        question: 'Is Ringee too much for an early team?',
        answer:
          'No. It is intentionally lightweight — the essentials for outbound without enterprise complexity, at a flat, predictable price.'
      },
      {
        question: 'Can we self-host as we grow?',
        answer:
          'Yes. Ringee is open source and can be self-hosted if you want full control of your deployment and data.'
      }
    ]
  },
  {
    slug: 'outbound-sales',
    name: 'Outbound sales',
    icon: Megaphone,
    tagline:
      'A complete outbound motion: prospect, call, record, follow up, and sync.',
    metaTitle: 'Ringee for Outbound Sales | End-to-End Calling',
    metaDescription:
      'Run a complete outbound sales motion with Ringee — prospecting, calling, recording, outcomes, callbacks, and CRM sync at an affordable flat price.',
    h1: 'Outbound sales software, end to end',
    intro: [
      'Outbound sales is a system: find the right people, reach them, record what happened, follow up, and keep your CRM honest. Ringee covers that whole loop in one affordable tool so your motion does not depend on a stack of expensive point solutions.',
      'From lead enrichment to recorded calls to synced activity, Ringee keeps outbound operators in flow and their data clean.'
    ],
    painPoints: [
      'Outbound spread across too many tools',
      'Expensive per-seat platforms',
      'Messy data between calling and CRM',
      'Repetitive prep slows reps down'
    ],
    solutions: [
      {
        title: 'One loop, one tool',
        description:
          'Prospect, call, record, disposition, and follow up without leaving Ringee.'
      },
      {
        title: 'Affordable at any size',
        description:
          'Flat organization pricing with unlimited users replaces per-seat fees.'
      },
      {
        title: 'Clean, synced data',
        description:
          'Outcomes and notes flow to your CRM for trustworthy reporting.'
      },
      {
        title: 'AI-assisted prep',
        description:
          'Agents handle prospecting and admin so reps focus on calls.'
      }
    ],
    recommendedFeatures: [
      'outbound-calling',
      'campaigns',
      'call-recording',
      'call-outcomes',
      'crm-sync',
      'ai-call-automation'
    ],
    workflow: [
      'Enrich and import leads from Apollo or Prospeo.',
      'Queue them into a campaign.',
      'Dial, record, and disposition each call.',
      'Schedule callbacks for warm leads.',
      'Sync everything to Attio or Odoo.'
    ],
    faqs: [
      {
        question: 'Does Ringee replace my whole outbound stack?',
        answer:
          'Ringee covers calling, recording, outcomes, callbacks, lead import, CRM sync, and AI automation in one tool, so most teams can consolidate.'
      },
      {
        question: 'How much does it cost to run outbound sales?',
        answer:
          'The Organization plan is a flat $20/month with unlimited users; calling credits are billed separately based on the minutes you use.'
      }
    ]
  }
];

const USE_CASE_BY_SLUG = new Map(USE_CASES.map((u) => [u.slug, u]));

export function getUseCase(slug: string): UseCaseContent | undefined {
  return USE_CASE_BY_SLUG.get(slug);
}
