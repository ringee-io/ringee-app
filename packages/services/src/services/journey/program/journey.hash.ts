import { createHash } from "node:crypto";
import {
  JourneyProgramDef,
  journeyNodes,
  journeyTracks,
} from "./journey.program";
import { JourneyWorkspaceType } from "./journey.workspace";
import { JOURNEY_CAPABILITY_RULES } from "./journey.capabilities";
import { completionRuleNodeIds } from "./journey.tracks";

/**
 * A deterministic fingerprint of the rules that granted an achievement.
 *
 * Stamped on every `JourneyStageAchievement` so an audit can answer "which
 * exact rules was this workspace measured against?" even after the program file
 * has moved on. The version string alone is not enough: a hot-fixed threshold
 * inside a released version would be invisible.
 *
 * Only the parts that can change a verdict are hashed — node ids, dependencies,
 * metrics, targets, reward amounts, track completion rules, the completion
 * policy and the capability floors. Ordering is normalised so a pure reordering
 * of the source file does not invalidate history.
 *
 * v3 additions matter as much as the thresholds: moving a node between tracks,
 * loosening a completion rule or dropping a dependency all change what a given
 * achievement *meant*, so all three are inside the hash.
 */
export function journeyRuleHash(
  program: JourneyProgramDef,
  workspaceType: JourneyWorkspaceType,
): string {
  const nodes = journeyNodes(program, workspaceType)
    .map((node) =>
      [
        node.id,
        node.track,
        node.optional ? "optional" : "core",
        node.rewardCents[workspaceType],
        [...node.dependsOn].sort().join(","),
        [...node.requirements]
          .map((r) => `${r.id}:${r.metric}:${r.target}`)
          .sort()
          .join(","),
      ].join("|"),
    )
    .sort()
    .join(";");

  const tracks = journeyTracks(program, workspaceType)
    .map((track) =>
      [
        track.id,
        track.mode,
        track.completion.type,
        // `minimum` / `minimumAnyOf` change what "complete" means, so the count
        // is hashed alongside the ids it applies to.
        "minimum" in track.completion ? track.completion.minimum : "",
        "minimumAnyOf" in track.completion
          ? (track.completion.minimumAnyOf ?? "")
          : "",
        [...completionRuleNodeIds(track.completion)].sort().join(","),
      ].join("|"),
    )
    .sort()
    .join(";");

  const policy = [
    [...program.policy.requiredTrackIds[workspaceType]].sort().join(","),
    program.policy.minimumElectiveTracks[workspaceType],
  ].join("|");

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
    .update(
      `${program.version}\n${workspaceType}\n${nodes}\n${tracks}\n${policy}\n${capabilities}`,
    )
    .digest("hex")
    .slice(0, 32);
}
