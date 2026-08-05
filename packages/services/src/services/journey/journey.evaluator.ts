import { JourneyMetrics, JourneyMetricKey } from "./program/journey.metrics";
import {
  JourneyNodeDef,
  JourneyProgramDef,
  journeyNodes,
  journeyTracks,
  nodeDepths,
  nodeUnlocks,
} from "./program/journey.program";
import {
  JourneyTrackId,
  JourneyTrackMode,
  isTrackComplete,
  trackCompletionProgress,
} from "./program/journey.tracks";
import { JourneyWorkspaceType } from "./program/journey.workspace";

/**
 * Pure graph evaluation. No I/O, no clock, no configuration reads — give it a
 * metric bag and a program and it always returns the same verdict, which is
 * what makes it testable and what makes the `ruleHash` on an achievement
 * meaningful.
 *
 * The rules that matter:
 *
 * 1. **A node unlocks when every one of its dependencies is achieved.** There
 *    is no global order any more, so two workspaces can be working on entirely
 *    different parts of the graph and both be correct. The v2 property that
 *    mattered survives: a node whose dependencies are unmet is `locked`
 *    regardless of what its own metrics say, so flipping on a setting can never
 *    retro-unlock work that was skipped.
 * 2. **Tracks complete by their own rule**, not by "every node in the column".
 *    That is what lets Integrations mean "the roll-up plus any two capabilities".
 * 3. **The Journey completes by policy**: the required tracks, plus N elective
 *    tracks of the workspace's choosing. Two workspaces can finish having done
 *    completely different things.
 */

export type JourneyNodeStatus =
  /** Requirements met (now, or previously and persisted as an achievement). */
  | "achieved"
  /** Unlocked, and there is measurable progress on at least one requirement. */
  | "in_progress"
  /** Unlocked, nothing done yet. */
  | "available"
  /** At least one dependency is still unmet. */
  | "locked";

export interface JourneyRequirementState {
  id: string;
  metric: JourneyMetricKey;
  target: number;
  current: number;
  done: boolean;
  /** 0-100, capped. Purely for rendering a bar. */
  progressPct: number;
  actionKey: string;
}

export interface JourneyNodeState {
  id: string;
  track: JourneyTrackId;
  status: JourneyNodeStatus;
  optional: boolean;
  /** Graph row: the longest dependency path from the root. */
  depth: number;
  rewardCents: number;
  dependsOn: string[];
  /** Visible nodes that name this one as a dependency. */
  unlocks: string[];
  /**
   * The dependencies that are actually holding this node back, so the UI can
   * name them instead of saying "complete the previous step".
   */
  blockedBy: string[];
  requirements: JourneyRequirementState[];
  /** How many requirements are satisfied right now. */
  completed: number;
  total: number;
  /** 0-100 across the node's requirements, each capped at its own target. */
  progressPct: number;
}

export interface JourneyTrackState {
  id: JourneyTrackId;
  order: number;
  mode: JourneyTrackMode;
  complete: boolean;
  /** Progress toward the track's own completion rule, not a raw node count. */
  satisfied: number;
  needed: number;
  /** Every visible node in the track, in depth order. */
  nodeIds: string[];
  achievedNodes: number;
  totalNodes: number;
}

export interface JourneyCompletionState {
  /** Required tracks that are done, over required tracks that exist. */
  requiredComplete: number;
  requiredTotal: number;
  /** Elective tracks completed, over the minimum the policy asks for. */
  electiveComplete: number;
  electiveRequired: number;
  /** How many elective tracks the workspace could still choose from. */
  electiveAvailable: number;
  /** The whole Journey: required tracks done AND the elective minimum met. */
  complete: boolean;
}

export interface JourneyEvaluation {
  workspaceType: JourneyWorkspaceType;
  programVersion: string;
  nodes: JourneyNodeState[];
  tracks: JourneyTrackState[];
  completion: JourneyCompletionState;
  /** The node the recommendation points at, or null when there is nothing left. */
  recommendedNodeId: string | null;
  /** The single most useful requirement to move next, or null. */
  recommendedRequirement: JourneyRequirementState | null;
}

