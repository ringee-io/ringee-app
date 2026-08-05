import { JourneyMetrics, JourneyMetricKey } from "./program/journey.metrics";
import {
  JourneyProgramDef,
  JourneyStageDef,
  JourneyStageId,
  JourneyWorkspaceType,
  journeyLadder,
} from "./program/journey.program";

/**
 * Pure stage evaluation. No I/O, no clock, no configuration reads — give it a
 * metric bag and a program and it always returns the same verdict, which is
 * what makes it testable and what makes the `ruleHash` on an achievement
 * meaningful.
 *
 * The one rule that matters: the ladder is walked in order and evaluation stops
 * at the first stage whose requirements are not all met. A stage is therefore
 * reachable only if every stage before it was *independently* satisfied — the
 * v1 bug where flipping on call recording retro-unlocked the campaign stage is
 * structurally impossible here.
 */

export type JourneyStageStatus =
  /** Requirements met (now, or previously and persisted as an achievement). */
  | "achieved"
  /** This is the stage being worked on: the previous one is done, this is not. */
  | "in_progress"
  /** An earlier stage is still unmet, so this one cannot be worked on yet. */
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

export interface JourneyStageState {
  id: JourneyStageId;
  order: number;
  status: JourneyStageStatus;
  rewardCents: number;
  requirements: JourneyRequirementState[];
  /** How many requirements are satisfied right now. */
  completed: number;
  total: number;
  /** 0-100 across the stage's requirements, each capped at its own target. */
  progressPct: number;
}

export interface JourneyEvaluation {
  workspaceType: JourneyWorkspaceType;
  programVersion: string;
  stages: JourneyStageState[];
  /**
   * Order of the highest stage satisfied by the CURRENT metrics, walking the
   * ladder without gaps. 0 when even the first stage is unmet.
   */
  reachedOrder: number;
  /** The stage the workspace is working on, or null when the ladder is done. */
  currentStageId: JourneyStageId | null;
  /** The single most useful thing to do next, or null when the ladder is done. */
  nextRequirement: JourneyRequirementState | null;
  completed: boolean;
}

function evaluateRequirements(
  stage: JourneyStageDef,
  metrics: JourneyMetrics,
): JourneyRequirementState[] {
  return stage.requirements.map((requirement) => {
    const current = metrics[requirement.metric] ?? 0;
    const done = current >= requirement.target;
    return {
      id: requirement.id,
      metric: requirement.metric,
      target: requirement.target,
      current,
      done,
      progressPct:
        requirement.target <= 0
          ? 100
          : Math.min(100, Math.round((current / requirement.target) * 100)),
      actionKey: requirement.actionKey,
    };
  });
}

/**
 * Evaluates a ladder against a metric bag.
 *
 * @param achievedStageIds stages already persisted as achievements. They stay
 *        `achieved` even if the current window no longer satisfies them — a
 *        stage earned is a stage kept — and they still count as satisfied for
 *        the purpose of unlocking the next one, so a quiet month cannot lock a
 *        workspace out of progress it already made.
 */
export function evaluateJourney(
  program: JourneyProgramDef,
  workspaceType: JourneyWorkspaceType,
  metrics: JourneyMetrics,
  achievedStageIds: ReadonlySet<string> = new Set(),
): JourneyEvaluation {
  const ladder = journeyLadder(program, workspaceType);
  const stages: JourneyStageState[] = [];

  let chainIntact = true;
  let reachedOrder = 0;

  for (const stage of ladder) {
    const requirements = evaluateRequirements(stage, metrics);
    const completed = requirements.filter((r) => r.done).length;
    const satisfiedNow = completed === requirements.length;
    const previouslyAchieved = achievedStageIds.has(stage.id);
    const satisfied = satisfiedNow || previouslyAchieved;

    let status: JourneyStageStatus;
    if (!chainIntact) {
      // An earlier stage is unmet. Whatever this stage's own numbers say, it is
      // not reachable — this is the line that kills stage-skipping.
      status = "locked";
    } else if (satisfied) {
      status = "achieved";
      reachedOrder = stage.order;
    } else {
      status = "in_progress";
      chainIntact = false;
    }

    stages.push({
      id: stage.id,
      order: stage.order,
      status,
      rewardCents: stage.rewardCents,
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

  const current = stages.find((s) => s.status === "in_progress") ?? null;

  return {
    workspaceType,
    programVersion: program.version,
    stages,
    reachedOrder,
    currentStageId: current?.id ?? null,
    // The requirement closest to done among the unmet ones: the smallest ask
    // that still moves the workspace forward.
    nextRequirement: current
      ? ([...current.requirements.filter((r) => !r.done)].sort(
          (a, b) => b.progressPct - a.progressPct,
        )[0] ?? null)
      : null,
    completed: current === null,
  };
}

/**
 * The stages that should be persisted as achievements, in ladder order.
 *
 * Only stages satisfied by the CURRENT metrics are returned — a stage that is
 * `achieved` purely because it was persisted before is already recorded, and a
 * stage unlocked by that grandfathering must still meet its own requirements
 * before it earns its own row.
 */
export function newlyAchievedStages(
  evaluation: JourneyEvaluation,
  alreadyAchieved: ReadonlySet<string>,
): JourneyStageState[] {
  return evaluation.stages
    .filter(
      (stage) =>
        stage.status === "achieved" &&
        stage.completed === stage.total &&
        !alreadyAchieved.has(stage.id),
    )
    .sort((a, b) => a.order - b.order);
}
