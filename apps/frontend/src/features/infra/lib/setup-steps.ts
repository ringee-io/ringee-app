import type {
  InfraEdge,
  InfraNode,
  InfrastructureResourceType
} from '../types';

/**
 * The "next best steps" a workspace needs to actually place calls. Derived from
 * the same nodes+edges the canvas already holds, so the checklist self-completes
 * as the user builds — no extra state, no backend. Personal and organization
 * scopes get different journeys (campaigns are organization-only).
 */

export type SetupActionKey =
  | 'add_member'
  | 'add_number'
  | 'add_campaign'
  | 'add_sip'
  | 'assign_agents'
  | 'connect_number_campaign'
  | 'connect_number_device'
  | 'start_calling';

export interface SetupStep {
  key: SetupActionKey;
  label: string;
  hint: string;
  done: boolean;
}

export interface SetupState {
  steps: SetupStep[];
  doneCount: number;
  total: number;
  complete: boolean;
}

export function setupSteps(
  nodes: InfraNode[],
  edges: InfraEdge[],
  hasOrg: boolean
): SetupState {
  const typeById = new Map(nodes.map((n) => [n.id, n.type]));
  const applied = edges.filter((e) => e.applied);
  const count = (t: InfrastructureResourceType) =>
    nodes.reduce((n, node) => n + (node.type === t ? 1 : 0), 0);
  const linked = (
    a: InfrastructureResourceType,
    b: InfrastructureResourceType
  ) =>
    applied.some((e) => {
      const s = typeById.get(e.source);
      const t = typeById.get(e.target);
      return (s === a && t === b) || (s === b && t === a);
    });

  const numbers = count('PHONE_NUMBER');
  const campaigns = count('CAMPAIGN');
  const members = count('TEAM_MEMBER');
  const sipDevices = count('SIP_DEVICE');
  const runningCampaign = nodes.some(
    (n) =>
      n.type === 'CAMPAIGN' &&
      ['active', 'running'].includes(n.status.toLowerCase())
  );
  const deviceHasNumber =
    nodes.some((n) => n.type === 'SIP_DEVICE' && n.metadata?.assignedNumber) ||
    linked('PHONE_NUMBER', 'SIP_DEVICE');

  const steps: SetupStep[] = hasOrg
    ? [
        {
          key: 'add_member',
          label: 'Add agents',
          hint: 'Invite the people who will place calls.',
          done: members >= 2
        },
        {
          key: 'add_number',
          label: 'Add a phone number',
          hint: 'Buy or link a number to call from.',
          done: numbers >= 1
        },
        {
          key: 'add_campaign',
          label: 'Create a campaign',
          hint: 'Organize your outbound calling.',
          done: campaigns >= 1
        },
        {
          key: 'assign_agents',
          label: 'Assign agents to a campaign',
          hint: 'Put your agents on a campaign.',
          done: linked('TEAM_MEMBER', 'CAMPAIGN')
        },
        {
          key: 'connect_number_campaign',
          label: 'Connect a number to a campaign',
          hint: 'Give the campaign a number to dial from.',
          done: linked('PHONE_NUMBER', 'CAMPAIGN')
        },
        {
          key: 'start_calling',
          label: 'Start calling',
          hint: 'Launch a campaign and start dialing.',
          done: runningCampaign
        }
      ]
    : [
        {
          key: 'add_number',
          label: 'Add a phone number',
          hint: 'Buy or link a number to call from.',
          done: numbers >= 1
        },
        {
          key: 'add_sip',
          label: 'Connect a device',
          hint: 'Add a desk phone or softphone.',
          done: sipDevices >= 1
        },
        {
          key: 'connect_number_device',
          label: 'Connect a number to your device',
          hint: 'Route a number to your device.',
          done: deviceHasNumber
        },
        {
          key: 'start_calling',
          label: 'Start calling',
          hint: 'Open the dialer and make your first call.',
          done: false
        }
      ];

  // Terminal step in personal scope: done once everything before it is done.
  if (!hasOrg && steps.length > 0) {
    const last = steps[steps.length - 1];
    last.done = steps.slice(0, -1).every((s) => s.done);
  }

  const doneCount = steps.filter((s) => s.done).length;
  return {
    steps,
    doneCount,
    total: steps.length,
    complete: doneCount === steps.length
  };
}
