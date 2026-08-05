import type { JourneyNode, JourneyTrack } from '../types';

/**
 * Radial graph geometry, derived — never hand-authored.
 *
 * The workspace sits at the centre. Every track leaves it as its own thread,
 * and a node's distance from the centre is how deep into that thread it is.
 * That is the whole mental model: *this is you, and this is what grows out of
 * you*. The previous column grid said the same thing in a shape nobody reads
 * as personal, and it forced a 1416px canvas on a phone.
 *
 * Three rules keep the picture honest:
 *
 * 1. **Ring = dependency depth within the track**, not position in a list. Two
 *    nodes that can be started at the same time sit on the same ring, so the
 *    thread forks instead of pretending to be a chain. Integrations really is
 *    four independent choices; drawing it as a queue would be a lie.
 * 2. **Sector width follows fan-out.** A track that forks four ways is given
 *    four times the angle of a track that never forks, so the spread never has
 *    to overlap its neighbours to fit.
 * 3. **Radius is pushed out when an arc is crowded.** If a ring's nodes cannot
 *    fit along its arc, that ring moves outward until they do, rather than
 *    overlapping. Geometry gives way to legibility, never the other way round.
 *
 * Pure function: same input, same picture, on the server and on the client.
 */

/** Node box, hub and spacing, in the units the SVG overlay uses. */
export interface GraphMetrics {
  nodeWidth: number;
  nodeHeight: number;
  /** Radius of the centre hub. */
  hubRadius: number;
  /** Distance from the hub edge to the first ring. */
  firstRing: number;
  /** Distance between consecutive rings. */
  ringStride: number;
  /** Minimum clear space between two nodes sharing a ring. */
  nodeGap: number;
  /** Node chrome scales with the box, so the node reads this, not a media query. */
  compact: boolean;
}

/** The default: a desktop canvas with room to spare. */
export const COMFORTABLE_METRICS: GraphMetrics = {
  nodeWidth: 132,
  nodeHeight: 116,
  hubRadius: 68,
  firstRing: 96,
  ringStride: 152,
  nodeGap: 24,
  compact: false
};

/**
 * Narrow viewports. The same map, tightened: on a phone this still pans, but
 * the hub is what you land on and each thread is a short swipe from it, which
 * is a far better story than a 1416px wall of columns.
 */
export const COMPACT_METRICS: GraphMetrics = {
  nodeWidth: 108,
  nodeHeight: 104,
  hubRadius: 56,
  firstRing: 76,
  ringStride: 124,
  nodeGap: 16,
  compact: true
};

export interface PositionedNode {
  node: JourneyNode;
  /** 0-based ring within its own track: how deep down the thread it sits. */
  ring: number;
  /** Radians, screen space (0 = right, growing clockwise). */
  angle: number;
  radius: number;
  /** Top-left of the node box. */
  x: number;
  y: number;
  centerX: number;
  centerY: number;
}

export interface GraphEdge {
  id: string;
  from: { x: number; y: number };
  to: PositionedNode;
  track: string;
  /** Both endpoints achieved — the thread reads as travelled. */
  complete: boolean;
  /** The target is locked and this edge is part of what holds it back. */
  blocked: boolean;
  /**
   * A thread leaving the hub, rather than one node depending on another. Drawn
   * heavier: this is the structure the eye should follow first.
   */
  spoke: boolean;
  /** Crosses from one track to another: a real dependency, drawn as a hint. */
  crossTrack: boolean;
  path: string;
}

export interface GraphSpoke {
  trackId: string;
  /** Mid-angle of the track's sector, in radians. */
  angle: number;
  /** Angular width of the sector, in radians. */
  sector: number;
  /** Distance from the hub to the outermost node of this thread. */
  outerRadius: number;
}

export interface GraphLayout {
  nodes: PositionedNode[];
  byId: Map<string, PositionedNode>;
  edges: GraphEdge[];
  spokes: GraphSpoke[];
  /** Hub centre, in canvas coordinates. */
  hubX: number;
  hubY: number;
  width: number;
  height: number;
  metrics: GraphMetrics;
}

/** Twelve o'clock. Sectors are handed out clockwise from here. */
const START_ANGLE = -Math.PI / 2;

