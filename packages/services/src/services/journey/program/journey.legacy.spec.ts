/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  JOURNEY_LEGACY_SUPERSESSIONS,
  JourneyLegacyAchievementRecord,
  JourneyLegacyClaimRecord,
  legacyProgramVersions,
  projectLegacyCredit,
} from "./journey.legacy";
import { JOURNEY_PROGRAM_2026_09 } from "./journey.program";

const CURRENT = "2026.09";
const program = JOURNEY_PROGRAM_2026_09;
const byId = new Map(program.nodes.map((node) => [node.id, node]));

const achievement = (
  stageId: string,
  achievedAt = new Date("2026-03-01T10:00:00Z"),
): JourneyLegacyAchievementRecord => ({
  programVersion: "2026.08",
  stageId,
  achievedAt,
});

const claim = (
  stageId: string,
  overrides: Partial<JourneyLegacyClaimRecord> = {},
): JourneyLegacyClaimRecord => ({
  programVersion: "2026.08",
  stageId,
  status: "claimed",
  amountCents: 300,
  claimedAt: new Date("2026-03-02T10:00:00Z"),
  ...overrides,
});

describe("legacy supersession map — shape", () => {
  it("only supersedes program versions that are not the current one", () => {
    for (const entry of JOURNEY_LEGACY_SUPERSESSIONS) {
      assert.notEqual(entry.legacyProgramVersion, CURRENT);
    }
  });

  it("maps every legacy stage onto at least one real v3 node", () => {
    for (const entry of JOURNEY_LEGACY_SUPERSESSIONS) {
      assert.ok(entry.achievementNodeIds.length > 0, entry.legacyStageId);
      for (const nodeId of entry.achievementNodeIds) {
        assert.ok(byId.has(nodeId), `${entry.legacyStageId} -> ${nodeId}`);
      }
    }
  });

  it("always names a reward node that is also an achievement node", () => {
    for (const entry of JOURNEY_LEGACY_SUPERSESSIONS) {
      if (!entry.rewardNodeId) continue;
      assert.ok(byId.has(entry.rewardNodeId), entry.rewardNodeId);
      assert.ok(
        entry.achievementNodeIds.includes(entry.rewardNodeId),
        `${entry.legacyStageId}: reward node is not an achievement node`,
      );
    }
  });

  it("never points two legacy stages at the same reward node", () => {
    // Two paid stages inheriting onto one node would let a single v3 node be
    // "already paid" twice, and the amount reported would be whichever won.
    const seen = new Map<string, string>();
    for (const entry of JOURNEY_LEGACY_SUPERSESSIONS) {
      if (!entry.rewardNodeId) continue;
      const key = `${entry.legacyProgramVersion}:${entry.rewardNodeId}`;
      assert.ok(
        !seen.has(key),
        `${entry.rewardNodeId} claimed by both ${seen.get(key)} and ${entry.legacyStageId}`,
      );
      seen.set(key, entry.legacyStageId);
    }
  });

  it("covers every v2 stage id", () => {
    const covered = new Set(
      JOURNEY_LEGACY_SUPERSESSIONS.map((entry) => entry.legacyStageId),
    );
    const v2Stages = [
      "foundation",
      "consistent_caller",
      "connected_operator",
      "ai_closer",
      "agentic_operator",
      "workspace_ready",
      "team_activated",
      "campaign_operator",
      "connected_sales_operation",
      "ai_sales_team",
      "advanced_operation",
    ];
    for (const stage of v2Stages) {
      assert.ok(covered.has(stage), `${stage} is not superseded`);
    }
  });

  it("accounts for every paid fan-out node so none can be paid twice", () => {
    // The safety property behind the asymmetric map: when a paid legacy stage
    // maps to several v3 nodes, every one of them that carries v3 money must
    // end up in exactly one of the two blocking buckets. A node in neither
    // would be paid once under v2 and again under v3 for the same work.
    for (const entry of JOURNEY_LEGACY_SUPERSESSIONS) {
      if (!entry.rewardNodeId) continue;

      const result = projectLegacyCredit(
        [achievement(entry.legacyStageId)],
        [claim(entry.legacyStageId)],
        CURRENT,
      );

      for (const nodeId of entry.achievementNodeIds) {
        const node = byId.get(nodeId)!;
        const pays =
          node.rewardCents.personal + node.rewardCents.organization > 0;
        if (!pays) continue;

        const blocked =
          result.alreadyPaid.has(nodeId) ||
          result.rewardCoveredByLegacy.has(nodeId);
        assert.ok(
          blocked,
          `${entry.legacyStageId} fans out to paid node ${nodeId} without blocking it`,
        );
      }
    }
  });

  it("never puts a node in both blocking buckets", () => {
    for (const entry of JOURNEY_LEGACY_SUPERSESSIONS) {
      if (!entry.rewardNodeId) continue;
      const result = projectLegacyCredit(
        [achievement(entry.legacyStageId)],
        [claim(entry.legacyStageId)],
        CURRENT,
      );
      for (const nodeId of result.alreadyPaid.keys()) {
        assert.ok(!result.rewardCoveredByLegacy.has(nodeId), nodeId);
      }
    }
  });

  it("reports the legacy versions it can read", () => {
    assert.deepEqual(legacyProgramVersions(), ["2026.08"]);
  });
});

