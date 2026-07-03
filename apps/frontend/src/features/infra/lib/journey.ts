import {
  IconUser,
  IconUsers,
  IconSpeakerphone,
  IconSparkles,
  IconBuildingBroadcastTower,
  IconPhone,
  IconDeviceLandlinePhone,
  IconStack2,
  IconFileText,
  IconChartHistogram,
  IconShieldCheck,
  IconCoin,
  IconBulb,
  type IconProps
} from '@tabler/icons-react';
import type { ComponentType } from 'react';
import { buildAdjacency, nodeReadiness } from './readiness';
import { buildHealth } from './usage-health';
import {
  RESOURCE_META,
  isPersonalProfile,
  type InspectorTab
} from './node-config';
import type {
  InfraEdge,
  InfraNode,
  InfraJourneySignals,
  InfrastructureResourceType
} from '../types';
import type { UsageSection } from '../components/usage/usage-sections';

/**
 * Journey — internally the "Ryan Buckets" maturity segmentation, surfaced to the
 * user as their "call center journey". A deterministic classifier: it places the
 * active workspace on one of five maturity stages from the resource inventory
 * (the overview nodes/edges) plus a few backend signals (30-day call volume,
 * recording / transcription / AI switches), then explains *why*, what's missing,
 * and what to build next. No AI, no invented data — same inputs always yield the
 * same stage.
 */

export type JourneyStageId =
  | 'solo_caller'
  | 'small_team'
  | 'campaign_operator'
  | 'ai_driven'
  | 'call_center';

/** Fixed order of maturity — also the display order of the progress path. */
export const JOURNEY_STAGE_ORDER: JourneyStageId[] = [
  'solo_caller',
  'small_team',
  'campaign_operator',
  'ai_driven',
  'call_center'
];

export interface JourneyStageMeta {
  id: JourneyStageId;
  /** Short name shown on the path + current-stage card. */
  name: string;
  /** The one-line message for this stage ("You are running real campaigns."). */
  message: string;
  /** A longer, human description for the current-stage card. */
  summary: string;
  /** One-word essence used on the path node. */
  focus: string;
  /** True when this stage only makes sense inside an organization. */
  orgOnly: boolean;
  Icon: ComponentType<IconProps>;
  /** Tailwind text accent (e.g. "text-amber-400"). */
  accent: string;
  /** Tailwind tint background (e.g. "bg-amber-500/15"). */
  tint: string;
  /** Solid bar/fill colour for the progress path. */
  solid: string;
  /** Ring colour for the highlighted current-stage node (static, JIT-safe). */
  ring: string;
}

export const JOURNEY_STAGES: Record<JourneyStageId, JourneyStageMeta> = {
  solo_caller: {
    id: 'solo_caller',
    name: 'Solo Caller',
    message: 'You are starting with a simple calling setup.',
    summary:
      'You are getting started — a lean setup focused on making your first calls and learning what works.',
    focus: 'Getting started',
    orgOnly: false,
    Icon: IconUser,
    accent: 'text-sky-400',
    tint: 'bg-sky-500/15',
    solid: 'bg-sky-500',
    ring: 'ring-sky-400/40'
  },
  small_team: {
    id: 'small_team',
    name: 'Small Team',
    message: 'You are building a small outbound team.',
    summary:
      'A few people are calling together. Now it pays to assign agents, connect numbers to campaigns and keep an eye on the team.',
    focus: 'Building a team',
    orgOnly: true,
    Icon: IconUsers,
    accent: 'text-violet-400',
    tint: 'bg-violet-500/15',
    solid: 'bg-violet-500',
    ring: 'ring-violet-400/40'
  },
  campaign_operator: {
    id: 'campaign_operator',
    name: 'Campaign Operator',
    message: 'You are running real outbound campaigns.',
    summary:
      'You run outbound campaigns and are starting to manage numbers, agents and performance as one system.',
    focus: 'Running campaigns',
    orgOnly: false,
    Icon: IconSpeakerphone,
    accent: 'text-amber-400',
    tint: 'bg-amber-500/15',
    solid: 'bg-amber-500',
    ring: 'ring-amber-400/40'
  },
  ai_driven: {
    id: 'ai_driven',
    name: 'AI-Driven Sales Team',
    message: 'You are ready to use AI to improve your outbound process.',
    summary:
      'You have the call volume and the recordings to let AI do real work — surfacing objections, follow-ups and better scripts.',
    focus: 'Working with AI',
    orgOnly: false,
    Icon: IconSparkles,
    accent: 'text-fuchsia-400',
    tint: 'bg-fuchsia-500/15',
    solid: 'bg-fuchsia-500',
    ring: 'ring-fuchsia-400/40'
  },
  call_center: {
    id: 'call_center',
    name: 'Call Center Infrastructure',
    message: 'You are managing a full calling infrastructure.',
    summary:
      'Multiple agents, numbers, pools, devices and campaigns run as one operation. The work now is health, cost control and quality.',
    focus: 'Operating at scale',
    orgOnly: true,
    Icon: IconBuildingBroadcastTower,
    accent: 'text-emerald-400',
    tint: 'bg-emerald-500/15',
    solid: 'bg-emerald-500',
    ring: 'ring-emerald-400/40'
  }
};