/** Share of its sector a ring may actually spread across. */
const SPREAD_RATIO = 0.86;

/** Breathing room around the outermost content. */
const CANVAS_PADDING = 24;

/**
 * Builds the radial layout for one workspace's visible graph.
 *
 * `tracks` is expected to already be filtered to what this workspace can see —
 * a personal workspace has no Team or Campaigns thread at all, rather than two
 * greyed-out ones — and the remaining sectors simply share the full circle.
 */
export function buildGraphLayout(
  nodes: JourneyNode[],
  tracks: JourneyTrack[],
  metrics: GraphMetrics = COMFORTABLE_METRICS
): GraphLayout {
  const visibleTracks = [...tracks].sort((a, b) => a.order - b.order);
  const visibleTrackIds = new Set(visibleTracks.map((track) => track.id));
  const placeable = nodes.filter((node) => visibleTrackIds.has(node.track));

  /** Each track's nodes, grouped into rings by dependency depth. */
  const ringsByTrack = new Map<string, JourneyNode[][]>();
  for (const track of visibleTracks) {
    const own = placeable.filter((node) => node.track === track.id);
    const depths = [...new Set(own.map((node) => node.depth))].sort(
      (a, b) => a - b
    );
    ringsByTrack.set(
      track.id,
      depths.map((depth) =>
        own
          .filter((node) => node.depth === depth)
          // Stable within a ring, so the picture does not reshuffle between
          // renders when two nodes are equally deep.
          .sort((a, b) => a.id.localeCompare(b.id))
      )
    );
  }

  // A thread that forks four ways needs four times the angle of one that never
  // forks. Equal sectors would either crowd the wide track or waste the circle.
  const weightOf = (trackId: string) =>
    Math.max(1, ...(ringsByTrack.get(trackId) ?? [[]]).map((r) => r.length));
  const totalWeight = visibleTracks.reduce(
    (sum, track) => sum + weightOf(track.id),
    0
  );

  /** Each track's wedge: [mid angle, angular width]. */
  const sectorOf = new Map<string, { mid: number; sector: number }>();
  let cursor = START_ANGLE;
  for (const track of visibleTracks) {
    const sector = totalWeight
      ? (Math.PI * 2 * weightOf(track.id)) / totalWeight
      : 0;
    sectorOf.set(track.id, { mid: cursor + sector / 2, sector });
    cursor += sector;
  }

  /**
   * One radius per ring level, shared by every thread.
   *
   * Per-track radii were tried first and were wrong twice over: a crowded ring
   * pushed outward could land exactly on the next ring of its own track, and
   * two adjacent tracks could put nodes at the same radius inside sectors too
   * narrow to hold them. Solving it once per level fixes both, and concentric
   * rings are also simply easier to read than a scatter.
   *
   * A node needs a chord of `nodeWidth + nodeGap` inside the slice of its
   * sector it gets (`sector / count`). Chord = 2·R·sin(slice / 2), so the
   * radius that makes it fit is the arcsine relation below — not arc length,
   * which underestimates badly at the small radii near the hub, exactly where
   * the crowding happens.
   */
  const levels = Math.max(
    0,
    ...visibleTracks.map((track) => (ringsByTrack.get(track.id) ?? []).length)
  );
  const radii: number[] = [];
  for (let level = 0; level < levels; level++) {
    let radius =
      metrics.hubRadius + metrics.firstRing + level * metrics.ringStride;

    for (const track of visibleTracks) {
      const count = (ringsByTrack.get(track.id) ?? [])[level]?.length ?? 0;
      if (!count) continue;
      const { sector } = sectorOf.get(track.id)!;
      const slice = (sector / count) * SPREAD_RATIO;
      const chord = metrics.nodeWidth + metrics.nodeGap;
      const fits = chord / (2 * Math.sin(Math.max(slice, 0.001) / 2));
      radius = Math.max(radius, fits);
    }

    // Rings never converge: consecutive ones always clear a node box.
    const previous = radii[level - 1];
    if (previous !== undefined) {
      radius = Math.max(
        radius,
        previous + metrics.nodeHeight + metrics.nodeGap
      );
    }
    radii.push(radius);
  }

  const positioned: PositionedNode[] = [];
  const spokes: GraphSpoke[] = [];

  for (const track of visibleTracks) {
    const { mid, sector } = sectorOf.get(track.id)!;
    const rings = ringsByTrack.get(track.id) ?? [];
    let outerRadius = metrics.hubRadius;

    rings.forEach((ring, index) => {
      const radius = radii[index] ?? metrics.hubRadius + metrics.firstRing;
      const step = (sector / ring.length) * SPREAD_RATIO;

      ring.forEach((node, position) => {
        const angle = mid + (position - (ring.length - 1) / 2) * step;
        const centerX = Math.cos(angle) * radius;
        const centerY = Math.sin(angle) * radius;
        positioned.push({
          node,
          ring: index,
          angle,
          radius,
          x: centerX - metrics.nodeWidth / 2,
          y: centerY - metrics.nodeHeight / 2,
          centerX,
          centerY
        });
      });

      outerRadius = Math.max(outerRadius, radius);
    });

    spokes.push({ trackId: track.id, angle: mid, sector, outerRadius });
  }

  // Everything so far is measured from the hub at (0, 0). Shift once, at the
  // end, so the canvas is exactly as big as its contents.
  const minX = Math.min(-metrics.hubRadius, ...positioned.map((p) => p.x));
  const maxX = Math.max(
    metrics.hubRadius,
    ...positioned.map((p) => p.x + metrics.nodeWidth)
  );
  const minY = Math.min(-metrics.hubRadius, ...positioned.map((p) => p.y));
  const maxY = Math.max(
    metrics.hubRadius,
    ...positioned.map((p) => p.y + metrics.nodeHeight)
  );

  const offsetX = CANVAS_PADDING - minX;
  const offsetY = CANVAS_PADDING - minY;

  for (const p of positioned) {
    p.x += offsetX;
    p.y += offsetY;
    p.centerX += offsetX;
    p.centerY += offsetY;
  }

  const hubX = offsetX;
  const hubY = offsetY;
  const byId = new Map(positioned.map((p) => [p.node.id, p]));

  const edges: GraphEdge[] = [];

  // The threads themselves: hub → the first node of every track.
  for (const p of positioned) {
    if (p.ring !== 0) continue;
    edges.push({
      id: `hub->${p.node.id}`,
      from: {
        x: hubX + Math.cos(p.angle) * metrics.hubRadius,
        y: hubY + Math.sin(p.angle) * metrics.hubRadius
      },
      to: p,
      track: p.node.track,
      complete: p.node.status === 'achieved',
      blocked: p.node.status === 'locked',
      spoke: true,
      crossTrack: false,
      path: straightPath(
        hubX + Math.cos(p.angle) * metrics.hubRadius,
        hubY + Math.sin(p.angle) * metrics.hubRadius,
        p.centerX,
        p.centerY,
        metrics,
        p.angle
      )
    });
  }

  // The dependencies. Within a track these run along the thread; across tracks
  // they arc back through the middle, which is where the relationship actually
  // lives.
  for (const target of positioned) {
    for (const dependencyId of target.node.dependsOn) {
      const source = byId.get(dependencyId);
      if (!source) continue;
      const crossTrack = source.node.track !== target.node.track;

      edges.push({
        id: `${dependencyId}->${target.node.id}`,
        from: { x: source.centerX, y: source.centerY },
        to: target,
        track: target.node.track,
        complete:
          source.node.status === 'achieved' &&
          target.node.status === 'achieved',
        blocked: target.node.blockedBy.includes(dependencyId),
        spoke: false,
        crossTrack,
        path: crossTrack
          ? arcThroughHub(source, target, hubX, hubY)
          : straightPath(
              source.centerX,
              source.centerY,
              target.centerX,
              target.centerY,
              metrics,
              target.angle
            )
      });
    }
  }

  return {
    nodes: positioned,
    byId,
    edges,
    spokes,
    hubX,
    hubY,
    width: maxX - minX + CANVAS_PADDING * 2,
    height: maxY - minY + CANVAS_PADDING * 2,
    metrics
  };
}

