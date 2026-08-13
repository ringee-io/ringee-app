import {
  IconAddressBook,
  IconAdjustmentsBolt,
  IconBrain,
  IconCalendarPlus,
  IconDeviceLandlinePhone,
  IconFileText,
  IconMicrophone,
  IconPhonePlus,
  IconPhoneCall,
  IconPlugConnected,
  IconRobot,
  IconRepeat,
  IconSearch,
  IconSpeakerphone,
  IconStack2,
  IconTargetArrow,
  IconUsers,
  IconUsersGroup,
  IconWaveSine,
  type IconProps
} from '@tabler/icons-react';
import type { ComponentType } from 'react';
import {
  JOURNEY_STAGES,
  journeyLadder,
  type JourneyStageId,
  type JourneyStageMeta
} from './stages';
import { signalsFrom, type StageSignals } from './signals';
import { buildRewardTrack, type JourneyRewardTrack } from './rewards';
import type { JourneyOverview } from '../types';

/**
 * The journey model: everything the page renders, derived deterministically from
 * one API payload. Same inputs always produce the same stage, the same score and
 * the same recommendations — there is no AI and nothing is invented here.
 *
 * The whole page is built from a single primitive, the {@link JourneyCriterion}:
 * a concrete, checkable statement about the workspace. Criteria roll up into
 * pillars (the progress bars), the unmet ones become "what's missing", and the
 * highest-leverage unmet ones become the recommended next steps. Define a
 * criterion once and it shows up everywhere it should.
 */

// ── Primitives ───────────────────────────────────────────────────────────────

export interface JourneyAction {
  label: string;
  href: string;
  /** Requires org-admin (or freelancer) rights — hidden from plain members. */
  adminOnly?: boolean;
}

export interface JourneyCriterion {
  id: string;
  /** Stated as a fact about the workspace, e.g. "Calls are transcribed". */
  label: string;
  /** The live number behind it, e.g. "3 numbers". */
  detail: string;
  done: boolean;
  /** Why it matters — shown when the criterion becomes a next step. */
  why: string;
  /** 0-100. Drives the order of the recommended next steps. */
  weight: number;
  action?: JourneyAction;
}

export type JourneyPillarId =
  | 'foundation'
  | 'calling'
  | 'pipeline'
  | 'campaigns'
  | 'integrations'
  | 'intelligence';

export interface JourneyPillar {
  id: JourneyPillarId;
  name: string;
  description: string;
  Icon: ComponentType<IconProps>;
  accent: string;
  tint: string;
  solid: string;
  criteria: JourneyCriterion[];
  completed: number;
  total: number;
  /** 0-100. */
  score: number;
}

export interface JourneyStep {
  id: string;
  title: string;
  description: string;
  action: JourneyAction;
  pillar: JourneyPillarId;
  Icon: ComponentType<IconProps>;
  tint: string;
  accent: string;
}

export interface JourneyHighlight {
  id: string;
  label: string;
  value: string;
  hint?: string;
  /** Percentage change vs. the previous window, when there is a baseline. */
  trendPct?: number | null;
  Icon: ComponentType<IconProps>;
}

export interface JourneyIntegrationCard {
  id: 'crm' | 'customCrm' | 'meetings' | 'enrichment' | 'mcp';
  name: string;
  description: string;
  connected: boolean;
  /** Provider names to show as chips when connected. */
  providers: string[];
  /** Live usage numbers — proof the integration is doing something. */
  stats: Array<{ label: string; value: string }>;
  action: JourneyAction;
  Icon: ComponentType<IconProps>;
  accent: string;
  tint: string;
}

/** One origin channel calls came through, as a share of the total. */
export interface JourneyChannel {
  id: string;
  label: string;
  calls: number;
  /** 0-100, share of all calls in the window. */
  share: number;
}

/** One disposition bucket, as a share of the biggest bucket. */
export interface JourneyOutcomeSlice {
  id: string;
  label: string;
  value: number;
  /** 0-100, relative to the largest slice — for the comparison bar. */
  share: number;
  Icon: ComponentType<IconProps>;
}