function evaluateRequirements(
  node: JourneyNodeDef,
  metrics: JourneyMetrics,
): JourneyRequirementState[] {
  return node.requirements.map((requirement) => {
    const current = metrics[requirement.metric] ?? 0;
    return {
      id: requirement.id,
      metric: requirement.metric,
      target: requirement.target,
      current,
      done: current >= requirement.target,
      progressPct:
        requirement.target <= 0
          ? 100
          : Math.min(100, Math.round((current / requirement.target) * 100)),
      actionKey: requirement.actionKey,
    };
  });
}

/**
 * Evaluates a graph against a metric bag.
 *
 * @param achievedNodeIds nodes already persisted as achievements. They stay
 *        `achieved` even if the current window no longer satisfies them — a
 *        node earned is a node kept — and they still count as satisfied for the
 *        purpose of unlocking their dependents, so a quiet month cannot lock a
 *        workspace out of progress it already made.
 */
export function evaluateJourney(
  program: JourneyProgramDef,
  workspaceType: JourneyWorkspaceType,
  metrics: JourneyMetrics,
  achievedNodeIds: ReadonlySet<string> = new Set(),
): JourneyEvaluation {
  const visible = journeyNodes(program, workspaceType);
  const depths = nodeDepths(program, workspaceType);
  const visibleIds = new Set(visible.map((node) => node.id));

  // Pass 1: what is satisfied on its own terms, ignoring dependencies.
  const requirementsByNode = new Map<string, JourneyRequirementState[]>();
  const satisfied = new Set<string>();

  for (const node of visible) {
    const requirements = evaluateRequirements(node, metrics);
    requirementsByNode.set(node.id, requirements);
    const satisfiedNow = requirements.every((r) => r.done);
    if (satisfiedNow || achievedNodeIds.has(node.id)) satisfied.add(node.id);
  }

  // Pass 2: statuses, in depth order so a node's dependencies are always
  // resolved before it is. This is the line that kills node-skipping: a node
  // whose dependency chain is broken is `locked` whatever its own numbers say.
  const ordered = [...visible].sort(
    (a, b) => (depths.get(a.id) ?? 0) - (depths.get(b.id) ?? 0),
  );

  const achieved = new Set<string>();
  const nodes: JourneyNodeState[] = [];

  for (const node of ordered) {
    const requirements = requirementsByNode.get(node.id)!;
    const completed = requirements.filter((r) => r.done).length;

    // Dependencies outside this workspace's node set are not blockers — the
    // applicability-closure invariant guarantees they never gate a visible node.
    const blockedBy = node.dependsOn.filter(
      (dependency) => visibleIds.has(dependency) && !achieved.has(dependency),
    );

    let status: JourneyNodeStatus;
    if (blockedBy.length > 0) {
      status = "locked";
    } else if (satisfied.has(node.id)) {
      status = "achieved";
      achieved.add(node.id);
    } else if (requirements.some((r) => r.current > 0)) {
      status = "in_progress";
    } else {
      status = "available";
    }

    nodes.push({
      id: node.id,
      track: node.track,
      status,
      optional: node.optional,
      depth: depths.get(node.id) ?? 0,
      rewardCents: node.rewardCents[workspaceType],
      dependsOn: node.dependsOn.filter((id) => visibleIds.has(id)),
      unlocks: nodeUnlocks(program, workspaceType, node.id),
      blockedBy,
      requirements,
      completed,
      total: requirements.length,
      progressPct: requirements.length
        ? Math.round(
            requirements.reduce((sum, r) => sum + r.progressPct, 0) /
              requirements.length,
          )
        : 0,
    });
  }

  const tracks = evaluateTracks(program, workspaceType, nodes, achieved);
  const completion = evaluateCompletion(program, workspaceType, tracks);
  const recommended = recommendNext(nodes, tracks, completion);

  return {
    workspaceType,
    programVersion: program.version,
    // Stable render order: track column, then depth, then id.
    nodes: nodes.sort(sortForRender(program, workspaceType)),
    tracks,
    completion,
    recommendedNodeId: recommended?.node.id ?? null,
    recommendedRequirement: recommended?.requirement ?? null,
  };
}