// ── Actions a Journey CTA can trigger ────────────────────────────────────────

export type JourneyAction =
  | { kind: 'add'; resource: InfrastructureResourceType }
  | { kind: 'focus'; nodeId: string; tab?: InspectorTab }
  | { kind: 'section'; section: UsageSection }
  | { kind: 'route'; href: string };

export interface JourneyReason {
  label: string;
  /** true → a fact that puts them here; false → a gap that holds them here. */
  positive: boolean;
}

export interface JourneyMissing {
  id: string;
  label: string;
  hint?: string;
  /** Optional deep-link to resolve it. */
  action?: JourneyAction;
}

export interface JourneyNextStep {
  id: string;
  title: string;
  description: string;
  ctaLabel: string;
  action: JourneyAction;
  Icon: ComponentType<IconProps>;
  /** Combined tint + accent classes for the icon tile. */
  tile: string;
}

export interface JourneyState {
  stage: JourneyStageMeta;
  stageIndex: number;
  totalStages: number;
  /** No resources and no calls yet — show the "Not enough activity" framing. */
  notEnoughData: boolean;
  hasOrg: boolean;
  reasons: JourneyReason[];
  missing: JourneyMissing[];
  nextSteps: JourneyNextStep[];
  /** The derived counts, for display in the current-stage card. */
  metrics: JourneyMetrics;
}

interface JourneyMetrics {
  teamMembers: number;
  numbers: number;
  sipDevices: number;
  campaigns: number;
  activeCampaigns: number;
  poolConfigured: boolean;
  integrations: number;
  callsLast30d: number;
  minutesLast30d: number;
  recordingEnabled: boolean;
  transcriptionEnabled: boolean;
  transcriptionsLast30d: number;
  aiEnabled: boolean;
}

// ── Derivation ───────────────────────────────────────────────────────────────

const ACTIVE_CAMPAIGN = new Set(['active', 'running']);

function deriveMetrics(
  nodes: InfraNode[],
  signals: InfraJourneySignals,
  hasOrg: boolean
): JourneyMetrics {
  let teamMembers = 0;
  let numbers = 0;
  let sipDevices = 0;
  let campaigns = 0;
  let activeCampaigns = 0;
  let integrations = 0;
  let poolConfigured = false;

  for (const n of nodes) {
    switch (n.type) {
      case 'TEAM_MEMBER':
        // The personal-workspace "You" profile is not a teammate.
        if (!isPersonalProfile(n, hasOrg)) teamMembers++;
        break;
      case 'PHONE_NUMBER':
        numbers++;
        break;
      case 'SIP_DEVICE':
        sipDevices++;
        break;
      case 'CAMPAIGN':
        campaigns++;
        if (ACTIVE_CAMPAIGN.has(n.status.toLowerCase())) activeCampaigns++;
        break;
      case 'NUMBER_POOL': {
        // A pool only "counts" once it actually rotates across ≥2 numbers.
        const members = Number(n.metadata?.members ?? 0);
        if (members >= 2 || n.status.toLowerCase() === 'active') {
          poolConfigured = true;
        }
        break;
      }
      case 'ROUTING_RULE':
        poolConfigured = true;
        break;
      case 'INTEGRATION':
        integrations++;
        break;
    }
  }

  return {
    teamMembers,
    numbers,
    sipDevices,
    campaigns,
    activeCampaigns,
    poolConfigured,
    integrations,
    callsLast30d: signals.callsLast30d,
    minutesLast30d: signals.minutesLast30d,
    recordingEnabled: signals.recordingEnabled,
    transcriptionEnabled: signals.transcriptionEnabled,
    transcriptionsLast30d: signals.transcriptionsLast30d,
    aiEnabled: signals.aiEnabled
  };
}

/** Any recording / transcription / AI is on or has produced output. */
function hasAiSurface(m: JourneyMetrics): boolean {
  return (
    m.recordingEnabled ||
    m.transcriptionEnabled ||
    m.transcriptionsLast30d > 0 ||
    m.aiEnabled
  );
}