export interface JourneyModel {
  stage: JourneyStageMeta;
  ladder: JourneyStageMeta[];
  stageIndex: number;
  nextStage: JourneyStageMeta | null;
  hasOrg: boolean;
  /** Nothing set up and nothing called yet — show the welcome framing. */
  notStartedYet: boolean;
  /** True when an org member is only seeing their own activity. */
  scopedToMember: boolean;
  windowDays: number;
  /** 0-100 across every criterion that applies to this workspace. */
  score: number;
  pillars: JourneyPillar[];
  highlights: JourneyHighlight[];
  reasons: Array<{ label: string; positive: boolean }>;
  missing: JourneyCriterion[];
  /** The top 4 actionable steps — the headline recommendation. */
  nextSteps: JourneyStep[];
  /** Every actionable unmet milestone, in the same priority order. */
  allSteps: JourneyStep[];
  /** Unmet work this user cannot do themselves (admin-only, seen by a member). */
  blockedSteps: JourneyCriterion[];
  integrations: JourneyIntegrationCard[];
  /** Raw activity numbers, for the detail view. */
  activity: JourneyOverview['activity'];
  outcomes: JourneyOverview['outcomes'];
  channels: JourneyChannel[];
  outcomeMix: JourneyOutcomeSlice[];
  campaigns: JourneyOverview['campaigns'];
  /** Call credit earned along the ladder — amounts and states come from the API. */
  rewards: JourneyRewardTrack;
}

// ── Formatting helpers ───────────────────────────────────────────────────────

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

const compact = (n: number) =>
  n >= 10000 ? `${Math.round(n / 1000)}k` : n.toLocaleString('en-US');

const PROVIDER_NAMES: Record<string, string> = {
  attio: 'Attio',
  hubspot: 'HubSpot',
  salesforce: 'Salesforce',
  gohighlevel: 'GoHighLevel',
  odoo_14_18: 'Odoo',
  odoo_19_plus: 'Odoo',
  apollo: 'Apollo',
  prospeo: 'Prospeo',
  google: 'Google Calendar',
  microsoft: 'Microsoft 365',
  mcp: 'MCP'
};

const prettyProvider = (slug: string) => PROVIDER_NAMES[slug] ?? slug;

// ── Pillars ──────────────────────────────────────────────────────────────────

interface PillarMeta {
  name: string;
  description: string;
  Icon: ComponentType<IconProps>;
  accent: string;
  tint: string;
  solid: string;
}

const PILLAR_META: Record<JourneyPillarId, PillarMeta> = {
  foundation: {
    name: 'Foundation',
    description: 'The setup that makes calling possible.',
    Icon: IconPhonePlus,
    accent: 'text-sky-500 dark:text-sky-400',
    tint: 'bg-sky-500/10',
    solid: 'bg-sky-500'
  },
  calling: {
    name: 'Calling',
    description: 'Whether calling is actually happening — and landing.',
    Icon: IconWaveSine,
    accent: 'text-violet-500 dark:text-violet-400',
    tint: 'bg-violet-500/10',
    solid: 'bg-violet-500'
  },
  pipeline: {
    name: 'Pipeline',
    description: 'What your conversations turn into.',
    Icon: IconTargetArrow,
    accent: 'text-emerald-500 dark:text-emerald-400',
    tint: 'bg-emerald-500/10',
    solid: 'bg-emerald-500'
  },
  campaigns: {
    name: 'Campaigns',
    description: 'Structured outbound your team runs together.',
    Icon: IconSpeakerphone,
    accent: 'text-amber-500 dark:text-amber-400',
    tint: 'bg-amber-500/10',
    solid: 'bg-amber-500'
  },
  integrations: {
    name: 'Connected stack',
    description: 'Ringee working with the tools around it.',
    Icon: IconPlugConnected,
    accent: 'text-cyan-500 dark:text-cyan-400',
    tint: 'bg-cyan-500/10',
    solid: 'bg-cyan-500'
  },
  intelligence: {
    name: 'Intelligence',
    description: 'Turning calls into things you can learn from.',
    Icon: IconBrain,
    accent: 'text-fuchsia-500 dark:text-fuchsia-400',
    tint: 'bg-fuchsia-500/10',
    solid: 'bg-fuchsia-500'
  }
};