function sortForRender(
  program: JourneyProgramDef,
  workspaceType: JourneyWorkspaceType,
) {
  const trackOrder = new Map(
    journeyTracks(program, workspaceType).map((track) => [
      track.id,
      track.order,
    ]),
  );
  return (a: JourneyNodeState, b: JourneyNodeState) =>
    (trackOrder.get(a.track) ?? 0) - (trackOrder.get(b.track) ?? 0) ||
    a.depth - b.depth ||
    a.id.localeCompare(b.id);
}

function evaluateTracks(
  program: JourneyProgramDef,
  workspaceType: JourneyWorkspaceType,
  nodes: readonly JourneyNodeState[],
  achieved: ReadonlySet<string>,
): JourneyTrackState[] {
  const applicable = new Set(nodes.map((node) => node.id));

  return journeyTracks(program, workspaceType).map((track) => {
    const trackNodes = nodes
      .filter((node) => node.track === track.id)
      .sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));

    const progress = trackCompletionProgress(
      track.completion,
      achieved,
      applicable,
    );

    return {
      id: track.id,
      order: track.order,
      mode: track.mode,
      complete: isTrackComplete(track.completion, achieved, applicable),
      satisfied: progress.satisfied,
      needed: progress.needed,
      nodeIds: trackNodes.map((node) => node.id),
      achievedNodes: trackNodes.filter((node) => node.status === "achieved")
        .length,
      totalNodes: trackNodes.length,
    };
  });
}

/**
 * Journey completion: the required tracks, plus enough elective ones.
 *
 * Deliberately independent of money. A workspace can be "complete" with credit
 * still unclaimed, and can have claimed every cent of two tracks without being
 * complete. Conflating the two is what made v1 feel like a paywall.
 */
function evaluateCompletion(
  program: JourneyProgramDef,
  workspaceType: JourneyWorkspaceType,
  tracks: readonly JourneyTrackState[],
): JourneyCompletionState {
  const requiredIds = new Set<string>(
    program.policy.requiredTrackIds[workspaceType],
  );
  const electiveRequired = program.policy.minimumElectiveTracks[workspaceType];

  const required = tracks.filter((track) => requiredIds.has(track.id));
  const elective = tracks.filter((track) => !requiredIds.has(track.id));

  const requiredComplete = required.filter((track) => track.complete).length;
  const electiveComplete = elective.filter((track) => track.complete).length;

  return {
    requiredComplete,
    requiredTotal: required.length,
    electiveComplete,
    electiveRequired,
    electiveAvailable: elective.length,
    complete:
      requiredComplete === required.length &&
      electiveComplete >= electiveRequired,
  };
}

/**
 * The single highest-leverage thing to do next.
 *
 * Priority, in order:
 *
 * 1. Core first. While the required track is unfinished nothing else is the
 *    right advice — every other track hangs off it anyway.
 * 2. Prefer a node already in progress: finishing something beats starting.
 * 3. Prefer a track the workspace already has real activity in. Telling someone
 *    who has never run a campaign to run two is not a next action.
 * 4. Prefer the node closest to completing an elective track, so the
 *    recommendation actually moves Journey completion.
 * 5. Never recommend a zero-reward bonus node while a completion path is open.
 *    Bonus work is for people who have finished, not a detour for people who
 *    have not.
 * 6. Break ties on how close the node is to done.
 *
 * All of it happens here, server-side. The client renders the answer.
 */