/**
 * Deterministic stage ladder — evaluated top (most mature) down; the first match
 * wins, so the workspace always lands on the highest stage it qualifies for.
 */
function classify(m: JourneyMetrics, hasOrg: boolean): JourneyStageId {
  // Call Center Infrastructure — a broad, scaled operation.
  if (
    hasOrg &&
    m.teamMembers >= 3 &&
    m.activeCampaigns >= 2 &&
    (m.numbers >= 3 || m.poolConfigured) &&
    m.sipDevices >= 1 &&
    m.callsLast30d >= 100
  ) {
    return 'call_center';
  }

  // AI-Driven Sales Team — recordings/transcripts/AI in play, with the volume to
  // make them worthwhile.
  if (hasAiSurface(m) && m.callsLast30d >= 20) {
    return 'ai_driven';
  }

  // Campaign Operator — real campaigns with recurring calls.
  if (
    m.activeCampaigns >= 1 &&
    m.numbers >= 1 &&
    (m.callsLast30d >= 20 || m.activeCampaigns >= 2 || m.poolConfigured)
  ) {
    return 'campaign_operator';
  }

  // Small Team — an organization with a couple of people getting set up.
  if (hasOrg && m.teamMembers >= 2 && (m.campaigns >= 1 || m.numbers >= 1)) {
    return 'small_team';
  }

  return 'solo_caller';
}

// ── Content builders ─────────────────────────────────────────────────────────

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

function buildReasons(m: JourneyMetrics, hasOrg: boolean): JourneyReason[] {
  const reasons: JourneyReason[] = [];

  if (hasOrg) {
    reasons.push({
      label: plural(m.teamMembers, 'team member'),
      positive: m.teamMembers > 0
    });
  }
  reasons.push({
    label: `${plural(m.numbers, 'phone number')} connected`,
    positive: m.numbers > 0
  });
  if (hasOrg || m.campaigns > 0) {
    reasons.push({
      label: plural(m.activeCampaigns, 'active campaign'),
      positive: m.activeCampaigns > 0
    });
  }
  if (m.sipDevices > 0) {
    reasons.push({ label: plural(m.sipDevices, 'SIP device'), positive: true });
  }
  reasons.push({
    label: `${plural(m.callsLast30d, 'call')} in the last 30 days`,
    positive: m.callsLast30d > 0
  });
  if (m.transcriptionEnabled || m.transcriptionsLast30d > 0) {
    reasons.push({ label: 'Transcription enabled', positive: true });
  }
  if (m.aiEnabled) {
    reasons.push({ label: 'AI insights active', positive: true });
  }
  if (!m.poolConfigured && m.numbers >= 2) {
    reasons.push({ label: 'No number pool configured yet', positive: false });
  }

  return reasons;
}

function buildMissing(
  nodes: InfraNode[],
  edges: InfraEdge[],
  m: JourneyMetrics,
  hasOrg: boolean
): JourneyMissing[] {
  const items: JourneyMissing[] = [];

  // Per-node problems, surfaced from the exact same readiness the canvas uses.
  const health = buildHealth(nodes, edges, hasOrg);
  const adj = buildAdjacency(nodes, edges);
  for (const group of health.groups) {
    for (const item of group.items) {
      const r = nodes.find((n) => n.id === item.nodeId);
      const fix = r
        ? nodeReadiness(r, adj.get(r.id), hasOrg).fixTab
        : undefined;
      items.push({
        id: `node-${item.nodeId}`,
        label: `${item.name} · ${item.label.toLowerCase()}`,
        hint: item.hint,
        action: { kind: 'focus', nodeId: item.nodeId, tab: fix }
      });
    }
  }

  // Structural gaps — the pieces a maturing operation typically wants next.
  if (m.numbers === 0) {
    items.push({
      id: 'no-number',
      label: 'No phone number connected',
      action: { kind: 'add', resource: 'PHONE_NUMBER' }
    });
  }
  if (hasOrg && m.campaigns === 0) {
    items.push({
      id: 'no-campaign',
      label: 'No campaign created yet',
      action: { kind: 'add', resource: 'CAMPAIGN' }
    });
  }
  if (m.sipDevices === 0 && m.callsLast30d > 0) {
    items.push({
      id: 'no-sip',
      label: 'No registered SIP device',
      action: { kind: 'add', resource: 'SIP_DEVICE' }
    });
  }
  if (!m.poolConfigured && m.numbers >= 2) {
    items.push({
      id: 'no-pool',
      label: 'No number pool configured',
      action: { kind: 'route', href: '/dashboard/number-rotation' }
    });
  }
  if (!m.transcriptionEnabled && m.callsLast30d >= 20) {
    items.push({
      id: 'no-transcription',
      label: 'Transcription is not enabled',
      action: { kind: 'route', href: '/dashboard/settings/overview' }
    });
  }

  // Keep it a focused diagnosis, not a wall.
  return items.slice(0, 5);
}