/** Icons used on the recommended-next-step cards, per criterion. */
const STEP_ICONS: Record<string, ComponentType<IconProps>> = {
  number: IconPhonePlus,
  contacts: IconAddressBook,
  team: IconUsersGroup,
  rotation: IconStack2,
  device: IconDeviceLandlinePhone,
  first_call: IconPhoneCall,
  volume: IconWaveSine,
  consistency: IconRepeat,
  connect_rate: IconAdjustmentsBolt,
  outcomes: IconTargetArrow,
  meetings: IconCalendarPlus,
  followups: IconRepeat,
  campaign_created: IconSpeakerphone,
  campaign_active: IconSpeakerphone,
  campaign_leads: IconUsers,
  campaign_calls: IconPhoneCall,
  crm_sync: IconPlugConnected,
  calendar: IconCalendarPlus,
  enrichment: IconSearch,
  agents: IconRobot,
  custom_api: IconPlugConnected,
  recording: IconMicrophone,
  transcription: IconFileText,
  ai_insights: IconBrain
};

// ── Criteria ─────────────────────────────────────────────────────────────────

function foundationCriteria(
  data: JourneyOverview,
  hasOrg: boolean
): JourneyCriterion[] {
  const f = data.foundation;
  const callableNumbers = f.phoneNumbers + f.verifiedCallerIds;

  const criteria: JourneyCriterion[] = [
    {
      id: 'number',
      label: 'A number you can call from',
      detail:
        callableNumbers > 0
          ? plural(callableNumbers, 'number')
          : 'None connected',
      done: callableNumbers > 0,
      why: 'Nothing else in Ringee works until there is a number behind your calls.',
      weight: 100,
      action: {
        label: 'Get a number',
        href: '/dashboard/buy-number',
        adminOnly: true
      }
    },
    {
      id: 'contacts',
      label: 'People to call',
      detail:
        f.contacts > 0 ? plural(f.contacts, 'contact') : 'No contacts yet',
      done: f.contacts >= 10,
      why: 'A working list is what turns a dialer into a pipeline.',
      weight: 92,
      action: { label: 'Add contacts', href: '/dashboard/contact' }
    }
  ];

  if (hasOrg) {
    criteria.push({
      id: 'team',
      label: 'Your team is in the workspace',
      detail: plural(f.teamMembers, 'member'),
      done: f.teamMembers >= 2,
      why: 'Shared numbers, campaigns and reporting only pay off with more than one caller.',
      weight: 62
    });
  }

  criteria.push({
    id: 'device',
    label: 'A desk phone or softphone registered',
    detail: f.sipDevices > 0 ? plural(f.sipDevices, 'device') : 'Browser only',
    done: f.sipDevices >= 1,
    why: 'A registered SIP device keeps calling reliable when the browser is not enough.',
    weight: 26,
    action: {
      label: 'Add a device',
      href: '/dashboard/desk-phones',
      adminOnly: true
    }
  });

  // Rotation is only a real gap once there are numbers to rotate between.
  if (f.phoneNumbers >= 2) {
    criteria.push({
      id: 'rotation',
      label: 'Caller ID rotation in use',
      detail:
        f.rotationPoolNumbers > 0
          ? `${plural(f.rotationPoolNumbers, 'number')} rotating`
          : 'Not configured',
      done: f.rotationPoolNumbers >= 2,
      why: 'Spreading calls across numbers protects your answer rate as volume grows.',
      weight: 34,
      action: {
        label: 'Set up rotation',
        href: '/dashboard/number-rotation',
        adminOnly: true
      }
    });
  }

  return criteria;
}

function callingCriteria(data: JourneyOverview): JourneyCriterion[] {
  const a = data.activity;

  return [
    {
      id: 'first_call',
      label: 'First call placed',
      detail: a.calls > 0 || a.firstCallAt ? 'Done' : 'Not yet',
      done: a.calls > 0 || Boolean(a.firstCallAt),
      why: 'Everything the journey measures starts with one real conversation.',
      weight: 96,
      action: { label: 'Open the dialer', href: '/dashboard/call' }
    },
    {
      id: 'volume',
      label: 'Meaningful call volume',
      detail: `${compact(a.calls)} in ${data.window.days} days`,
      done: a.calls >= 20,
      why: 'Around 20 calls a month is where the numbers stop being noise and start being signal.',
      weight: 82,
      action: { label: 'Start calling', href: '/dashboard/call' }
    },
    {
      id: 'consistency',
      label: 'Calling on a regular rhythm',
      detail:
        a.activeDays > 0
          ? `${plural(a.activeDays, 'active day')}`
          : 'No activity',
      done: a.activeDays >= 5,
      why: 'Consistent days beat occasional bursts — pipeline compounds, spikes do not.',
      weight: 74,
      action: { label: 'Open the dialer', href: '/dashboard/call' }
    },
    {
      id: 'connect_rate',
      label: 'Reaching real people',
      detail: a.calls > 0 ? `${a.connectRate}% connect rate` : 'No data yet',
      done: a.calls >= 10 && a.connectRate >= 25,
      why: 'A low connect rate usually points at the number, the time of day or the list — all fixable.',
      weight: 44,
      action: { label: 'Review performance', href: '/dashboard/overview' }
    }
  ];
}