function recommendNext(
  nodes: readonly JourneyNodeState[],
  tracks: readonly JourneyTrackState[],
  completion: JourneyCompletionState,
): { node: JourneyNodeState; requirement: JourneyRequirementState } | null {
  const actionable = nodes.filter(
    (node) => node.status === "in_progress" || node.status === "available",
  );
  if (!actionable.length) return null;

  const trackById = new Map(tracks.map((track) => [track.id, track]));

  // 1. Core, while it is unfinished. Nothing else is the right advice.
  const coreTrack = trackById.get("core");
  if (coreTrack && !coreTrack.complete) {
    const coreCandidates = actionable.filter((node) => node.track === "core");
    if (coreCandidates.length) return pickBest(rank(coreCandidates));
  }

  // 5. Zero-reward bonus nodes are excluded outright — not merely penalised —
  //    while a completion path is still open. A soft penalty loses to the
  //    in-progress bonus, which is exactly how "finish setting up call sessions"
  //    ends up outranking "turn on transcription" for someone two nodes from
  //    completing a track.
  const completionPathOpen =
    completion.requiredComplete < completion.requiredTotal ||
    completion.electiveComplete < completion.electiveRequired;

  const isDetour = (node: JourneyNodeState) =>
    node.optional && node.rewardCents === 0;

  const eligible =
    completionPathOpen && actionable.some((node) => !isDetour(node))
      ? actionable.filter((node) => !isDetour(node))
      : actionable;

  function rank(candidates: readonly JourneyNodeState[]): JourneyNodeState[] {
    const score = (node: JourneyNodeState): number => {
      const track = trackById.get(node.track);
      let value = 0;

      // 2. Finishing beats starting.
      if (node.status === "in_progress") value += 1000;

      // 3. A track the workspace is already active in — measured, not assumed.
      if (track && track.achievedNodes > 0) value += 400;

      // 4. Closeness to completing a track: the fewer nodes its rule still
      //    needs, the more a single node is worth.
      if (track && !track.complete && track.needed > 0) {
        const remaining = Math.max(0, track.needed - track.satisfied);
        if (remaining > 0) value += Math.round(300 / remaining);
      }

      // 6. Closeness to done.
      value += node.progressPct;

      return value;
    };

    return [...candidates].sort(
      (a, b) => score(b) - score(a) || a.id.localeCompare(b.id),
    );
  }

  return pickBest(rank(eligible));
}

/**
 * The first node of an already-ranked list that still has something to do,
 * paired with its most-advanced unmet requirement — the smallest ask that
 * still moves the workspace forward.
 *
 * The incoming order is authoritative: re-sorting here would silently discard
 * the ranking the caller just computed.
 */
function pickBest(
  candidates: readonly JourneyNodeState[],
): { node: JourneyNodeState; requirement: JourneyRequirementState } | null {
  for (const node of candidates) {
    const requirement = [...node.requirements.filter((r) => !r.done)].sort(
      (a, b) => b.progressPct - a.progressPct,
    )[0];
    if (requirement) return { node, requirement };
  }
  return null;
}

/**
 * The nodes that should be persisted as achievements, in dependency order.
 *
 * Only nodes satisfied by the CURRENT metrics are returned — a node that is
 * `achieved` purely because it was persisted before is already recorded, and a
 * node unlocked by that grandfathering must still meet its own requirements
 * before it earns its own row.
 */
export function newlyAchievedNodes(
  evaluation: JourneyEvaluation,
  alreadyAchieved: ReadonlySet<string>,
): JourneyNodeState[] {
  return evaluation.nodes
    .filter(
      (node) =>
        node.status === "achieved" &&
        node.completed === node.total &&
        !alreadyAchieved.has(node.id),
    )
    .sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
}

/** The tracks that just became complete, for the `journey_track_completed` event. */
export function newlyCompletedTracks(
  evaluation: JourneyEvaluation,
  alreadyCompleted: ReadonlySet<string>,
): JourneyTrackState[] {
  return evaluation.tracks.filter(
    (track) => track.complete && !alreadyCompleted.has(track.id),
  );
}
