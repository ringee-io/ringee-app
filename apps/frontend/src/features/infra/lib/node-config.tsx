import {
  IconUser,
  IconPhone,
  IconDeviceLandlinePhone,
  IconSpeakerphone,
  IconStack2,
  IconRoute,
  IconPlug,
  type IconProps
} from '@tabler/icons-react';
import type { ComponentType } from 'react';
import type {
  InfraNode,
  InfrastructureResourceType,
  SipCredentials
} from '../types';

export interface ResourceMeta {
  label: string;
  Icon: ComponentType<IconProps>;
  /** Tailwind classes for the node icon badge (bg + text). */
  badge: string;
  /** Solid accent (icon tint / left rail) used to tell node types apart. */
  accent: string;
  /** Ring color applied when a node of this type is selected. */
  ring: string;
}

export const RESOURCE_META: Record<InfrastructureResourceType, ResourceMeta> = {
  TEAM_MEMBER: {
    label: 'Team Member',
    Icon: IconUser,
    badge: 'bg-sky-500/15 text-sky-400',
    accent: 'bg-sky-500',
    ring: 'ring-sky-400/40'
  },
  PHONE_NUMBER: {
    label: 'Phone Number',
    Icon: IconPhone,
    badge: 'bg-emerald-500/15 text-emerald-400',
    accent: 'bg-emerald-500',
    ring: 'ring-emerald-400/40'
  },
  SIP_DEVICE: {
    label: 'SIP Device',
    Icon: IconDeviceLandlinePhone,
    badge: 'bg-violet-500/15 text-violet-400',
    accent: 'bg-violet-500',
    ring: 'ring-violet-400/40'
  },
  CAMPAIGN: {
    label: 'Campaign',
    Icon: IconSpeakerphone,
    badge: 'bg-amber-500/15 text-amber-400',
    accent: 'bg-amber-500',
    ring: 'ring-amber-400/40'
  },
  NUMBER_POOL: {
    label: 'Number Pool',
    Icon: IconStack2,
    badge: 'bg-teal-500/15 text-teal-400',
    accent: 'bg-teal-500',
    ring: 'ring-teal-400/40'
  },
  ROUTING_RULE: {
    label: 'Routing Rule',
    Icon: IconRoute,
    badge: 'bg-orange-500/15 text-orange-400',
    accent: 'bg-orange-500',
    ring: 'ring-orange-400/40'
  },
  INTEGRATION: {
    label: 'Integration',
    Icon: IconPlug,
    badge: 'bg-fuchsia-500/15 text-fuchsia-400',
    accent: 'bg-fuchsia-500',
    ring: 'ring-fuchsia-400/40'
  }
};

/**
 * Resource types the user can natively create, in the order menus list them.
 * Team Member and Campaign are organization-only (no personal team; campaigns
 * require an org), so they drop out in the personal workspace.
 */
export function addResourceOptions(
  hasOrg: boolean
): { type: InfrastructureResourceType; label: string }[] {
  const opts: { type: InfrastructureResourceType; label: string }[] = [];
  if (hasOrg) opts.push({ type: 'TEAM_MEMBER', label: 'Add team member' });
  opts.push({ type: 'PHONE_NUMBER', label: 'Add phone number' });
  opts.push({ type: 'SIP_DEVICE', label: 'Add SIP device' });
  if (hasOrg) opts.push({ type: 'CAMPAIGN', label: 'Add campaign' });
  return opts;
}

/**
 * In the personal workspace the backend seeds a single TEAM_MEMBER node that is
 * the user themselves (role OWNER, name "You"). It must read as a "personal
 * profile", not a teammate.
 */
export function isPersonalProfile(
  node: Pick<InfraNode, 'type'>,
  hasOrg: boolean
): boolean {
  return !hasOrg && node.type === 'TEAM_MEMBER';
}

export type StatusTone = 'ok' | 'warn' | 'bad' | 'idle';

const OK = new Set([
  'active',
  'registered',
  'approved',
  'running',
  'assigned',
  'completed'
]);
const BAD = new Set([
  'failed',
  'offline',
  'disabled',
  'rejected',
  'released',
  'broken',
  'suspended',
  'archived'
]);
const WARN = new Set([
  'pending',
  'configuring',
  'inactive',
  'waiting_documents',
  'under_review',
  'payment_required',
  'payment_pending',
  'provisioning',
  'order_created',
  'credentials_created',
  'unregistered',
  'paused',
  'invited'
]);