function pipelineCriteria(data: JourneyOverview): JourneyCriterion[] {
  const o = data.outcomes;
  const dispositioned = o.meetingsBooked + o.sales + o.interested + o.followUps;

  return [
    {
      id: 'outcomes',
      label: 'Call outcomes are being logged',
      detail:
        dispositioned > 0
          ? `${compact(dispositioned)} dispositioned`
          : 'Nothing logged',
      done: dispositioned > 0,
      why: 'Outcomes are what every report, insight and follow-up in Ringee is built on.',
      weight: 86,
      action: { label: 'Open the dialer', href: '/dashboard/call' }
    },
    {
      id: 'meetings',
      label: 'Meetings coming out of calls',
      detail:
        o.meetingsBooked + o.meetingsCreated > 0
          ? plural(o.meetingsBooked + o.meetingsCreated, 'meeting')
          : 'None yet',
      done: o.meetingsBooked + o.meetingsCreated > 0,
      why: 'Booked meetings are the clearest proof your outbound is working.',
      weight: 64,
      action: { label: 'Open meetings', href: '/dashboard/meetings' }
    },
    {
      id: 'followups',
      label: 'Follow-ups are scheduled, not remembered',
      detail:
        o.callbacksScheduled > 0
          ? plural(o.callbacksScheduled, 'callback')
          : 'None scheduled',
      done: o.callbacksScheduled > 0,
      why: 'Most deals are lost to a follow-up nobody wrote down.',
      weight: 56,
      action: { label: 'Open callbacks', href: '/dashboard/callbacks' }
    }
  ];
}

function campaignCriteria(data: JourneyOverview): JourneyCriterion[] {
  const c = data.campaigns;
  if (!c) return [];

  return [
    {
      id: 'campaign_created',
      label: 'A campaign is set up',
      detail: c.total > 0 ? plural(c.total, 'campaign') : 'None yet',
      done: c.total > 0,
      why: 'Campaigns are how outbound stops being personal effort and starts being a process.',
      weight: 76,
      action: {
        label: 'Create a campaign',
        href: '/dashboard/campaigns',
        adminOnly: true
      }
    },
    {
      id: 'campaign_active',
      label: 'A campaign is running',
      detail:
        c.active > 0 ? plural(c.active, 'active campaign') : 'None active',
      done: c.active > 0,
      why: 'A campaign only produces once it is active and someone is dialing it.',
      weight: 68,
      action: {
        label: 'Open campaigns',
        href: '/dashboard/campaigns',
        adminOnly: true
      }
    },
    {
      id: 'campaign_leads',
      label: 'Leads loaded into campaigns',
      detail: c.leads > 0 ? compact(c.leads) : 'No leads',
      done: c.leads >= 25,
      why: 'A campaign without depth in the list stalls within days.',
      weight: 58,
      action: {
        label: 'Import leads',
        href: '/dashboard/campaigns',
        adminOnly: true
      }
    },
    {
      id: 'campaign_calls',
      label: 'Calls are coming from campaigns',
      detail:
        c.callsFromCampaigns > 0
          ? `${compact(c.callsFromCampaigns)} calls`
          : 'None yet',
      done: c.callsFromCampaigns > 0,
      why: 'Campaign-driven calls are the ones you can measure, compare and improve.',
      weight: 48,
      action: {
        label: 'Open campaigns',
        href: '/dashboard/campaigns',
        adminOnly: true
      }
    }
  ];
}

