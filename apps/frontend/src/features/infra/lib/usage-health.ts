import {
  buildAdjacency,
  nodeReadiness,
  type ReadinessState
} from './readiness';
import type { StatusTone } from './node-config';
import type {
  InfraEdge,
  InfraNode,
  InfrastructureResourceType
} from '../types';

/**
 * Operational health for the Usage view. Reuses the exact same readiness logic
 * the canvas uses (lib/readiness), then groups every node that needs attention
 * into human buckets ("Numbers without routing", "Payment required", …). No new
 * data — it runs over the overview nodes+edges the Usage page already fetches,
 * so health always agrees with the canvas.
 */

export interface HealthItem {
  nodeId: string;
  name: string;
  type: InfrastructureResourceType;
  label: string;
  hint?: string;
  tone: StatusTone;
}

export interface HealthGroup {
  key: string;
  title: string;
  /** The contextual action verb for every item in this bucket ("Assign number"). */
  cta: string;
  items: HealthItem[];
}

export interface HealthSummary {
  groups: HealthGroup[];
  attentionCount: number;
  /** Blocking problems (tone `bad`) — a resource that simply can't call yet. */
  criticalCount: number;
  /** Non-blocking problems (tone `warn`/`idle`) — configured, but not optimal. */
  warnCount: number;
  okCount: number;
  total: number;
}

/** Which bucket a readiness state falls into (order defines display order). */
const BUCKET: {
  key: string;
  title: string;
  cta: string;
  states: ReadinessState[];
}[] = [
  {
    key: 'needs_payment',
    title: 'Payment required',
    cta: 'Complete payment',
    states: ['needs_payment']
  },
  {
    key: 'needs_documents',
    title: 'Numbers needing documents',
    cta: 'Submit documents',
    states: ['needs_documents']
  },
  {
    key: 'needs_routing',
    title: 'Numbers without routing',
    cta: 'Configure routing',
    states: ['needs_routing']
  },
  {
    key: 'needs_number',
    title: 'Campaigns without a number',
    cta: 'Assign number',
    states: ['needs_number']
  },
  {
    key: 'needs_agents',
    title: 'Campaigns without agents',
    cta: 'Assign agents',
    states: ['needs_agents']
  },
  {
    key: 'offline',
    title: 'Devices needing attention',
    cta: 'Register device',
    states: ['not_registered', 'failed', 'disabled']
  },
  {
    key: 'needs_setup',
    title: 'Resources needing setup',
    cta: 'Complete setup',
    states: ['needs_setup', 'no_campaign', 'inactive']
  }
];

const STATE_TO_KEY = new Map<ReadinessState, string>();
for (const b of BUCKET) for (const s of b.states) STATE_TO_KEY.set(s, b.key);

export function buildHealth(
  nodes: InfraNode[],
  edges: InfraEdge[],
  hasOrg: boolean
): HealthSummary {
  const adj = buildAdjacency(nodes, edges);
  const byKey = new Map<string, HealthItem[]>();
  let attention = 0;
  let critical = 0;

  for (const node of nodes) {
    const r = nodeReadiness(node, adj.get(node.id), hasOrg);
    if (!r.incomplete) continue;
    attention++;
    if (r.tone === 'bad') critical++;
    const key = STATE_TO_KEY.get(r.state) ?? 'needs_setup';
    const list = byKey.get(key) ?? [];
    list.push({
      nodeId: node.id,
      name: node.name,
      type: node.type,
      label: r.label,
      hint: r.hint,
      tone: r.tone
    });
    byKey.set(key, list);
  }

  const groups: HealthGroup[] = BUCKET.filter((b) => byKey.has(b.key)).map(
    (b) => ({
      key: b.key,
      title: b.title,
      cta: b.cta,
      items: byKey.get(b.key)!
    })
  );

  return {
    groups,
    attentionCount: attention,
    criticalCount: critical,
    warnCount: Math.max(attention - critical, 0),
    okCount: Math.max(nodes.length - attention, 0),
    total: nodes.length
  };
}