describe("projectLegacyCredit — achievements", () => {
  it("maps one legacy achievement onto multiple v3 nodes", () => {
    const result = projectLegacyCredit(
      [achievement("foundation")],
      [],
      CURRENT,
    );

    assert.deepEqual([...result.achievedAt.keys()].sort(), [
      "core.first_call",
      "core.setup",
    ]);
  });

  it("preserves the real achievement timestamp", () => {
    const when = new Date("2026-02-14T08:30:00Z");
    const result = projectLegacyCredit(
      [achievement("foundation", when)],
      [],
      CURRENT,
    );

    assert.equal(
      result.achievedAt.get("core.setup")!.toISOString(),
      when.toISOString(),
    );
    assert.equal(
      result.achievedAt.get("core.first_call")!.toISOString(),
      when.toISOString(),
    );
  });

  it("keeps the earliest timestamp when two stages map to one node", () => {
    const early = new Date("2026-01-05T00:00:00Z");
    const late = new Date("2026-06-05T00:00:00Z");

    const result = projectLegacyCredit(
      [
        // Both map onto core.discipline.
        achievement("connected_operator", late),
        achievement("connected_sales_operation", early),
      ],
      [],
      CURRENT,
    );

    assert.equal(
      result.achievedAt.get("core.discipline")!.toISOString(),
      early.toISOString(),
    );
  });

  it("never synthesises a timestamp", () => {
    const result = projectLegacyCredit([achievement("ai_closer")], [], CURRENT);
    for (const date of result.achievedAt.values()) {
      assert.equal(date.toISOString(), "2026-03-01T10:00:00.000Z");
    }
  });

  it("ignores achievements already stamped with the current program", () => {
    const result = projectLegacyCredit(
      [
        {
          programVersion: CURRENT,
          stageId: "core.setup",
          achievedAt: new Date(),
        },
      ],
      [],
      CURRENT,
    );
    assert.equal(result.achievedAt.size, 0);
  });

  it("ignores an unknown legacy stage rather than throwing", () => {
    const result = projectLegacyCredit(
      [achievement("stage_that_never_existed")],
      [],
      CURRENT,
    );
    assert.equal(result.achievedAt.size, 0);
  });
});