function integrationCriteria(data: JourneyOverview): JourneyCriterion[] {
  const i = data.integrations;
  const crmConnected = i.crm.connected || i.customCrm.connected;

  return [
    {
      id: 'crm_sync',
      label: 'Calls reach your CRM',
      detail: crmConnected
        ? [...i.crm.providers.map(prettyProvider), ...i.customCrm.providers]
            .slice(0, 2)
            .join(', ') || 'Connected'
        : 'Not connected',
      done: crmConnected,
      why: 'Native CRM or your own system through the integration API — either way, calls and outcomes should land where your pipeline lives.',
      weight: 80,
      action: {
        label: 'Connect a CRM',
        href: '/dashboard/settings/integrations',
        adminOnly: true
      }
    },
    {
      id: 'calendar',
      label: 'Meetings land on a real calendar',
      detail: i.meetings.connected
        ? i.meetings.providers.map(prettyProvider).join(', ')
        : 'Not connected',
      done: i.meetings.connected,
      why: 'Booking straight into Google or Microsoft removes the gap where meetings get lost.',
      weight: 70,
      action: { label: 'Connect a calendar', href: '/dashboard/meetings' }
    },
    {
      id: 'enrichment',
      label: 'A source of new leads',
      detail: i.enrichment.connected
        ? i.enrichment.providers.map(prettyProvider).join(', ')
        : 'Not connected',
      done: i.enrichment.connected,
      why: 'Apollo or Prospeo keep the list full, so calling never stops for lack of people to call.',
      weight: 60,
      action: {
        label: 'Connect lead sourcing',
        href: '/dashboard/settings/integrations',
        adminOnly: true
      }
    },
    {
      id: 'agents',
      label: 'AI agents can work in Ringee',
      detail: i.mcp.connected
        ? `${plural(i.mcp.sessions, 'agent session')}`
        : 'Not connected',
      done: i.mcp.connected,
      why: 'MCP lets Claude, ChatGPT or your own agent prospect, queue calls and file outcomes for you.',
      weight: 50,
      action: {
        label: 'Connect an agent',
        href: '/dashboard/settings/integrations',
        adminOnly: true
      }
    },
    {
      id: 'custom_api',
      label: 'Your own systems are wired in',
      detail: i.customCrm.connected
        ? plural(i.customCrm.count, 'integration')
        : 'Not connected',
      done: i.customCrm.connected,
      why: 'The custom integration API pushes call events into anything you run in-house.',
      weight: 24,
      action: {
        label: 'Open integrations',
        href: '/dashboard/settings/integrations',
        adminOnly: true
      }
    }
  ];
}

function intelligenceCriteria(data: JourneyOverview): JourneyCriterion[] {
  const n = data.intelligence;

  return [
    {
      id: 'recording',
      label: 'Calls are recorded',
      detail: n.recordingEnabled ? 'Enabled' : 'Off',
      done: n.recordingEnabled,
      why: 'Recording is the raw material for coaching, transcripts and every AI feature.',
      weight: 46,
      action: {
        label: 'Enable recording',
        href: '/dashboard/settings/overview',
        adminOnly: true
      }
    },
    {
      id: 'transcription',
      label: 'Calls are transcribed',
      detail: n.transcriptionEnabled
        ? `${compact(n.transcriptions)} transcribed`
        : 'Off',
      done: n.transcriptionEnabled || n.transcriptions > 0,
      why: 'Transcripts turn conversations into something you can search, review and learn from.',
      weight: 54,
      action: {
        label: 'Enable transcription',
        href: '/dashboard/settings/overview',
        adminOnly: true
      }
    },
    {
      id: 'ai_insights',
      label: 'AI is analysing your calls',
      detail: n.aiEnabled
        ? plural(n.aiPipelinesEnabled, 'pipeline active')
        : 'Off',
      done: n.aiEnabled,
      why: 'Follow-up recommendations and objection insight surface the work you would otherwise miss.',
      weight: 52,
      action: {
        label: 'Open AI Pipeline',
        href: '/dashboard/ai-pipeline',
        adminOnly: true
      }
    }
  ];
}

// ── Stage classification ─────────────────────────────────────────────────────
// Signals are shared with the reward requirements (`./signals`), so the
// classifier and the unlock checklists always read the same facts.

/**
 * Organization ladder — evaluated most-mature first, so a workspace always lands
 * on the highest stage it genuinely qualifies for.
 */
function classifyOrganization(s: StageSignals): JourneyStageId {
  if (
    s.teamMembers >= 3 &&
    s.activeCampaigns >= 2 &&
    (s.numbers >= 3 || s.rotation) &&
    s.sipDevices >= 1 &&
    s.calls >= 100
  ) {
    return 'call_center';
  }

  if (s.aiSurface && s.calls >= 20) return 'ai_sales_team';

  if (
    s.activeCampaigns >= 1 &&
    s.numbers >= 1 &&
    (s.calls >= 20 || s.activeCampaigns >= 2 || s.rotation)
  ) {
    return 'campaign_operator';
  }

  if (s.teamMembers >= 2 && (s.campaigns >= 1 || s.numbers >= 1)) {
    return 'small_team';
  }

  return 'solo_caller';
}