export function statusTone(status: string): StatusTone {
  const s = status.toLowerCase();
  if (OK.has(s)) return 'ok';
  if (BAD.has(s)) return 'bad';
  if (WARN.has(s)) return 'warn';
  return 'idle';
}

export const TONE_DOT: Record<StatusTone, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  bad: 'bg-red-500',
  idle: 'bg-muted-foreground/50'
};

/** Where "Manage / verify" deep-links into the existing dashboard flows. */
export const DASHBOARD_LINK: Record<InfrastructureResourceType, string> = {
  TEAM_MEMBER: '/dashboard/settings/overview',
  PHONE_NUMBER: '/dashboard/buy-number',
  SIP_DEVICE: '/dashboard/desk-phones',
  CAMPAIGN: '/dashboard/campaigns',
  NUMBER_POOL: '/dashboard/number-rotation',
  ROUTING_RULE: '/dashboard/desk-phones',
  INTEGRATION: '/dashboard/settings/integrations'
};

/** Where a node's secondary "Open in dashboard" link navigates. */
export function dashboardHref(node: InfraNode): string {
  if (node.type === 'CAMPAIGN' && node.referenceId) {
    return `/dashboard/campaigns/${node.referenceId}`;
  }
  return DASHBOARD_LINK[node.type];
}

// ── Inspector tabs (per resource type) ──────────────────────────────────────

export type InspectorTab =
  | 'overview'
  | 'configuration'
  | 'routing'
  | 'agents'
  | 'numbers'
  | 'leads'
  | 'credentials'
  | 'registration'
  | 'documents'
  | 'billing'
  | 'campaigns'
  | 'devices'
  | 'usage'
  | 'logs'
  | 'settings';

const TABS_BY_TYPE: Record<InfrastructureResourceType, InspectorTab[]> = {
  PHONE_NUMBER: [
    'overview',
    'configuration',
    'routing',
    'usage',
    'billing',
    'documents',
    'logs',
    'settings'
  ],
  SIP_DEVICE: [
    'overview',
    'configuration',
    'credentials',
    'registration',
    'usage',
    'logs',
    'settings'
  ],
  CAMPAIGN: [
    'overview',
    'configuration',
    'leads',
    'agents',
    'numbers',
    'usage',
    'logs',
    'settings'
  ],
  TEAM_MEMBER: [
    'overview',
    'configuration',
    'campaigns',
    'devices',
    'usage',
    'logs',
    'settings'
  ],
  NUMBER_POOL: ['overview', 'usage', 'logs', 'settings'],
  ROUTING_RULE: ['overview', 'usage', 'logs', 'settings'],
  INTEGRATION: ['overview', 'usage', 'logs', 'settings']
};

/** Tabs that only make sense with a team (organization workspace). */
const TEAM_ONLY_TABS = new Set<InspectorTab>(['agents', 'campaigns']);

export function getInspectorTabs(
  type: InfrastructureResourceType,
  opts: { hasOrg?: boolean } = {}
): InspectorTab[] {
  const tabs = TABS_BY_TYPE[type];
  if (opts.hasOrg === false) {
    return tabs.filter((t) => !TEAM_ONLY_TABS.has(t));
  }
  return tabs;
}

/** Result handed back by a create flow so the canvas can react (select/fit/creds). */
export interface CreatedResourceOptions {
  /** Several nodes were created — the canvas should fit-view rather than select. */
  multiple?: boolean;
  /** One-time SIP credentials to stash for the Credentials tab. */
  credentials?: SipCredentials;
  /** Inspector tab to open when the node is selected. */
  tab?: InspectorTab;
}

export type OnResourceCreated = (
  resourceId: string,
  opts?: CreatedResourceOptions
) => void;

export const TAB_LABEL: Record<InspectorTab, string> = {
  overview: 'Overview',
  configuration: 'Config',
  routing: 'Routing',
  agents: 'Agents',
  numbers: 'Numbers',
  leads: 'Leads',
  credentials: 'Creds',
  registration: 'Reg',
  documents: 'Docs',
  billing: 'Billing',
  campaigns: 'Campaigns',
  devices: 'Devices',
  usage: 'Usage',
  logs: 'Logs',
  settings: 'Settings'
};

// ── Node context-menu actions (per resource type) ───────────────────────────

