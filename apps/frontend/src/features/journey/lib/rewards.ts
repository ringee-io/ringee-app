import {
  JOURNEY_STAGES,
  type JourneyStageId,
  type JourneyStageMeta
} from './stages';
import { signalsFrom, type StageSignals } from './signals';
import type { JourneyAction } from './journey';
import type { JourneyOverview, JourneyRewardStatus } from '../types';

/**
 * The reward track: every paying stage on this workspace's ladder, with the
 * exact requirements that unlock it. Amounts and claim/lock states come from
 * the backend (the only place that can move money); this module adds what the
 * page needs to *coach* — for each locked reward, the concrete, checkable
 * things still missing, each with a live number and a deep link. The
 * requirements mirror the stage classification thresholds one for one, so the
 * checklist can never promise a stage the classifier would not grant.
 */

export interface RewardRequirement {
  id: string;
  /** Stated as the thing to achieve, e.g. "20+ calls in the last 30 days". */
  label: string;
  /** The live number behind it, e.g. "12 so far". */
  detail: string;
  done: boolean;
  action?: JourneyAction;
}

export interface RewardTrackItem {
  stage: JourneyStageMeta;
  amount: number;
  status: JourneyRewardStatus;
  claimedAt: string | null;
  requirements: RewardRequirement[];
  completed: number;
  total: number;
}

export interface JourneyRewardTrack {
  items: RewardTrackItem[];
  claimableTotal: number;
  claimedTotal: number;
  totalPossible: number;
  /** The first reward still locked — where the coaching points. */
  nextLocked: RewardTrackItem | null;
  /** Reward amount per stage id, for chips on the stage path. */
  byStage: Partial<Record<JourneyStageId, RewardTrackItem>>;
}

const EMPTY_TRACK: JourneyRewardTrack = {
  items: [],
  claimableTotal: 0,
  claimedTotal: 0,
  totalPossible: 0,
  nextLocked: null,
  byStage: {}
};

export function buildRewardTrack(data: JourneyOverview): JourneyRewardTrack {
  // Tolerate a backend that predates rewards — the page must still render.
  const rewards = data.rewards;
  if (!rewards?.items?.length) return EMPTY_TRACK;

  const signals = signalsFrom(data);
  const windowDays = data.window.days;

  const items = rewards.items
    .filter(
      (r): r is (typeof rewards.items)[number] & { stageId: JourneyStageId } =>
        r.stageId in JOURNEY_STAGES
    )
    .map((r) => {
      const requirements = stageRequirements(r.stageId, signals, windowDays);
      return {
        stage: JOURNEY_STAGES[r.stageId],
        amount: r.amount,
        status: r.status,
        claimedAt: r.claimedAt,
        requirements,
        completed: requirements.filter((q) => q.done).length,
        total: requirements.length
      };
    });

  const byStage: JourneyRewardTrack['byStage'] = {};
  for (const item of items) byStage[item.stage.id] = item;

  return {
    items,
    claimableTotal: rewards.claimableTotal,
    claimedTotal: rewards.claimedTotal,
    totalPossible: rewards.totalPossible,
    nextLocked: items.find((r) => r.status === 'locked') ?? null,
    byStage
  };
}

export const formatUsd = (amount: number) =>
  Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;

// ── Requirements per stage ───────────────────────────────────────────────────

const progress = (value: number, target: number, unit: string) =>
  `${Math.min(value, target)} of ${target} ${unit}`;

/**
 * The unlock checklist for one stage — a one-for-one mirror of the classifier
 * thresholds in `journey.ts` (`classifyOrganization` / `classifyPersonal`).
 * If a threshold changes there, change it here too.
 */
