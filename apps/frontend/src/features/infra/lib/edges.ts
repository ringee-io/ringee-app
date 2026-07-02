import type { InfraEdge, InfraNode } from '../types';

/**
 * Visual "tone" of a relationship edge — mirrors the node status tones but for
 * connections. Drives stroke colour, dash and arrowhead of the custom edge.
 */
export type EdgeTone = 'active' | 'draft' | 'broken';

export function edgeTone(edge: InfraEdge): EdgeTone {
  if (edge.status === 'BROKEN') return 'broken';
  if (edge.status === 'ACTIVE') return 'active';
  return 'draft';
}

/** CSS colour token per edge tone (resolved against the theme). */
export const EDGE_STROKE: Record<EdgeTone, string> = {
  active: 'var(--primary)',
  draft: 'var(--muted-foreground)',
  broken: 'var(--destructive)'
};

/**
 * Human, hover-only sentence describing a relationship edge. Shared by the
 * custom edge label and any canvas affordances so the wording stays in one
 * place.
 */
export function edgeSentence(
  edge: InfraEdge,
  nodesById: Map<string, InfraNode>
): string {
  const source = nodesById.get(edge.source)?.name ?? 'This resource';
  const target = nodesById.get(edge.target)?.name ?? 'another resource';
  if (edge.status === 'BROKEN') {
    return 'This connection is broken — one side was removed.';
  }
  const sentence = ((): string => {
    switch (edge.type) {
      case 'ASSIGNED_TO':
        return `${source} is assigned to ${target}`;
      case 'USES':
        return `${source} is used by ${target}`;
      case 'ROUTES_TO':
        return `Calls to ${source} route to ${target}`;
      case 'BELONGS_TO':
        return `${source} is in ${target}`;
      case 'OWNS':
        return `${source} owns ${target}`;
      case 'MEMBER_OF':
        return `${source} is a member of ${target}`;
      case 'TRIGGERS':
        return `${source} triggers ${target}`;
      default:
        return `${source} is connected to ${target}`;
    }
  })();
  return edge.applied ? sentence : `${sentence} · draft`;
}

/** Short verb chip for the edge label ("assigned", "routes", "uses", …). */
export function edgeVerb(edge: InfraEdge): string {
  if (edge.status === 'BROKEN') return 'broken';
  switch (edge.type) {
    case 'ASSIGNED_TO':
      return 'assigned to';
    case 'USES':
      return 'used by';
    case 'ROUTES_TO':
      return 'routes to';
    case 'BELONGS_TO':
      return 'in';
    case 'OWNS':
      return 'owns';
    case 'MEMBER_OF':
      return 'member of';
    case 'TRIGGERS':
      return 'triggers';
    default:
      return 'linked to';
  }
}

/**
 * Bucket every edge by the node it touches, split into outgoing (this node is
 * the source → exits on the right) and incoming (this node is the target →
 * enters on the left). Each list is ordered so handles distribute stably along
 * the border. Used to give every relationship its own connection point.
 */
export interface NodeHandles {
  /** Edge ids where this node is the source (right-side source handles). */
  source: string[];
  /** Edge ids where this node is the target (left-side target handles). */
  target: string[];
}

export function buildNodeHandles(edges: InfraEdge[]): Map<string, NodeHandles> {
  const map = new Map<string, NodeHandles>();
  const get = (id: string): NodeHandles => {
    let h = map.get(id);
    if (!h) {
      h = { source: [], target: [] };
      map.set(id, h);
    }
    return h;
  };
  for (const e of edges) {
    get(e.source).source.push(e.id);
    get(e.target).target.push(e.id);
  }
  return map;
}