export type NodeActionKey =
  | 'configure'
  | 'routing'
  | 'agents'
  | 'numbers'
  | 'credentials'
  | 'registration'
  | 'usage'
  | 'logs'
  | 'rename'
  | 'remove'
  | 'delete'
  | 'release'
  | 'start'
  | 'pause'
  | 'regenerate';

export interface NodeAction {
  key: NodeActionKey;
  label: string;
  /** Inspector tab to open (for "navigate" actions). */
  tab?: InspectorTab;
  danger?: boolean;
}

/** Right-click menu for a node, by resource type. */
export function getNodeActions(
  type: InfrastructureResourceType,
  opts: { hasOrg?: boolean } = {}
): NodeAction[] {
  const hasOrg = opts.hasOrg !== false;
  const tail: NodeAction[] = [
    { key: 'usage', label: 'View usage', tab: 'usage' },
    { key: 'logs', label: 'View logs', tab: 'logs' },
    { key: 'rename', label: 'Rename label', tab: 'configuration' },
    { key: 'remove', label: 'Remove from canvas', danger: true }
  ];

  switch (type) {
    case 'TEAM_MEMBER':
      return [
        { key: 'configure', label: 'Configure', tab: 'configuration' },
        // "Assign to campaign" only applies with a team (campaigns are org-only).
        ...(hasOrg
          ? [
              {
                key: 'agents' as NodeActionKey,
                label: 'Assign to campaign',
                tab: 'campaigns' as InspectorTab
              }
            ]
          : []),
        {
          key: 'credentials',
          label: hasOrg ? 'Assign SIP device' : 'Link SIP device',
          tab: 'devices'
        },
        ...tail
      ];
    case 'PHONE_NUMBER':
      return [
        { key: 'configure', label: 'Configure', tab: 'configuration' },
        { key: 'routing', label: 'Routing', tab: 'routing' },
        ...tail.slice(0, 3),
        { key: 'release', label: 'Release number', danger: true },
        tail[3]
      ];
    case 'CAMPAIGN':
      return [
        { key: 'configure', label: 'Configure', tab: 'configuration' },
        { key: 'numbers', label: 'Assign number', tab: 'numbers' },
        { key: 'agents', label: 'Assign agents', tab: 'agents' },
        { key: 'start', label: 'Start campaign' },
        { key: 'pause', label: 'Pause campaign' },
        ...tail.slice(1, 3),
        { key: 'delete', label: 'Delete campaign', danger: true },
        tail[3]
      ];
    case 'SIP_DEVICE':
      return [
        { key: 'configure', label: 'Configure', tab: 'configuration' },
        { key: 'credentials', label: 'Show credentials', tab: 'credentials' },
        { key: 'regenerate', label: 'Regenerate password', danger: true },
        { key: 'registration', label: 'Registration', tab: 'registration' },
        ...tail.slice(1, 3),
        { key: 'delete', label: 'Delete device', danger: true },
        tail[3]
      ];
    default:
      return [
        { key: 'configure', label: 'Configure', tab: 'configuration' },
        ...tail
      ];
  }
}

/** Short metadata line shown under the node title. */
export function buildSummary(node: InfraNode): string {
  const m = node.metadata ?? {};
  const parts: string[] = [];
  switch (node.type) {
    case 'TEAM_MEMBER':
      if (m.role) parts.push(String(m.role));
      parts.push(`${Number(m.assignedCampaigns ?? 0)} campaigns`);
      parts.push(`${Number(m.assignedSipDevices ?? 0)} devices`);
      break;
    case 'PHONE_NUMBER':
      if (m.country) parts.push(String(m.country));
      if (m.assignedCampaign) parts.push(String(m.assignedCampaign));
      break;
    case 'SIP_DEVICE':
      if (m.assignedNumber) parts.push(String(m.assignedNumber));
      else parts.push('No number');
      break;
    case 'CAMPAIGN':
      parts.push(`${Number(m.leads ?? 0)} leads`);
      if (m.dialerMode) parts.push(String(m.dialerMode));
      break;
    case 'NUMBER_POOL':
      parts.push(`${Number(m.members ?? 0)} numbers`);
      if (m.strategy) parts.push(String(m.strategy));
      break;
    case 'INTEGRATION':
      if (m.provider) parts.push(String(m.provider));
      break;
    default:
      break;
  }
  return parts.join(' · ');
}
