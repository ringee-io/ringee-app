import { JourneyWorkspaceType } from "./journey.workspace";

/**
 * Journey tracks — the columns of the graph and the unit of *choice*.
 *
 * The v2 ladder made every workspace walk the same rungs in the same order. A
 * digital agency that never runs campaigns and a call centre that never touches
 * MCP were both told they were "stuck" on a stage that had nothing to do with
 * how they sell. Tracks fix that: only Core Calling is required, everything else
 * is elective, and a workspace finishes the Journey by completing Core plus its
 * own choice of elective tracks.
 *
 * Two orthogonal concepts, deliberately not merged into one flag:
 *
 * - **Track mode** (`required` | `elective`) answers "must this whole track be
 *   done?". It lives here.
 * - **Node `optional`** answers "is this node a bonus inside its track?". It
 *   lives on the node.
 *
 * v2 overloaded a single `optional` boolean for both and could not express
 * "Integrations is elective, but if you do it, CRM is not the only way".
 */

export type JourneyTrackId =
  | "core"
  | "team"
  | "campaigns"
  | "integrations"
  | "ai"
  | "automation"
  | "inbound";

/** Fixed left-to-right order of the graph columns. */
export const JOURNEY_TRACK_IDS = [
  "core",
  "team",
  "campaigns",
  "integrations",
  "ai",
  "automation",
  "inbound",
] as const satisfies readonly JourneyTrackId[];

export type JourneyTrackMode = "required" | "elective";

/**
 * When a track counts as complete.
 *
 * Every variant is evaluated against the set of achieved node ids, so a rule can
 * never disagree with the node states shown on the graph.
 *
 * - `capstone`  — one node finishes the track (the common case).
 * - `all`       — every listed node.
 * - `minimum`   — any N of the listed nodes.
 * - `combined`  — every `allOf` node, plus at least `minimumAnyOf` of `anyOf`.
 *                 This is what lets Integrations say "the roll-up node, plus any
 *                 two capabilities of your choosing".
 */
export type JourneyTrackCompletionRule =
  | { type: "capstone"; nodeId: string }
  | { type: "all"; nodeIds: readonly string[] }
  | { type: "minimum"; nodeIds: readonly string[]; minimum: number }
  | {
      type: "combined";
      allOf?: readonly string[];
      anyOf?: readonly string[];
      minimumAnyOf?: number;
    };

export interface JourneyTrackDef {
  id: JourneyTrackId;
  /** Column position. Lower is further left; also the mobile carousel order. */
  order: number;
  appliesTo: readonly JourneyWorkspaceType[];
  mode: JourneyTrackMode;
  completion: JourneyTrackCompletionRule;
}

/**
 * How many tracks a workspace must finish to finish the Journey.
 *
 * `requiredTrackIds` are non-negotiable. `minimumElectiveTracks` is a count, not
 * a list, which is the whole point: two workspaces can both be "done" having
 * completed entirely different elective tracks.
 */
export interface JourneyCompletionPolicy {
  requiredTrackIds: Record<JourneyWorkspaceType, readonly JourneyTrackId[]>;
  minimumElectiveTracks: Record<JourneyWorkspaceType, number>;
}

/**
 * Every node id named by a completion rule. Used by the program invariant tests
 * to prove a rule can never reference a node that does not exist.
 */
export function completionRuleNodeIds(
  rule: JourneyTrackCompletionRule,
): readonly string[] {
  switch (rule.type) {
    case "capstone":
      return [rule.nodeId];
    case "all":
    case "minimum":
      return rule.nodeIds;
    case "combined":
      return [...(rule.allOf ?? []), ...(rule.anyOf ?? [])];
  }
}

/**
 * Evaluates a completion rule against the achieved set.
 *
 * `applicable` filters out nodes the workspace cannot see, so an organization
 * rule reused by a personal workspace does not become unsatisfiable because of
 * a node that was never on offer.
 */
export function isTrackComplete(
  rule: JourneyTrackCompletionRule,
  achieved: ReadonlySet<string>,
  applicable: ReadonlySet<string>,
): boolean {
  const visible = (ids: readonly string[]) =>
    ids.filter((id) => applicable.has(id));
  const done = (ids: readonly string[]) =>
    visible(ids).filter((id) => achieved.has(id)).length;

  switch (rule.type) {
    case "capstone":
      return applicable.has(rule.nodeId) && achieved.has(rule.nodeId);

    case "all": {
      const nodes = visible(rule.nodeIds);
      return nodes.length > 0 && done(rule.nodeIds) === nodes.length;
    }

    case "minimum":
      return done(rule.nodeIds) >= rule.minimum;

    case "combined": {
      const allOf = visible(rule.allOf ?? []);
      const allOfDone = done(rule.allOf ?? []) === allOf.length;
      const anyOfNeeded = rule.minimumAnyOf ?? 0;
      const anyOfDone = done(rule.anyOf ?? []) >= anyOfNeeded;
      // An empty `allOf` is vacuously satisfied; an empty `anyOf` with a
      // non-zero minimum is not, and that is a program bug the tests catch.
      return allOfDone && anyOfDone;
    }
  }
}

/**
 * Progress toward a completion rule, as satisfied/needed counts.
 *
 * Rendered by the track bar, so the numbers must mean the same thing the rule
 * means — "3 of 5 nodes" would be a lie for a `combined` rule that only needs
 * two of them.
 */
export function trackCompletionProgress(
  rule: JourneyTrackCompletionRule,
  achieved: ReadonlySet<string>,
  applicable: ReadonlySet<string>,
): { satisfied: number; needed: number } {
  const visible = (ids: readonly string[]) =>
    ids.filter((id) => applicable.has(id));
  const done = (ids: readonly string[]) =>
    visible(ids).filter((id) => achieved.has(id)).length;

  switch (rule.type) {
    case "capstone":
      return { satisfied: achieved.has(rule.nodeId) ? 1 : 0, needed: 1 };

    case "all":
      return {
        satisfied: done(rule.nodeIds),
        needed: visible(rule.nodeIds).length,
      };

    case "minimum":
      return {
        satisfied: Math.min(done(rule.nodeIds), rule.minimum),
        needed: rule.minimum,
      };

    case "combined": {
      const allOfNeeded = visible(rule.allOf ?? []).length;
      const anyOfNeeded = rule.minimumAnyOf ?? 0;
      return {
        satisfied:
          done(rule.allOf ?? []) +
          Math.min(done(rule.anyOf ?? []), anyOfNeeded),
        needed: allOfNeeded + anyOfNeeded,
      };
    }
  }
}