/** A next-step card built off a resource type (icon + tint from RESOURCE_META). */
function resourceStep(
  id: string,
  resource: InfrastructureResourceType,
  title: string,
  description: string,
  ctaLabel: string,
  action: JourneyAction
): JourneyNextStep {
  const meta = RESOURCE_META[resource];
  return {
    id,
    title,
    description,
    ctaLabel,
    action,
    Icon: meta.Icon,
    tile: meta.badge
  };
}

function buildNextSteps(
  nodes: InfraNode[],
  edges: InfraEdge[],
  stage: JourneyStageId,
  m: JourneyMetrics,
  hasOrg: boolean
): JourneyNextStep[] {
  const steps: JourneyNextStep[] = [];
  const health = buildHealth(nodes, edges, hasOrg);

  const findProblem = (types: InfrastructureResourceType[], states: string[]) =>
    health.groups
      .flatMap((g) => g.items)
      .find(
        (it) =>
          types.includes(it.type) && states.includes(it.label.toLowerCase())
      );

  // Foundational gaps first — these apply at any stage.
  if (m.numbers === 0) {
    steps.push(
      resourceStep(
        'add-number',
        'PHONE_NUMBER',
        'Add a phone number',
        'Connect a number so you can start calling.',
        'Add number',
        { kind: 'add', resource: 'PHONE_NUMBER' }
      )
    );
  }
  if (hasOrg && m.campaigns === 0) {
    steps.push(
      resourceStep(
        'create-campaign',
        'CAMPAIGN',
        'Create your first campaign',
        'Group your calling into a campaign you can measure.',
        'Create campaign',
        { kind: 'add', resource: 'CAMPAIGN' }
      )
    );
  }

  // A campaign missing its number → precise inspector deep-link.
  const campaignNeedsNumber = findProblem(['CAMPAIGN'], ['needs number']);
  if (campaignNeedsNumber) {
    steps.push({
      id: 'assign-number',
      title: 'Connect a number to your campaign',
      description: `${campaignNeedsNumber.name} can't place calls without a number.`,
      ctaLabel: 'Open campaign',
      action: {
        kind: 'focus',
        nodeId: campaignNeedsNumber.nodeId,
        tab: 'numbers'
      },
      Icon: IconPhone,
      tile: RESOURCE_META.CAMPAIGN.badge
    });
  }

  // A campaign missing agents (org only).
  const campaignNeedsAgents = findProblem(['CAMPAIGN'], ['needs agents']);
  if (hasOrg && campaignNeedsAgents) {
    steps.push({
      id: 'assign-agents',
      title: 'Assign agents to your campaign',
      description: `${campaignNeedsAgents.name} has no one calling yet.`,
      ctaLabel: 'Open campaign',
      action: {
        kind: 'focus',
        nodeId: campaignNeedsAgents.nodeId,
        tab: 'agents'
      },
      Icon: IconUsers,
      tile: RESOURCE_META.TEAM_MEMBER.badge
    });
  }

  // An offline / unregistered device.
  const deviceOffline = findProblem(['SIP_DEVICE'], ['not registered']);
  if (deviceOffline) {
    steps.push({
      id: 'fix-device',
      title: 'Register your SIP device',
      description: `${deviceOffline.name} is not registered yet.`,
      ctaLabel: 'Open device',
      action: {
        kind: 'focus',
        nodeId: deviceOffline.nodeId,
        tab: 'registration'
      },
      Icon: IconDeviceLandlinePhone,
      tile: RESOURCE_META.SIP_DEVICE.badge
    });
  }

  // Stage-specific advancement steps.
  const push = (s: JourneyNextStep) => {
    if (!steps.some((e) => e.id === s.id)) steps.push(s);
  };

  const addAgents = () =>
    resourceStep(
      'add-agents',
      'TEAM_MEMBER',
      'Add your team',
      'Bring teammates in so more than one person can call.',
      'Add agents',
      { kind: 'add', resource: 'TEAM_MEMBER' }
    );

  const connectSip = () =>
    resourceStep(
      'connect-sip',
      'SIP_DEVICE',
      'Connect a SIP device',
      'Call from a desk phone or softphone with a registered device.',
      'Add device',
      { kind: 'add', resource: 'SIP_DEVICE' }
    );

  const createPool = (): JourneyNextStep => ({
    id: 'create-pool',
    title: 'Create a number pool',
    description: 'Rotate multiple caller IDs across your campaigns.',
    ctaLabel: 'Create pool',
    action: { kind: 'route', href: '/dashboard/number-rotation' },
    Icon: IconStack2,
    tile: RESOURCE_META.NUMBER_POOL.badge
  });

  const enableTranscription = (): JourneyNextStep => ({
    id: 'enable-transcription',
    title: 'Enable transcription',
    description: 'Start learning from your calls automatically.',
    ctaLabel: 'Enable',
    action: { kind: 'route', href: '/dashboard/settings/overview' },
    Icon: IconFileText,
    tile: 'bg-fuchsia-500/15 text-fuchsia-400'
  });

  const reviewInsights = (): JourneyNextStep => ({
    id: 'review-insights',
    title: 'Review call insights',
    description: 'See AI follow-ups and objections from recent calls.',
    ctaLabel: 'Open insights',
    action: { kind: 'route', href: '/dashboard/pending-actions' },
    Icon: IconBulb,
    tile: 'bg-fuchsia-500/15 text-fuchsia-400'
  });

  const reviewPerformance = (): JourneyNextStep => ({
    id: 'review-performance',
    title: 'Review campaign performance',
    description: 'See which campaign is driving your calls.',
    ctaLabel: 'Open performance',
    action: { kind: 'section', section: 'performance' },
    Icon: IconChartHistogram,
    tile: 'bg-sky-500/15 text-sky-400'
  });

  const reviewCost = (): JourneyNextStep => ({
    id: 'review-cost',
    title: 'Check cost by campaign',
    description: 'Understand where your spend is going.',
    ctaLabel: 'Open cost',
    action: { kind: 'section', section: 'cost' },
    Icon: IconCoin,
    tile: 'bg-amber-500/15 text-amber-400'
  });

  const reviewHealth = (): JourneyNextStep => ({
    id: 'review-health',
    title: 'Review operational health',
    description: 'Fix the resources that need attention.',
    ctaLabel: 'Open health',
    action: { kind: 'section', section: 'health' },
    Icon: IconShieldCheck,
    tile: 'bg-emerald-500/15 text-emerald-400'
  });

  switch (stage) {
    case 'solo_caller':
      if (hasOrg && m.teamMembers < 2) push(addAgents());
      if (m.sipDevices === 0) push(connectSip());
      if (m.callsLast30d > 0) push(reviewPerformance());
      break;
    case 'small_team':
      if (!m.poolConfigured && m.numbers >= 2) push(createPool());
      push(reviewPerformance());
      if (health.attentionCount > 0) push(reviewHealth());
      break;
    case 'campaign_operator':
      if (!m.poolConfigured && m.numbers >= 2) push(createPool());
      if (!m.transcriptionEnabled) push(enableTranscription());
      push(reviewPerformance());
      push(reviewCost());
      break;
    case 'ai_driven':
      if (!m.transcriptionEnabled) push(enableTranscription());
      push(reviewInsights());
      push(reviewPerformance());
      break;
    case 'call_center':
      if (health.attentionCount > 0) push(reviewHealth());
      if (!m.poolConfigured && m.numbers >= 2) push(createPool());
      push(reviewCost());
      push(reviewPerformance());
      break;
  }

  // Premium restraint — a strategic guide, not a backlog.
  return steps.slice(0, 4);
}

// ── Public entry point ───────────────────────────────────────────────────────

export function buildJourney(input: {
  nodes: InfraNode[];
  edges: InfraEdge[];
  signals: InfraJourneySignals;
  hasOrg: boolean;
}): JourneyState {
  const { nodes, edges, signals, hasOrg } = input;
  const metrics = deriveMetrics(nodes, signals, hasOrg);

  const notEnoughData =
    metrics.numbers === 0 &&
    metrics.campaigns === 0 &&
    metrics.sipDevices === 0 &&
    metrics.callsLast30d === 0 &&
    (!hasOrg || metrics.teamMembers <= 1);

  const stageId = classify(metrics, hasOrg);
  const stage = JOURNEY_STAGES[stageId];
  const stageIndex = JOURNEY_STAGE_ORDER.indexOf(stageId);

  return {
    stage,
    stageIndex,
    totalStages: JOURNEY_STAGE_ORDER.length,
    notEnoughData,
    hasOrg,
    reasons: buildReasons(metrics, hasOrg),
    missing: buildMissing(nodes, edges, metrics, hasOrg),
    nextSteps: buildNextSteps(nodes, edges, stageId, metrics, hasOrg),
    metrics
  };
}
