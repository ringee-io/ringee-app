import type {
  InfraEdge,
  InfraNode,
  InfrastructureResourceType
} from '../types';
import {
  prettyStatus,
  statusTone,
  type InspectorTab,
  type StatusTone
} from './node-config';

/**
 * Per-node "readiness" — the human answer to *is this ready to make calls, and
 * if not, what's missing?* Derived entirely on the client from the same
 * `nodes` + `edges` the overview already returns (no extra request, no schema).
 * It reframes raw provider `status` into the call-center-builder language the
 * module speaks: "Needs number", "Needs routing", "Not registered", …
 */

export type ReadinessState =
  | 'active'
  | 'running'
  | 'ready'
  | 'registered'
  | 'needs_routing'
  | 'needs_number'
  | 'needs_agents'
  | 'needs_documents'
  | 'needs_payment'
  | 'needs_setup'
  | 'not_registered'
  | 'no_campaign'
  | 'disabled'
  | 'failed'
  | 'inactive';

export interface Readiness {
  state: ReadinessState;
  /** Short chip label shown on the node + inspector. */
  label: string;
  tone: StatusTone;
  /** One-line human explanation (inspector banner). */
  hint?: string;
  /** Inspector tab that resolves the missing piece. */
  fixTab?: InspectorTab;
  /** True when the node needs user action before it can place calls. */
  incomplete: boolean;
}

/**
 * Adjacency over *real* (applied) relationships only — draft/broken edges never
 * count as a working connection. Keyed by node id; holds the connected resource
 * types, per-type counts, and the neighbour nodes (for inspector sentences).
 */
export interface NodeAdjacency {
  types: Set<InfrastructureResourceType>;
  count: Partial<Record<InfrastructureResourceType, number>>;
  neighborsByType: Partial<Record<InfrastructureResourceType, InfraNode[]>>;
}

function emptyAdjacency(): NodeAdjacency {
  return { types: new Set(), count: {}, neighborsByType: {} };
}

function link(a: NodeAdjacency, neighbor: InfraNode): void {
  const list = (a.neighborsByType[neighbor.type] ??= []);
  if (list.some((n) => n.id === neighbor.id)) return; // dedupe pairs
  list.push(neighbor);
  a.types.add(neighbor.type);
  a.count[neighbor.type] = (a.count[neighbor.type] ?? 0) + 1;
}

export function buildAdjacency(
  nodes: InfraNode[],
  edges: InfraEdge[]
): Map<string, NodeAdjacency> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map<string, NodeAdjacency>();
  for (const n of nodes) adj.set(n.id, emptyAdjacency());
  for (const e of edges) {
    if (!e.applied) continue; // only real relationships shape readiness
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) continue;
    link(adj.get(s.id)!, t);
    link(adj.get(t.id)!, s);
  }
  return adj;
}

function mk(
  state: ReadinessState,
  label: string,
  tone: StatusTone,
  fixTab?: InspectorTab,
  hint?: string
): Readiness {
  return {
    state,
    label,
    tone,
    fixTab,
    hint,
    incomplete: tone === 'warn' || tone === 'bad'
  };
}

export function nodeReadiness(
  node: InfraNode,
  adj: NodeAdjacency | undefined,
  hasOrg: boolean
): Readiness {
  const s = node.status.toLowerCase();
  const m = node.metadata ?? {};
  const has = (t: InfrastructureResourceType) => adj?.types.has(t) ?? false;
  const isBad = statusTone(node.status) === 'bad';

  switch (node.type) {
    case 'PHONE_NUMBER': {
      if (
        s.includes('document') ||
        s === 'pending' ||
        s === 'under_review' ||
        s === 'order_created'
      )
        return mk(
          'needs_documents',
          'Needs documents',
          'warn',
          'documents',
          'Regulatory documents are required before this number can be used.'
        );
      if (s.includes('payment'))
        return mk(
          'needs_payment',
          'Payment required',
          'warn',
          'billing',
          'Finish payment to activate this number.'
        );
      if (isBad) return mk('failed', prettyStatus(node.status), 'bad');
      const routed = has('CAMPAIGN') || has('SIP_DEVICE') || has('TEAM_MEMBER');
      if (!routed)
        return mk(
          'needs_routing',
          'Needs routing',
          'warn',
          'routing',
          'Not routed to a campaign or device yet.'
        );
      return mk('active', 'Active', 'ok');
    }

    case 'CAMPAIGN': {
      if (s === 'active' || s === 'running')
        return mk('running', 'Running', 'ok');
      if (isBad) return mk('failed', prettyStatus(node.status), 'bad');
      if (!has('PHONE_NUMBER'))
        return mk(
          'needs_number',
          'Needs number',
          'warn',
          'numbers',
          'Assign a number so this campaign can place calls.'
        );
      if (hasOrg && !has('TEAM_MEMBER'))
        return mk(
          'needs_agents',
          'Needs agents',
          'warn',
          'agents',
          'Assign at least one agent to start calling.'
        );
      return mk('ready', 'Ready', 'ok', undefined, 'Ready to start calling.');
    }

    case 'SIP_DEVICE': {
      if (s === 'disabled') return mk('disabled', 'Disabled', 'idle');
      if (s === 'registered' || m.lastRegisteredAt)
        return mk('registered', 'Registered', 'ok');
      if (isBad) return mk('failed', prettyStatus(node.status), 'bad');
      return mk(
        'not_registered',
        'Not registered',
        'warn',
        'registration',
        'Waiting for the phone to register with these credentials.'
      );
    }

    case 'TEAM_MEMBER': {
      const isOwner = m.role === 'OWNER' || !hasOrg;
      if (isOwner) return mk('active', 'Active', 'ok');
      if (Number(m.assignedCampaigns ?? 0) === 0)
        return mk(
          'no_campaign',
          'No campaign',
          'warn',
          'campaigns',
          'Not assigned to any campaign yet.'
        );
      return mk('active', 'Active', 'ok');
    }

    default: {
      const tone = statusTone(node.status);
      return {
        state: tone === 'ok' ? 'active' : 'inactive',
        label: prettyStatus(node.status),
        tone,
        incomplete: false
      };
    }
  }
}