/**
 * Freelancer ladder. Campaigns are deliberately absent — they require an
 * organization, so a personal workspace is never measured on them. Maturity here
 * is consistency, then an integrated stack, then AI, then agents.
 */
function classifyPersonal(s: StageSignals): JourneyStageId {
  if (
    s.agentConnected &&
    s.agentDriving &&
    s.aiSurface &&
    s.calls >= 20 &&
    (s.crmConnected || s.calendarConnected)
  ) {
    return 'agentic_operator';
  }

  if (s.aiSurface && s.calls >= 20) return 'ai_closer';

  if (
    (s.crmConnected || s.calendarConnected || s.enrichmentConnected) &&
    s.calls >= 10
  ) {
    return 'connected_operator';
  }

  if (s.calls >= 20 || (s.calls >= 10 && s.activeDays >= 5)) {
    return 'consistent_caller';
  }

  return 'solo_caller';
}

// ── Narrative ────────────────────────────────────────────────────────────────

function buildReasons(
  data: JourneyOverview,
  s: StageSignals,
  hasOrg: boolean
): Array<{ label: string; positive: boolean }> {
  const reasons: Array<{ label: string; positive: boolean }> = [];

  if (hasOrg) {
    reasons.push({
      label: plural(s.teamMembers, 'person', 'people') + ' in the workspace',
      positive: s.teamMembers > 1
    });
  }

  reasons.push({
    label: `${plural(s.numbers, 'number')} you can call from`,
    positive: s.numbers > 0
  });

  reasons.push({
    label: `${compact(s.calls)} calls over the last ${data.window.days} days`,
    positive: s.calls > 0
  });

  reasons.push({
    label:
      s.activeDays > 0
        ? `Calling on ${plural(s.activeDays, 'day')}`
        : 'No calling days yet',
    positive: s.activeDays >= 5
  });

  if (hasOrg) {
    reasons.push({
      label: plural(s.activeCampaigns, 'active campaign'),
      positive: s.activeCampaigns > 0
    });
  }

  const connectedFamilies = [
    s.crmConnected,
    s.calendarConnected,
    s.enrichmentConnected,
    s.agentConnected
  ].filter(Boolean).length;

  reasons.push({
    label:
      connectedFamilies > 0
        ? `${plural(connectedFamilies, 'integration')} connected`
        : 'No integrations connected',
    positive: connectedFamilies > 0
  });

  reasons.push({
    label: s.aiSurface
      ? 'Recording, transcription or AI is on'
      : 'Calls are not being recorded or analysed',
    positive: s.aiSurface
  });

  return reasons;
}

function buildHighlights(data: JourneyOverview): JourneyHighlight[] {
  const a = data.activity;
  const o = data.outcomes;

  return [
    {
      id: 'calls',
      label: 'Calls',
      value: compact(a.calls),
      hint: `last ${data.window.days} days`,
      trendPct: a.callsTrendPct,
      Icon: IconPhoneCall
    },
    {
      id: 'connect',
      label: 'Connect rate',
      value: `${a.connectRate}%`,
      hint: `${compact(a.connectedCalls)} reached a person`,
      Icon: IconAdjustmentsBolt
    },
    {
      id: 'talk',
      label: 'Talk time',
      value: `${compact(a.minutes)} min`,
      hint: `${plural(a.activeDays, 'active day')}`,
      Icon: IconWaveSine
    },
    {
      id: 'meetings',
      label: 'Meetings',
      value: compact(o.meetingsBooked + o.meetingsCreated),
      hint: `${compact(o.sales)} closed · ${compact(o.callbacksScheduled)} follow-ups`,
      Icon: IconCalendarPlus
    }
  ];
}

/** Human names for `Call.source`, the channel a call came through. */
const CHANNEL_LABELS: Record<string, string> = {
  web: 'Web dialer',
  chrome_extension: 'Browser extension',
  mobile: 'Mobile app',
  campaign: 'Campaign dialer',
  session: 'Call session / agent',
  sip_device: 'Desk phone',
  sdk: 'Embedded SDK'
};

function buildChannels(data: JourneyOverview): JourneyChannel[] {
  const total = data.activity.calls;
  if (total === 0) return [];

  return data.activity.bySource.map((row) => ({
    id: row.source,
    label: CHANNEL_LABELS[row.source] ?? row.source,
    calls: row.calls,
    share: Math.round((row.calls / total) * 100)
  }));
}