describe("projectLegacyCredit — money", () => {
  it("marks exactly one node as already paid per legacy paid stage", () => {
    const result = projectLegacyCredit(
      [achievement("ai_closer")],
      [claim("ai_closer", { amountCents: 500 })],
      CURRENT,
    );

    // Both nodes are achieved…
    assert.equal(result.achievedAt.size, 2);
    // …but only one carries the payment…
    assert.deepEqual([...result.alreadyPaid.keys()], ["ai.insights"]);
    assert.equal(result.alreadyPaid.get("ai.insights")!.amountCents, 500);
    // …and its paid sibling is covered rather than claimable again.
    assert.deepEqual(
      [...result.rewardCoveredByLegacy.keys()],
      ["ai.transcription"],
    );
  });

  it("covers a paid sibling with the same payment record", () => {
    const result = projectLegacyCredit(
      [achievement("ai_closer")],
      [claim("ai_closer", { amountCents: 500 })],
      CURRENT,
    );

    const covered = result.rewardCoveredByLegacy.get("ai.transcription")!;
    assert.equal(covered.legacyStageId, "ai_closer");
    assert.equal(covered.amountCents, 500);
  });

  it("does not cover siblings when the legacy claim never paid", () => {
    const result = projectLegacyCredit(
      [achievement("ai_closer")],
      [claim("ai_closer", { status: "rejected" })],
      CURRENT,
    );

    assert.equal(result.rewardCoveredByLegacy.size, 0);
    assert.ok(result.achievedAt.has("ai.transcription"));
  });

  it("does not let a v2 paid stage be paid again in v3", () => {
    const result = projectLegacyCredit(
      [achievement("consistent_caller")],
      [claim("consistent_caller", { amountCents: 300 })],
      CURRENT,
    );

    const payment = result.alreadyPaid.get("core.rhythm");
    assert.ok(payment, "core.rhythm must be blocked from a second payout");
    assert.equal(payment!.legacyStageId, "consistent_caller");
    assert.equal(payment!.legacyProgramVersion, "2026.08");
  });

  it("preserves the original settlement date", () => {
    const claimedAt = new Date("2026-04-09T12:00:00Z");
    const result = projectLegacyCredit(
      [achievement("consistent_caller")],
      [claim("consistent_caller", { claimedAt })],
      CURRENT,
    );

    assert.equal(
      result.alreadyPaid.get("core.rhythm")!.claimedAt!.toISOString(),
      claimedAt.toISOString(),
    );
  });

  it("lets an unpaid legacy achievement still unlock v3 progress", () => {
    // Achieved under v2 but never redeemed: the work counts, and the v3 reward
    // is still available because no money ever moved.
    const result = projectLegacyCredit(
      [achievement("consistent_caller")],
      [],
      CURRENT,
    );

    assert.ok(result.achievedAt.has("core.rhythm"));
    assert.equal(result.alreadyPaid.size, 0);
  });

  it("does not block on a pending_review legacy claim", () => {
    const result = projectLegacyCredit(
      [achievement("consistent_caller")],
      [claim("consistent_caller", { status: "pending_review" })],
      CURRENT,
    );
    assert.equal(result.alreadyPaid.size, 0);
  });

  it("does not block on a rejected legacy claim", () => {
    const result = projectLegacyCredit(
      [achievement("consistent_caller")],
      [claim("consistent_caller", { status: "rejected" })],
      CURRENT,
    );
    assert.equal(result.alreadyPaid.size, 0);
  });

  it("does not block on a revoked legacy claim", () => {
    const result = projectLegacyCredit(
      [achievement("consistent_caller")],
      [claim("consistent_caller", { status: "revoked" })],
      CURRENT,
    );
    assert.equal(result.alreadyPaid.size, 0);
  });

  it("never blocks a node for a legacy stage that paid nothing", () => {
    // `foundation` had rewardCents 0 and therefore no rewardNodeId.
    const result = projectLegacyCredit(
      [achievement("foundation")],
      [claim("foundation", { amountCents: 0 })],
      CURRENT,
    );
    assert.equal(result.alreadyPaid.size, 0);
  });

  it("ignores claims stamped with the current program version", () => {
    // A v3 claim must never mark its own node as "already paid under legacy".
    const result = projectLegacyCredit(
      [],
      [claim("core.rhythm", { programVersion: CURRENT })],
      CURRENT,
    );
    assert.equal(result.alreadyPaid.size, 0);
  });

  it("keeps the first payment when a malformed map points two stages at one node", () => {
    const result = projectLegacyCredit(
      [],
      [claim("a", { amountCents: 300 }), claim("b", { amountCents: 999 })],
      CURRENT,
      [
        {
          legacyProgramVersion: "2026.08",
          legacyStageId: "a",
          achievementNodeIds: ["core.rhythm"],
          rewardNodeId: "core.rhythm",
        },
        {
          legacyProgramVersion: "2026.08",
          legacyStageId: "b",
          achievementNodeIds: ["core.rhythm"],
          rewardNodeId: "core.rhythm",
        },
      ],
    );

    assert.equal(result.alreadyPaid.size, 1);
    assert.equal(result.alreadyPaid.get("core.rhythm")!.amountCents, 300);
  });
});

