import { createHash } from "node:crypto";
import { JourneyProgramDef, JourneyWorkspaceType } from "./journey.program";
import { JOURNEY_CAPABILITY_RULES } from "./journey.capabilities";

/**
 * A deterministic fingerprint of the rules that granted an achievement.
 *
 * Stamped on every `JourneyStageAchievement` so an audit can answer "which
 * exact thresholds was this workspace measured against?" even after the
 * program file has moved on. The version string alone is not enough: a
 * hot-fixed threshold inside a released version would be invisible.
 *
 * Only the parts that can change a verdict are hashed — ids, metrics, targets,
 * reward amounts and the capability floors. Ordering is normalised so a pure
 * reordering of the source file does not invalidate history.
 */
export function journeyRuleHash(
  program: JourneyProgramDef,
  workspaceType: JourneyWorkspaceType,
): string {
  const ladder = program.ladders[workspaceType]
    .map((stage) =>
      [
        stage.id,
        stage.order,
        stage.rewardCents,
        [...stage.requirements]
          .map((r) => `${r.id}:${r.metric}:${r.target}`)
          .sort()
          .join(","),
      ].join("|"),
    )
    .sort()
    .join(";");

  const capabilities = JOURNEY_CAPABILITY_RULES.map((rule) =>
    [
      rule.id,
      [...rule.requires]
        .map((need) => `${need.metric}:${need.atLeast}`)
        .sort()
        .join(","),
    ].join("|"),
  )
    .sort()
    .join(";");

  return createHash("sha256")
    .update(`${program.version}\n${workspaceType}\n${ladder}\n${capabilities}`)
    .digest("hex")
    .slice(0, 32);
}
