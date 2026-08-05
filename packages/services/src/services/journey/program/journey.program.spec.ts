/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  JOURNEY_PROGRAM_2026_09,
  JOURNEY_LEGACY_PROGRAM_VERSIONS,
  findTrack,
  getJourneyProgram,
  journeyNodes,
  journeyTracks,
  nodeDepths,
  nodeUnlocks,
  programCompletionNodeIds,
  programTotalCents,
  trackCompletionPath,
} from "./journey.program";
import { JOURNEY_METRIC_KEYS } from "./journey.metrics";
import { JOURNEY_WORKSPACE_TYPES } from "./journey.workspace";
import { completionRuleNodeIds, isTrackComplete } from "./journey.tracks";

/**
 * Program invariants.
 *
 * These are not "tests" in the usual sense — they are the structural guarantees
 * the graph makes to the rest of the system, executed. A change that breaks one
 * of them is a change that would let a bonus node block a required one, let
 * Inbound gate the Journey, or quietly raise how much money the program can pay
 * out. All three are the kind of bug you only find in production, so they fail
 * the build instead.
 */

const program = JOURNEY_PROGRAM_2026_09;
const byId = new Map(program.nodes.map((node) => [node.id, node]));

describe("Journey program 2026.09 — structure", () => {
  it("has unique node ids", () => {
    const ids = program.nodes.map((node) => node.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("has unique track ids and orders", () => {
    const ids = program.tracks.map((track) => track.id);
    const orders = program.tracks.map((track) => track.order);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(new Set(orders).size, orders.length);
  });

  it("places every node in a declared track", () => {
    for (const node of program.nodes) {
      assert.ok(findTrack(program, node.track), `${node.id} has no track`);
    }
  });

  it("writes every requirement against a real metric key", () => {
    for (const node of program.nodes) {
      for (const requirement of node.requirements) {
        assert.ok(
          (JOURNEY_METRIC_KEYS as readonly string[]).includes(
            requirement.metric,
          ),
          `${node.id}.${requirement.id} uses unknown metric ${requirement.metric}`,
        );
      }
    }
  });

  it("gives every node at least one requirement", () => {
    for (const node of program.nodes) {
      assert.ok(node.requirements.length > 0, `${node.id} has no requirements`);
    }
  });

  it("gives every node an integer reward for both workspace types", () => {
    for (const node of program.nodes) {
      for (const workspaceType of JOURNEY_WORKSPACE_TYPES) {
        const cents = node.rewardCents[workspaceType];
        assert.ok(Number.isInteger(cents), `${node.id} ${workspaceType}`);
        assert.ok(cents >= 0, `${node.id} ${workspaceType} is negative`);
      }
    }
  });

  it("never pays a workspace type for a node it cannot see", () => {
    for (const node of program.nodes) {
      for (const workspaceType of JOURNEY_WORKSPACE_TYPES) {
        if (!node.appliesTo.includes(workspaceType)) {
          assert.equal(
            node.rewardCents[workspaceType],
            0,
            `${node.id} pays ${workspaceType} but does not apply to it`,
          );
        }
      }
    }
  });
});

describe("Journey program — invariant A: dependencies resolve, graph is acyclic", () => {
  it("resolves every dependency id to a real node", () => {
    for (const node of program.nodes) {
      for (const dependency of node.dependsOn) {
        assert.ok(
          byId.get(dependency),
          `${node.id} depends on unknown ${dependency}`,
        );
      }
    }
  });

  it("has no cycles", () => {
    const state = new Map<string, "visiting" | "done">();
    const cycles: string[] = [];

    const walk = (id: string, stack: string[]) => {
      if (state.get(id) === "done") return;
      if (state.get(id) === "visiting") {
        cycles.push([...stack, id].join(" -> "));
        return;
      }
      state.set(id, "visiting");
      for (const dependency of byId.get(id)?.dependsOn ?? []) {
        walk(dependency, [...stack, id]);
      }
      state.set(id, "done");
    };

    for (const node of program.nodes) walk(node.id, []);
    assert.deepEqual(cycles, []);
  });

  it("roots the graph at exactly one node", () => {
    const roots = program.nodes
      .filter((node) => node.dependsOn.length === 0)
      .map((node) => node.id);
    assert.deepEqual(roots, ["core.setup"]);
  });

  it("gives every visible node a finite depth", () => {
    for (const workspaceType of JOURNEY_WORKSPACE_TYPES) {
      const depths = nodeDepths(program, workspaceType);
      for (const node of journeyNodes(program, workspaceType)) {
        const depth = depths.get(node.id);
        assert.ok(depth !== undefined && depth >= 0, `${node.id} has no depth`);
      }
    }
  });

  it("renders every node strictly below all of its visible dependencies", () => {
    for (const workspaceType of JOURNEY_WORKSPACE_TYPES) {
      const depths = nodeDepths(program, workspaceType);
      for (const node of journeyNodes(program, workspaceType)) {
        for (const dependency of node.dependsOn) {
          const parent = depths.get(dependency);
          if (parent === undefined) continue;
          assert.ok(
            depths.get(node.id)! > parent,
            `${node.id} is not below ${dependency}`,
          );
        }
      }
    }
  });
});

describe("Journey program — invariant B: optional nodes never block", () => {
  const isOptional = (id: string) => byId.get(id)?.optional ?? false;

  it("never lets a non-optional node depend on an optional one", () => {
    const violations: string[] = [];
    for (const node of program.nodes) {
      if (node.optional) continue;
      for (const dependency of node.dependsOn) {
        if (isOptional(dependency)) {
          violations.push(`${node.id} depends on optional ${dependency}`);
        }
      }
    }
    assert.deepEqual(violations, []);
  });

  it("never names an optional node in a track completion rule", () => {
    assert.deepEqual(programCompletionNodeIds(program).filter(isOptional), []);
  });

  it("derives the optional flag from the track completion path", () => {
    // The flag is a cache of this computation. If the two disagree, someone
    // added a node and guessed.
    const mismatches: string[] = [];
    for (const node of program.nodes) {
      const onPath = trackCompletionPath(program, node.track).has(node.id);
      if (node.optional === onPath) {
        mismatches.push(
          `${node.id}: optional=${node.optional} but onCompletionPath=${onPath}`,
        );
      }
    }
    assert.deepEqual(mismatches, []);
  });
});

describe("Journey program — invariant C: applicability closure", () => {
  it("never lets a node depend on one its workspace type cannot see", () => {
    const violations: string[] = [];
    for (const node of program.nodes) {
      for (const workspaceType of node.appliesTo) {
        for (const dependencyId of node.dependsOn) {
          const dependency = byId.get(dependencyId);
          if (dependency && !dependency.appliesTo.includes(workspaceType)) {
            violations.push(
              `${node.id} (${workspaceType}) depends on ${dependencyId}, which does not apply`,
            );
          }
        }
      }
    }
    assert.deepEqual(violations, []);
  });

  it("keeps every track's completion rule satisfiable", () => {
    for (const track of program.tracks) {
      for (const workspaceType of track.appliesTo) {
        const applicable = new Set(
          journeyNodes(program, workspaceType).map((node) => node.id),
        );
        // Achieving everything visible must complete the track. A rule that
        // cannot be satisfied is a track a workspace can never finish.
        assert.ok(
          isTrackComplete(track.completion, applicable, applicable),
          `${track.id} is unsatisfiable for ${workspaceType}`,
        );
      }
    }
  });

  it("only names in-track nodes that exist in completion rules", () => {
    for (const track of program.tracks) {
      for (const nodeId of completionRuleNodeIds(track.completion)) {
        const node = byId.get(nodeId);
        assert.ok(node, `${track.id} names unknown node ${nodeId}`);
        assert.equal(node!.track, track.id);
      }
    }
  });
});

describe("Journey program — invariant D: Inbound is fully non-blocking", () => {
  it("is never depended on from outside its own track", () => {
    const violations: string[] = [];
    for (const node of program.nodes) {
      if (node.track === "inbound") continue;
      for (const dependencyId of node.dependsOn) {
        if (byId.get(dependencyId)?.track === "inbound") {
          violations.push(`${node.id} depends on inbound ${dependencyId}`);
        }
      }
    }
    assert.deepEqual(violations, []);
  });

  it("is never named by another track's completion rule", () => {
    for (const track of program.tracks) {
      if (track.id === "inbound") continue;
      for (const nodeId of completionRuleNodeIds(track.completion)) {
        assert.notEqual(byId.get(nodeId)!.track, "inbound");
      }
    }
  });

  it("is elective, so it can never be required for Journey completion", () => {
    assert.equal(findTrack(program, "inbound")!.mode, "elective");
    for (const workspaceType of JOURNEY_WORKSPACE_TYPES) {
      assert.ok(
        !program.policy.requiredTrackIds[workspaceType].includes("inbound"),
      );
    }
  });

  it("leaves enough other elective tracks to finish without it", () => {
    for (const workspaceType of JOURNEY_WORKSPACE_TYPES) {
      const electives = journeyTracks(program, workspaceType).filter(
        (track) => track.mode === "elective" && track.id !== "inbound",
      );
      assert.ok(
        electives.length >= program.policy.minimumElectiveTracks[workspaceType],
        `${workspaceType} cannot finish without Inbound`,
      );
    }
  });
});

describe("Journey program — invariant E: reward exposure is frozen", () => {
  // The whole point of the v3 release: a new shape, not a new price.
  it("keeps the personal total at exactly the v2 ladder total", () => {
    assert.equal(programTotalCents(program, "personal"), 2000);
  });

  it("keeps the organization total at exactly the v2 ladder total", () => {
    assert.equal(programTotalCents(program, "organization"), 3700);
  });

  it("pays nothing for the capability nodes v3 introduced", () => {
    const introduced = [
      "integrations.calendar",
      "integrations.enrichment",
      "integrations.custom",
      "automation.rotation",
      "automation.sessions",
      "inbound.routing",
      "inbound.desk_phones",
      "inbound.recovery",
    ];
    for (const id of introduced) {
      const node = byId.get(id);
      assert.ok(node, `${id} is missing`);
      assert.equal(node!.rewardCents.personal, 0, id);
      assert.equal(node!.rewardCents.organization, 0, id);
    }
  });

  it("keeps the whole Inbound track at zero cost", () => {
    const inbound = program.nodes.filter((node) => node.track === "inbound");
    assert.ok(inbound.length > 0);
    for (const node of inbound) {
      assert.equal(
        node.rewardCents.personal + node.rewardCents.organization,
        0,
        node.id,
      );
    }
  });

  it("never lets the free entry nodes pay", () => {
    for (const id of ["core.setup", "core.first_call"]) {
      assert.deepEqual(byId.get(id)!.rewardCents, {
        personal: 0,
        organization: 0,
      });
    }
  });
});

describe("Journey program — completion policy", () => {
  it("requires only Core for both workspace types", () => {
    assert.deepEqual(program.policy.requiredTrackIds.personal, ["core"]);
    assert.deepEqual(program.policy.requiredTrackIds.organization, ["core"]);
  });

  it("asks a personal workspace for two elective tracks", () => {
    assert.equal(program.policy.minimumElectiveTracks.personal, 2);
  });

  it("asks an organization for three elective tracks", () => {
    assert.equal(program.policy.minimumElectiveTracks.organization, 3);
  });

  it("marks Core required and everything else elective", () => {
    for (const track of program.tracks) {
      assert.equal(
        track.mode,
        track.id === "core" ? "required" : "elective",
        track.id,
      );
    }
  });

  it("hides the organization-only tracks from a personal workspace", () => {
    const personalTracks = journeyTracks(program, "personal").map((t) => t.id);
    assert.ok(!personalTracks.includes("team"));
    assert.ok(!personalTracks.includes("campaigns"));
  });

  it("hides organization-only nodes from a personal workspace", () => {
    const personal = journeyNodes(program, "personal").map((node) => node.id);
    assert.ok(!personal.includes("team.joined"));
    assert.ok(!personal.includes("campaigns.first"));
    assert.ok(!personal.includes("ai.team_adoption"));
  });
});

describe("Journey program — graph queries", () => {
  it("reports what a node unlocks", () => {
    const unlocks = nodeUnlocks(program, "organization", "core.discipline");
    assert.ok(unlocks.includes("core.scale"));
    assert.ok(unlocks.includes("integrations.crm"));
    assert.ok(unlocks.includes("ai.transcription"));
  });

  it("scopes unlocks to the workspace type", () => {
    const personal = nodeUnlocks(program, "personal", "core.first_call");
    const organization = nodeUnlocks(
      program,
      "organization",
      "core.first_call",
    );
    assert.ok(!personal.includes("team.joined"));
    assert.ok(organization.includes("team.joined"));
  });

  it("rejects a legacy program version with an actionable message", () => {
    for (const version of JOURNEY_LEGACY_PROGRAM_VERSIONS) {
      assert.throws(() => getJourneyProgram(version), /legacy ladder program/);
    }
  });

  it("rejects an unknown program version", () => {
    assert.throws(() => getJourneyProgram("1999.01"), /Unknown Journey/);
  });

  it("resolves the current program version", () => {
    assert.equal(getJourneyProgram("2026.09"), program);
  });
});

describe("Journey program — node shape", () => {
  const nodesOf = (track: string) =>
    program.nodes.filter((node) => node.track === track);

  it("keeps Campaigns organization-only", () => {
    for (const node of nodesOf("campaigns")) {
      assert.deepEqual(node.appliesTo, ["organization"]);
    }
  });

  it("keeps Team organization-only", () => {
    for (const node of nodesOf("team")) {
      assert.deepEqual(node.appliesTo, ["organization"]);
    }
  });

  it("does not tie the Integrations roll-up to CRM specifically", () => {
    const connected = byId.get("integrations.connected")!;
    assert.deepEqual(connected.dependsOn, ["core.discipline"]);
  });

  it("does not tie Automation breadth to agents", () => {
    const breadth = byId.get("automation.breadth")!;
    assert.deepEqual(breadth.dependsOn, ["core.scale"]);
  });

  it("leaves ai.team_adoption out of the AI completion rule", () => {
    const ai = findTrack(program, "ai")!;
    assert.ok(
      !completionRuleNodeIds(ai.completion).includes("ai.team_adoption"),
    );
  });
});