function buildOutcomeMix(data: JourneyOverview): JourneyOutcomeSlice[] {
  const o = data.outcomes;
  const slices = [
    {
      id: 'meetings',
      label: 'Meetings booked',
      value: o.meetingsBooked,
      Icon: IconCalendarPlus
    },
    { id: 'sales', label: 'Closed', value: o.sales, Icon: IconTargetArrow },
    {
      id: 'interested',
      label: 'Interested',
      value: o.interested,
      Icon: IconWaveSine
    },
    {
      id: 'followups',
      label: 'Follow-up needed',
      value: o.followUps,
      Icon: IconRepeat
    },
    {
      id: 'callbacks',
      label: 'Callbacks scheduled',
      value: o.callbacksScheduled,
      Icon: IconPhoneCall
    }
  ];

  // Bars are relative to the biggest bucket, so the mix stays readable even when
  // the absolute numbers are small.
  const max = Math.max(...slices.map((s) => s.value), 1);

  return slices.map((slice) => ({
    ...slice,
    share: Math.round((slice.value / max) * 100)
  }));
}

function buildIntegrationCards(
  data: JourneyOverview
): JourneyIntegrationCard[] {
  const i = data.integrations;

  return [
    {
      id: 'crm',
      name: 'CRM',
      description:
        'Push calls, outcomes and notes into HubSpot, Attio, Salesforce or Odoo.',
      connected: i.crm.connected,
      providers: i.crm.providers.map(prettyProvider),
      stats: [{ label: 'calls synced', value: compact(i.crm.syncedCalls) }],
      action: {
        label: i.crm.connected ? 'Manage' : 'Connect',
        href: '/dashboard/settings/integrations',
        adminOnly: true
      },
      Icon: IconPlugConnected,
      accent: 'text-orange-500 dark:text-orange-400',
      tint: 'bg-orange-500/10'
    },
    {
      id: 'customCrm',
      name: 'Custom CRM',
      description:
        'Wire your own system through the integration API and signed webhooks.',
      connected: i.customCrm.connected,
      providers: i.customCrm.providers,
      stats: [
        { label: 'events out', value: compact(i.customCrm.deliveries) },
        { label: 'events in', value: compact(i.customCrm.inboundEvents) }
      ],
      action: {
        label: i.customCrm.connected ? 'Manage' : 'Connect',
        href: '/dashboard/settings/integrations',
        adminOnly: true
      },
      Icon: IconAdjustmentsBolt,
      accent: 'text-slate-500 dark:text-slate-300',
      tint: 'bg-slate-500/10'
    },
    {
      id: 'meetings',
      name: 'Calendar',
      description:
        'Book meetings straight into Google Calendar or Microsoft 365 from a call.',
      connected: i.meetings.connected,
      providers: i.meetings.providers.map(prettyProvider),
      stats: [
        { label: 'meetings synced', value: compact(i.meetings.syncedMeetings) }
      ],
      action: {
        label: i.meetings.connected ? 'Manage' : 'Connect',
        href: '/dashboard/meetings'
      },
      Icon: IconCalendarPlus,
      accent: 'text-blue-500 dark:text-blue-400',
      tint: 'bg-blue-500/10'
    },
    {
      id: 'enrichment',
      name: 'Lead sourcing',
      description:
        'Find and reveal new leads with Apollo or Prospeo, then call them the same day.',
      connected: i.enrichment.connected,
      providers: i.enrichment.providers.map(prettyProvider),
      stats: [
        { label: 'searches', value: compact(i.enrichment.searches) },
        { label: 'enriched', value: compact(i.enrichment.enrichedContacts) }
      ],
      action: {
        label: i.enrichment.connected ? 'Manage' : 'Connect',
        href: '/dashboard/settings/integrations',
        adminOnly: true
      },
      Icon: IconSearch,
      accent: 'text-emerald-500 dark:text-emerald-400',
      tint: 'bg-emerald-500/10'
    },
    {
      id: 'mcp',
      name: 'AI agents (MCP)',
      description:
        'Let Claude, ChatGPT or your own agent prospect, queue calls and log outcomes.',
      connected: i.mcp.connected,
      providers: i.mcp.connected ? ['MCP'] : [],
      stats: [
        { label: 'agent sessions', value: compact(i.mcp.sessions) },
        { label: 'calls driven', value: compact(i.mcp.callsInWindow) }
      ],
      action: {
        label: i.mcp.connected ? 'Manage' : 'Connect',
        href: '/dashboard/settings/integrations',
        adminOnly: true
      },
      Icon: IconRobot,
      accent: 'text-fuchsia-500 dark:text-fuchsia-400',
      tint: 'bg-fuchsia-500/10'
    }
  ];
}