describe("projectLegacyCredit — idempotency", () => {
  it("returns the same result for repeated calls", () => {
    const achievements = [achievement("ai_closer"), achievement("foundation")];
    const claims = [claim("ai_closer", { amountCents: 500 })];

    const first = projectLegacyCredit(achievements, claims, CURRENT);
    const second = projectLegacyCredit(achievements, claims, CURRENT);

    assert.deepEqual(
      [...first.achievedAt.entries()].sort(),
      [...second.achievedAt.entries()].sort(),
    );
    assert.deepEqual(
      [...first.alreadyPaid.keys()].sort(),
      [...second.alreadyPaid.keys()].sort(),
    );
  });

  it("is unaffected by duplicate legacy rows", () => {
    const result = projectLegacyCredit(
      [achievement("consistent_caller"), achievement("consistent_caller")],
      [claim("consistent_caller"), claim("consistent_caller")],
      CURRENT,
    );

    assert.equal(result.achievedAt.size, 1);
    assert.equal(result.alreadyPaid.size, 1);
  });

  it("does not mutate its inputs", () => {
    const achievements = [achievement("foundation")];
    const claims = [claim("consistent_caller")];
    const achievementsCopy = JSON.parse(JSON.stringify(achievements));
    const claimsCopy = JSON.parse(JSON.stringify(claims));

    projectLegacyCredit(achievements, claims, CURRENT);

    assert.deepEqual(
      JSON.parse(JSON.stringify(achievements)),
      achievementsCopy,
    );
    assert.deepEqual(JSON.parse(JSON.stringify(claims)), claimsCopy);
  });
});

describe("projectLegacyCredit — a full v2 organization history", () => {
  // A workspace that finished the whole v2 organization ladder and redeemed
  // every paid stage. Under v3 it must keep all of it and owe nothing new for
  // the same work.
  const stages = [
    "workspace_ready",
    "team_activated",
    "campaign_operator",
    "connected_sales_operation",
    "ai_sales_team",
    "advanced_operation",
  ];
  const amounts: Record<string, number> = {
    team_activated: 300,
    campaign_operator: 500,
    connected_sales_operation: 700,
    ai_sales_team: 1000,
    advanced_operation: 1200,
  };

  const result = projectLegacyCredit(
    stages.map((stage) => achievement(stage)),
    Object.entries(amounts).map(([stage, amountCents]) =>
      claim(stage, { amountCents }),
    ),
    CURRENT,
  );

  it("credits the v3 nodes the ladder covered", () => {
    for (const nodeId of [
      "core.setup",
      "core.first_call",
      "core.discipline",
      "core.scale",
      "team.joined",
      "team.calling",
      "campaigns.first",
      "campaigns.pipeline",
      "integrations.connected",
      "ai.transcription",
      "ai.insights",
      "ai.team_adoption",
      "automation.breadth",
    ]) {
      assert.ok(result.achievedAt.has(nodeId), `${nodeId} was not credited`);
    }
  });

  it("blocks exactly the paid nodes from a second payout", () => {
    assert.deepEqual([...result.alreadyPaid.keys()].sort(), [
      "ai.team_adoption",
      "automation.breadth",
      "campaigns.first",
      "integrations.connected",
      "team.calling",
    ]);
  });

  it("never blocks more nodes than there were paid legacy stages", () => {
    assert.equal(result.alreadyPaid.size, Object.keys(amounts).length);
  });

  it("reports the legacy amounts unchanged", () => {
    assert.equal(result.alreadyPaid.get("team.calling")!.amountCents, 300);
    assert.equal(
      result.alreadyPaid.get("automation.breadth")!.amountCents,
      1200,
    );
  });
});