/**
 * A segment that stops at the edge of the node box instead of disappearing
 * under it, so the thread visibly *arrives* rather than being covered.
 */
function straightPath(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  metrics: GraphMetrics,
  approach: number
): string {
  const inset = boxInset(approach, metrics);
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.hypot(dx, dy) || 1;
  const endX = toX - (dx / length) * inset;
  const endY = toY - (dy / length) * inset;
  return `M ${round(fromX)} ${round(fromY)} L ${round(endX)} ${round(endY)}`;
}

/**
 * A cross-track dependency, bowed toward the hub.
 *
 * A straight chord between two threads cuts across the middle of the map and
 * reads as a third structure. Pulling the control point in toward the centre
 * makes it curve around the hub instead, so it stays legible as a secondary
 * relationship.
 */
function arcThroughHub(
  from: PositionedNode,
  to: PositionedNode,
  hubX: number,
  hubY: number
): string {
  const midX = (from.centerX + to.centerX) / 2;
  const midY = (from.centerY + to.centerY) / 2;
  const controlX = midX + (hubX - midX) * 0.55;
  const controlY = midY + (hubY - midY) * 0.55;
  return `M ${round(from.centerX)} ${round(from.centerY)} Q ${round(controlX)} ${round(controlY)}, ${round(to.centerX)} ${round(to.centerY)}`;
}