// ── Assembly ─────────────────────────────────────────────────────────────────

function toPillar(
  id: JourneyPillarId,
  criteria: JourneyCriterion[]
): JourneyPillar {
  const meta = PILLAR_META[id];
  const completed = criteria.filter((c) => c.done).length;
  const total = criteria.length;

  return {
    id,
    ...meta,
    criteria,
    completed,
    total,
    score: total > 0 ? Math.round((completed / total) * 100) : 0
  };
}

export function buildJourney(input: {
  data: JourneyOverview;
  /** Freelancer or org admin. Plain members get no admin-only CTAs. */
  canAccessAdminFeatures: boolean;
}): JourneyModel {
  const { data, canAccessAdminFeatures } = input;
  const hasOrg = data.scope === 'organization';
  const signals = signalsFrom(data);

  const pillars: JourneyPillar[] = [
    toPillar('foundation', foundationCriteria(data, hasOrg)),
    toPillar('calling', callingCriteria(data)),
    toPillar('pipeline', pipelineCriteria(data)),
    // Campaigns require an organization — a freelancer workspace is never
    // measured on a feature it cannot use.
    ...(data.campaignsAvailable
      ? [toPillar('campaigns', campaignCriteria(data))]
      : []),
    toPillar('integrations', integrationCriteria(data)),
    toPillar('intelligence', intelligenceCriteria(data))
  ];

  const allCriteria = pillars.flatMap((p) => p.criteria);
  const doneCount = allCriteria.filter((c) => c.done).length;

  const stageId = hasOrg
    ? classifyOrganization(signals)
    : classifyPersonal(signals);
  const ladderIds = journeyLadder(hasOrg);
  const ladder = ladderIds.map((id) => JOURNEY_STAGES[id]);
  const stageIndex = ladderIds.indexOf(stageId);

  const missing = allCriteria
    .filter((c) => !c.done)
    .sort((a, b) => b.weight - a.weight);

  const toStep = (c: JourneyCriterion): JourneyStep => {
    const pillar = pillars.find((p) =>
      p.criteria.some((item) => item.id === c.id)
    );
    return {
      id: c.id,
      title: c.label,
      description: c.why,
      action: c.action as JourneyAction,
      pillar: pillar?.id ?? 'foundation',
      Icon: STEP_ICONS[c.id] ?? IconTargetArrow,
      tint: pillar?.tint ?? PILLAR_META.foundation.tint,
      accent: pillar?.accent ?? PILLAR_META.foundation.accent
    };
  };

  // A step is only worth recommending if the person looking at it can act on
  // it: plain org members never see admin-only work they cannot do. What they
  // *would* need an admin for is surfaced separately, so nothing is hidden.
  const actionable = missing.filter(
    (c) => c.action && (canAccessAdminFeatures || !c.action.adminOnly)
  );
  const blockedSteps = canAccessAdminFeatures
    ? []
    : missing.filter((c) => c.action?.adminOnly);

  const allSteps = actionable.map(toStep);
  const nextSteps = allSteps.slice(0, 4);

  return {
    stage: JOURNEY_STAGES[stageId],
    ladder,
    stageIndex,
    nextStage: stageIndex >= 0 ? (ladder[stageIndex + 1] ?? null) : null,
    hasOrg,
    notStartedYet: signals.calls === 0 && signals.numbers === 0,
    scopedToMember: data.scopedToMember,
    windowDays: data.window.days,
    score:
      allCriteria.length > 0
        ? Math.round((doneCount / allCriteria.length) * 100)
        : 0,
    pillars,
    highlights: buildHighlights(data),
    reasons: buildReasons(data, signals, hasOrg),
    missing: missing.slice(0, 6),
    nextSteps,
    allSteps,
    blockedSteps,
    integrations: buildIntegrationCards(data),
    activity: data.activity,
    outcomes: data.outcomes,
    channels: buildChannels(data),
    outcomeMix: buildOutcomeMix(data),
    campaigns: data.campaigns,
    rewards: buildRewardTrack(data)
  };
}
