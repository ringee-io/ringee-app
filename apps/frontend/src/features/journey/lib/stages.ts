import {
  IconUser,
  IconUsers,
  IconRepeat,
  IconPlugConnected,
  IconSpeakerphone,
  IconSparkles,
  IconRobot,
  IconBuildingBroadcastTower,
  type IconProps
} from '@tabler/icons-react';
import type { ComponentType } from 'react';

/**
 * The growth path a Ringee workspace travels.
 *
 * Internally this is a maturity segmentation: every workspace is placed in
 * exactly one stage from hard signals, and the stage decides what we recommend
 * next. To the user it is only ever "your journey" — the page never exposes the
 * segmentation vocabulary, and never implies a workspace is being graded.
 *
 * There are two ladders because the product is genuinely different for the two
 * kinds of customer: a freelancer cannot run campaigns (campaigns require an
 * organization), so their path climbs through consistency, an integrated stack
 * and agents instead of through team and campaign scale.
 */

export type JourneyStageId =
  // Shared entry point.
  | 'solo_caller'
  // Freelancer / personal-workspace ladder.
  | 'consistent_caller'
  | 'connected_operator'
  | 'ai_closer'
  | 'agentic_operator'
  // Organization ladder.
  | 'small_team'
  | 'campaign_operator'
  | 'ai_sales_team'
  | 'call_center';

export interface JourneyStageMeta {
  id: JourneyStageId;
  /** Short name shown on the path and the current-stage card. */
  name: string;
  /** One line describing where they are, in the second person. */
  message: string;
  /** The longer read on this stage. */
  summary: string;
  /** One-word essence shown under the path node. */
  focus: string;
  /** What unlocking the next stage is really about. */
  ambition: string;
  Icon: ComponentType<IconProps>;
  /** Static Tailwind tokens — never built by string concat, so JIT keeps them. */
  accent: string;
  tint: string;
  solid: string;
  ring: string;
  border: string;
}