/**
 * Half the node box measured along the direction the edge arrives from, so a
 * thread coming in horizontally stops at the side and one coming in vertically
 * stops at the top — not at some average that overshoots one and undershoots
 * the other.
 */
function boxInset(angle: number, metrics: GraphMetrics): number {
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const halfW = metrics.nodeWidth / 2;
  const halfH = metrics.nodeHeight / 2;
  return Math.min(cos ? halfW / cos : Infinity, sin ? halfH / sin : Infinity);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Keyboard neighbours for one node.
 *
 * Up and down travel the thread — toward the hub and away from it. Left and
 * right move around the circle to the nearest node at a similar distance,
 * which is what "next to it" means on a radial map. `[` and `]` jump whole
 * threads, landing on the node nearest the current ring.
 */
export function graphNeighbours(
  layout: GraphLayout,
  nodeId: string
): {
  up?: string;
  down?: string;
  left?: string;
  right?: string;
  prevTrack?: string;
  nextTrack?: string;
} {
  const current = layout.byId.get(nodeId);
  if (!current) return {};

  const sameTrack = layout.nodes
    .filter((n) => n.node.track === current.node.track)
    .sort((a, b) => a.ring - b.ring || a.angle - b.angle);

  const inward = [...sameTrack]
    .reverse()
    .find(
      (n) =>
        n.ring < current.ring ||
        (n.ring === current.ring && n.angle < current.angle)
    );
  const outward = sameTrack.find(
    (n) =>
      n.ring > current.ring ||
      (n.ring === current.ring && n.angle > current.angle)
  );

  /** Angular distance, normalised to [-π, π] so the circle wraps. */
  const delta = (angle: number) => {
    let d = angle - current.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  const around = layout.nodes
    .filter((n) => n.node.id !== nodeId)
    .map((n) => ({ node: n, delta: delta(n.angle) }));

  const nearest = (predicate: (d: number) => boolean) =>
    around
      .filter((entry) => predicate(entry.delta))
      .sort(
        (a, b) =>
          Math.abs(a.delta) - Math.abs(b.delta) ||
          Math.abs(a.node.ring - current.ring) -
            Math.abs(b.node.ring - current.ring)
      )[0]?.node.node.id;

  const trackOrder = layout.spokes.map((spoke) => spoke.trackId);
  const trackIndex = trackOrder.indexOf(current.node.track);
  const nodeInTrack = (index: number) => {
    const trackId = trackOrder.at(index % trackOrder.length);
    if (!trackId) return undefined;
    return layout.nodes
      .filter((n) => n.node.track === trackId)
      .sort(
        (a, b) =>
          Math.abs(a.ring - current.ring) - Math.abs(b.ring - current.ring)
      )[0]?.node.id;
  };

  return {
    up: inward?.node.id,
    down: outward?.node.id,
    left: nearest((d) => d < 0),
    right: nearest((d) => d > 0),
    prevTrack: nodeInTrack(trackIndex - 1 + trackOrder.length),
    nextTrack: nodeInTrack(trackIndex + 1)
  };
}