function stageRequirements(
  stageId: JourneyStageId,
  s: StageSignals,
  windowDays: number
): RewardRequirement[] {
  const calls = (target: number): RewardRequirement => ({
    id: 'calls',
    label: `${target}+ calls in the last ${windowDays} days`,
    detail: `${s.calls} so far`,
    done: s.calls >= target,
    action: { label: 'Open the dialer', href: '/dashboard/call' }
  });

  const aiSurface: RewardRequirement = {
    id: 'ai_surface',
    label: 'Recording, transcription or AI analysis is on',
    detail: s.aiSurface ? 'On' : 'Off',
    done: s.aiSurface,
    action: {
      label: 'Open settings',
      href: '/dashboard/settings/overview',
      adminOnly: true
    }
  };

  switch (stageId) {
    // ── Organization ladder ────────────────────────────────────────────────
    case 'campaign_operator':
      return [
        {
          id: 'campaign_active',
          label: 'A campaign is running',
          detail:
            s.activeCampaigns > 0
              ? `${s.activeCampaigns} active`
              : 'None active',
          done: s.activeCampaigns >= 1,
          action: {
            label: 'Open campaigns',
            href: '/dashboard/campaigns',
            adminOnly: true
          }
        },
        {
          id: 'number',
          label: 'A number you can call from',
          detail: s.numbers > 0 ? `${s.numbers} connected` : 'None connected',
          done: s.numbers >= 1,
          action: {
            label: 'Get a number',
            href: '/dashboard/buy-number',
            adminOnly: true
          }
        },
        {
          id: 'scale',
          label: `20+ calls in ${windowDays} days — or a second campaign, or rotation`,
          detail: `${s.calls} calls · ${s.activeCampaigns} active campaigns`,
          done: s.calls >= 20 || s.activeCampaigns >= 2 || s.rotation,
          action: { label: 'Open the dialer', href: '/dashboard/call' }
        }
      ];

    case 'ai_sales_team':
      return [aiSurface, calls(20)];

    case 'call_center':
      return [
        {
          id: 'team',
          label: '3+ people in the workspace',
          detail: progress(s.teamMembers, 3, 'members'),
          done: s.teamMembers >= 3
        },
        {
          id: 'campaigns',
          label: '2+ campaigns running at once',
          detail: progress(s.activeCampaigns, 2, 'active'),
          done: s.activeCampaigns >= 2,
          action: {
            label: 'Open campaigns',
            href: '/dashboard/campaigns',
            adminOnly: true
          }
        },
        {
          id: 'numbers',
          label: '3+ numbers, or caller-ID rotation on',
          detail: s.rotation ? 'Rotation on' : `${s.numbers} numbers`,
          done: s.numbers >= 3 || s.rotation,
          action: {
            label: 'Set up rotation',
            href: '/dashboard/number-rotation',
            adminOnly: true
          }
        },
        {
          id: 'device',
          label: 'A desk phone or softphone registered',
          detail: s.sipDevices > 0 ? `${s.sipDevices} registered` : 'None',
          done: s.sipDevices >= 1,
          action: {
            label: 'Add a device',
            href: '/dashboard/desk-phones',
            adminOnly: true
          }
        },
        calls(100)
      ];

    // ── Freelancer ladder ──────────────────────────────────────────────────
    case 'consistent_caller':
      return [
        {
          id: 'rhythm',
          label: `20+ calls in ${windowDays} days — or 10+ across 5 calling days`,
          detail: `${s.calls} calls · ${s.activeDays} active days`,
          done: s.calls >= 20 || (s.calls >= 10 && s.activeDays >= 5),
          action: { label: 'Open the dialer', href: '/dashboard/call' }
        }
      ];

    case 'connected_operator':
      return [
        {
          id: 'stack',
          label: 'A CRM, calendar or lead source connected',
          detail:
            s.crmConnected || s.calendarConnected || s.enrichmentConnected
              ? 'Connected'
              : 'Nothing connected',
          done: s.crmConnected || s.calendarConnected || s.enrichmentConnected,
          action: {
            label: 'Open integrations',
            href: '/dashboard/settings/integrations',
            adminOnly: true
          }
        },
        calls(10)
      ];

    case 'ai_closer':
      return [aiSurface, calls(20)];

    case 'agentic_operator':
      return [
        {
          id: 'agent',
          label: 'An AI agent connected through MCP',
          detail: s.agentConnected ? 'Connected' : 'Not connected',
          done: s.agentConnected,
          action: {
            label: 'Connect an agent',
            href: '/dashboard/settings/integrations',
            adminOnly: true
          }
        },
        {
          id: 'agent_driving',
          label: 'The agent did real work this month',
          detail: s.agentDriving ? 'Active' : 'No agent activity',
          done: s.agentDriving
        },
        aiSurface,
        {
          id: 'stack',
          label: 'A CRM or calendar connected',
          detail:
            s.crmConnected || s.calendarConnected
              ? 'Connected'
              : 'Not connected',
          done: s.crmConnected || s.calendarConnected,
          action: {
            label: 'Open integrations',
            href: '/dashboard/settings/integrations',
            adminOnly: true
          }
        },
        calls(20)
      ];

    default:
      return [];
  }
}