export const JOURNEY_STAGES: Record<JourneyStageId, JourneyStageMeta> = {
  solo_caller: {
    id: 'solo_caller',
    name: 'Solo Caller',
    message: 'You are setting up your calling.',
    summary:
      'A lean setup focused on getting the first calls out. The goal right now is simple: a number, people to call, and a first conversation.',
    focus: 'Getting started',
    ambition: 'Turn calling into a routine.',
    Icon: IconUser,
    accent: 'text-sky-500 dark:text-sky-400',
    tint: 'bg-sky-500/10',
    solid: 'bg-sky-500',
    ring: 'ring-sky-400/40',
    border: 'border-sky-500/30'
  },

  // ── Freelancer ladder ──────────────────────────────────────────────────────

  consistent_caller: {
    id: 'consistent_caller',
    name: 'Consistent Caller',
    message: 'You are calling regularly.',
    summary:
      'Calling has become a habit rather than a burst. From here, the leverage comes from what happens around the call — where the contacts come from and where the outcome goes.',
    focus: 'Building the habit',
    ambition: 'Connect your stack so nothing falls through.',
    Icon: IconRepeat,
    accent: 'text-violet-500 dark:text-violet-400',
    tint: 'bg-violet-500/10',
    solid: 'bg-violet-500',
    ring: 'ring-violet-400/40',
    border: 'border-violet-500/30'
  },
  connected_operator: {
    id: 'connected_operator',
    name: 'Connected Operator',
    message: 'Your calling is wired into the rest of your stack.',
    summary:
      'Leads come in, calls go out and outcomes land where they belong — your CRM and calendar. Now the calls themselves can start teaching you something.',
    focus: 'Connected stack',
    ambition: 'Let AI read your calls and tell you what works.',
    Icon: IconPlugConnected,
    accent: 'text-amber-500 dark:text-amber-400',
    tint: 'bg-amber-500/10',
    solid: 'bg-amber-500',
    ring: 'ring-amber-400/40',
    border: 'border-amber-500/30'
  },
  ai_closer: {
    id: 'ai_closer',
    name: 'AI-Powered Closer',
    message: 'AI is working on your calls with you.',
    summary:
      'Recordings and transcripts feed follow-up recommendations and objection insight, so every call sharpens the next one instead of disappearing.',
    focus: 'Learning from calls',
    ambition: 'Hand the repetitive work to an agent.',
    Icon: IconSparkles,
    accent: 'text-fuchsia-500 dark:text-fuchsia-400',
    tint: 'bg-fuchsia-500/10',
    solid: 'bg-fuchsia-500',
    ring: 'ring-fuchsia-400/40',
    border: 'border-fuchsia-500/30'
  },
  agentic_operator: {
    id: 'agentic_operator',
    name: 'Agentic Operator',
    message: 'You run a one-person operation with agents doing the legwork.',
    summary:
      'Agents source leads, queue calls and file the outcomes through Ringee, while you spend your time on the conversations that matter. This is as leveraged as solo outbound gets.',
    focus: 'Operating with agents',
    ambition: 'Keep quality and cost under control as volume grows.',
    Icon: IconRobot,
    accent: 'text-emerald-500 dark:text-emerald-400',
    tint: 'bg-emerald-500/10',
    solid: 'bg-emerald-500',
    ring: 'ring-emerald-400/40',
    border: 'border-emerald-500/30'
  },

  // ── Organization ladder ────────────────────────────────────────────────────

  small_team: {
    id: 'small_team',
    name: 'Small Team',
    message: 'You are building a small outbound team.',
    summary:
      'More than one person is calling. It now pays to give the team numbers, structure the work and watch performance as a group instead of individually.',
    focus: 'Building a team',
    ambition: 'Turn ad-hoc calling into real campaigns.',
    Icon: IconUsers,
    accent: 'text-violet-500 dark:text-violet-400',
    tint: 'bg-violet-500/10',
    solid: 'bg-violet-500',
    ring: 'ring-violet-400/40',
    border: 'border-violet-500/30'
  },
  campaign_operator: {
    id: 'campaign_operator',
    name: 'Campaign Operator',
    message: 'You are running real outbound campaigns.',
    summary:
      'Campaigns, numbers and agents are managed as one system. The work shifts from making calls happen to making them land — and to keeping the pipeline connected.',
    focus: 'Running campaigns',
    ambition: 'Let AI show you what is working across every call.',
    Icon: IconSpeakerphone,
    accent: 'text-amber-500 dark:text-amber-400',
    tint: 'bg-amber-500/10',
    solid: 'bg-amber-500',
    ring: 'ring-amber-400/40',
    border: 'border-amber-500/30'
  },
  ai_sales_team: {
    id: 'ai_sales_team',
    name: 'AI-Driven Sales Team',
    message: 'AI is improving how your team sells.',
    summary:
      'You have the volume and the recordings to let AI do real work — surfacing objections, follow-ups and the scripts that actually convert, across the whole team.',
    focus: 'Working with AI',
    ambition: 'Scale it into a full calling operation.',
    Icon: IconSparkles,
    accent: 'text-fuchsia-500 dark:text-fuchsia-400',
    tint: 'bg-fuchsia-500/10',
    solid: 'bg-fuchsia-500',
    ring: 'ring-fuchsia-400/40',
    border: 'border-fuchsia-500/30'
  },
  call_center: {
    id: 'call_center',
    name: 'Call Center',
    message: 'You are running a full calling operation.',
    summary:
      'Agents, numbers, rotation, devices and campaigns run as one machine. The work now is health, cost control and quality — keeping a big operation sharp.',
    focus: 'Operating at scale',
    ambition: 'Protect answer rates, cost and quality at scale.',
    Icon: IconBuildingBroadcastTower,
    accent: 'text-emerald-500 dark:text-emerald-400',
    tint: 'bg-emerald-500/10',
    solid: 'bg-emerald-500',
    ring: 'ring-emerald-400/40',
    border: 'border-emerald-500/30'
  }
};

/** The freelancer path — no campaigns, because campaigns need an organization. */
export const PERSONAL_LADDER: JourneyStageId[] = [
  'solo_caller',
  'consistent_caller',
  'connected_operator',
  'ai_closer',
  'agentic_operator'
];

/** The organization path — team, campaigns and scale. */
export const ORGANIZATION_LADDER: JourneyStageId[] = [
  'solo_caller',
  'small_team',
  'campaign_operator',
  'ai_sales_team',
  'call_center'
];

export function journeyLadder(hasOrg: boolean): JourneyStageId[] {
  return hasOrg ? ORGANIZATION_LADDER : PERSONAL_LADDER;
}
