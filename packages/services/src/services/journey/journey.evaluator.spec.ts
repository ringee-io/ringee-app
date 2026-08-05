/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateJourney, newlyAchievedStages } from "./journey.evaluator";
import {
  JOURNEY_PROGRAM_2026_08,
  getJourneyProgram,
  journeyLadder,
  ladderTotalCents,
} from "./program/journey.program";
import {
  emptyJourneyMetrics,
  toJourneyMetrics,
  JourneyMetrics,
} from "./program/journey.metrics";
import {
  countUsedCapabilities,
  usedCapabilities,
} from "./program/journey.capabilities";
import { journeyRuleHash } from "./program/journey.hash";

const program = JOURNEY_PROGRAM_2026_08;

/** A metric bag that satisfies every requirement of the given stages, and no more. */
function metricsFor(overrides: Partial<JourneyMetrics>): JourneyMetrics {
  return toJourneyMetrics({ ...emptyJourneyMetrics(), ...overrides });
}

describe("evaluateJourney — sequence", () => {
  it("locks every stage when nothing has happened", () => {
    const result = evaluateJourney(program, "personal", emptyJourneyMetrics());

    assert.equal(result.reachedOrder, 0);
    assert.equal(result.currentStageId, "foundation");
    assert.equal(result.completed, false);
    assert.equal(result.stages[0].status, "in_progress");
    assert.ok(result.stages.slice(1).every((s) => s.status === "locked"));
  });

  it("does NOT unlock a later stage whose own metrics are satisfied", () => {
    // The v1 bug, pinned: AI signals alone used to grant the AI stage and every
    // stage beneath it. Here the workspace has world-class AI numbers but has
    // never made a call, so nothing is reachable.
    const metrics = metricsFor({
      transcriptionsCompleted: 500,
      aiResultsProduced: 50,
      aiMembersCovered: 10,
      mcpCalls: 100,
      activeWeeks: 20,
    });

    const result = evaluateJourney(program, "personal", metrics);

    assert.equal(result.reachedOrder, 0);
    assert.equal(
      result.stages.find((s) => s.id === "ai_closer")?.status,
      "locked",
    );
    assert.equal(
      result.stages.find((s) => s.id === "agentic_operator")?.status,
      "locked",
    );
  });

  it("advances exactly one rung when only that rung is satisfied", () => {
    const result = evaluateJourney(
      program,
      "personal",
      metricsFor({ verifiedPhone: 1, dialableNumbers: 1, connectedCalls: 1 }),
    );

    assert.equal(result.reachedOrder, 1);
    assert.equal(result.currentStageId, "consistent_caller");
    assert.equal(result.stages[0].status, "achieved");
    assert.equal(result.stages[1].status, "in_progress");
    assert.equal(result.stages[2].status, "locked");
  });

  it("walks the whole personal ladder when every requirement is met", () => {
    const metrics = metricsFor({
      verifiedPhone: 1,
      dialableNumbers: 1,
      connectedCalls: 60,
      activeDays: 12,
      activeWeeks: 5,
      uniqueDestinations: 45,
      connectedMinutes: 220,
      meaningfulConversations: 40,
      outcomesLogged: 30,
      integrationSuccesses: 20,
      transcriptionsCompleted: 30,
      aiResultsProduced: 4,
      mcpCalls: 12,
      crmSyncedCalls: 10,
      meetingsSynced: 5,
      customIntegrationDeliveries: 10,
      campaignsWithRealActivity: 2,
      advancedCapabilitiesUsed: 4,
    });

    const result = evaluateJourney(program, "personal", metrics);

    assert.equal(result.reachedOrder, 5);
    assert.equal(result.completed, true);
    assert.equal(result.currentStageId, null);
    assert.equal(result.nextRequirement, null);
  });

  it("keeps a persisted achievement even when the window went quiet", () => {
    // Earned in a busy month, evaluated in a quiet one. The reward must survive.
    const quiet = emptyJourneyMetrics();
    const result = evaluateJourney(
      program,
      "personal",
      quiet,
      new Set(["foundation", "consistent_caller"]),
    );

    assert.equal(result.stages[0].status, "achieved");
    assert.equal(result.stages[1].status, "achieved");
    assert.equal(result.reachedOrder, 2);
    assert.equal(result.currentStageId, "connected_operator");
  });

  it("grandfathering does not hand out new achievements for free", () => {
    const quiet = emptyJourneyMetrics();
    const alreadyAchieved = new Set(["foundation", "consistent_caller"]);
    const result = evaluateJourney(program, "personal", quiet, alreadyAchieved);

    // `connected_operator` is reachable now, but its own requirements are unmet,
    // so it must NOT be persisted as an achievement.
    assert.deepEqual(
      newlyAchievedStages(result, alreadyAchieved).map((s) => s.id),
      [],
    );
  });

  it("reports newly achieved stages in ladder order", () => {
    const metrics = metricsFor({
      verifiedPhone: 1,
      dialableNumbers: 1,
      connectedCalls: 20,
      activeDays: 5,
      uniqueDestinations: 12,
      connectedMinutes: 30,
    });
    const result = evaluateJourney(program, "personal", metrics);

    assert.deepEqual(
      newlyAchievedStages(result, new Set()).map((s) => s.id),
      ["foundation", "consistent_caller"],
    );
  });
});

describe("evaluateJourney — organization ladder", () => {
  it("does not count invited-but-unaccepted members", () => {
    // acceptedMembers is the metric; an invitation contributes nothing.
    const metrics = metricsFor({
      verifiedPhone: 1,
      dialableNumbers: 1,
      connectedCalls: 30,
      activeDays: 6,
      acceptedMembers: 1,
      activeMembers: 1,
    });

    const result = evaluateJourney(program, "organization", metrics);
    assert.equal(result.reachedOrder, 1);
    assert.equal(result.currentStageId, "team_activated");
  });

  it("requires two members who actually called, not just two seats", () => {
    const seatsOnly = metricsFor({
      verifiedPhone: 1,
      dialableNumbers: 1,
      connectedCalls: 30,
      activeDays: 6,
      acceptedMembers: 4,
      activeMembers: 1,
    });
    assert.equal(
      evaluateJourney(program, "organization", seatsOnly).currentStageId,
      "team_activated",
    );

    const reallyCalling = metricsFor({
      ...seatsOnly,
      activeMembers: 2,
    });
    assert.equal(
      evaluateJourney(program, "organization", reallyCalling).reachedOrder,
      2,
    );
  });

  it("does not grant the campaign stage for a single-destination burst", () => {
    const burst = metricsFor({
      verifiedPhone: 1,
      dialableNumbers: 1,
      connectedCalls: 40,
      activeDays: 6,
      acceptedMembers: 2,
      activeMembers: 2,
      campaignConnectedCalls: 40,
      // One destination, one day — the shape of a farm, not a campaign.
      campaignUniqueDestinations: 1,
      campaignActiveDays: 1,
      workedLeads: 1,
      outcomesLogged: 40,
    });

    const result = evaluateJourney(program, "organization", burst);
    assert.equal(result.currentStageId, "campaign_operator");
    assert.equal(result.reachedOrder, 2);
  });
});

describe("progress reporting", () => {
  it("caps requirement progress at 100 percent", () => {
    const result = evaluateJourney(
      program,
      "personal",
      metricsFor({ verifiedPhone: 1, dialableNumbers: 9, connectedCalls: 999 }),
    );
    const stage = result.stages[0];
    assert.ok(stage.requirements.every((r) => r.progressPct <= 100));
    assert.equal(stage.progressPct, 100);
  });

  it("suggests the unmet requirement closest to done", () => {
    const result = evaluateJourney(
      program,
      "personal",
      metricsFor({
        verifiedPhone: 1,
        dialableNumbers: 1,
        connectedCalls: 14, // 14/15 — nearly there
        activeDays: 1, //  1/4
        uniqueDestinations: 1, //  1/10
        connectedMinutes: 1, //  1/20
      }),
    );

    assert.equal(result.currentStageId, "consistent_caller");
    assert.equal(result.nextRequirement?.id, "connected_calls");
  });
});

describe("program definition", () => {
  it("has strictly increasing, gapless stage orders on both ladders", () => {
    for (const type of ["personal", "organization"] as const) {
      const ladder = journeyLadder(program, type);
      ladder.forEach((stage, index) => {
        assert.equal(stage.order, index + 1, `${type}/${stage.id} order`);
      });
    }
  });

  it("never pays for the first rung", () => {
    for (const type of ["personal", "organization"] as const) {
      assert.equal(journeyLadder(program, type)[0].rewardCents, 0);
    }
  });

  it("keeps every ladder total inside the per-workspace cap default", () => {
    // The configured default cap is 4000 cents; a legitimate full run must fit.
    assert.ok(ladderTotalCents(program, "personal") <= 4000);
    assert.ok(ladderTotalCents(program, "organization") <= 4000);
  });

  it("uses integer cents only — no floating point money", () => {
    for (const type of ["personal", "organization"] as const) {
      for (const stage of journeyLadder(program, type)) {
        assert.ok(Number.isInteger(stage.rewardCents), stage.id);
      }
    }
  });

  it("has unique requirement ids within each stage", () => {
    for (const type of ["personal", "organization"] as const) {
      for (const stage of journeyLadder(program, type)) {
        const ids = stage.requirements.map((r) => r.id);
        assert.equal(new Set(ids).size, ids.length, `${type}/${stage.id}`);
      }
    }
  });

  it("rejects an unknown program version instead of silently falling back", () => {
    assert.throws(
      () => getJourneyProgram("1999.01"),
      /Unknown Journey program/,
    );
  });
});

describe("rule hash", () => {
  it("is stable across calls", () => {
    assert.equal(
      journeyRuleHash(program, "personal"),
      journeyRuleHash(program, "personal"),
    );
  });

  it("differs between ladders", () => {
    assert.notEqual(
      journeyRuleHash(program, "personal"),
      journeyRuleHash(program, "organization"),
    );
  });

  it("changes when a threshold changes", () => {
    const tweaked = {
      ...program,
      ladders: {
        ...program.ladders,
        personal: program.ladders.personal.map((stage, index) =>
          index === 1
            ? {
                ...stage,
                requirements: stage.requirements.map((r) => ({
                  ...r,
                  target: r.target + 1,
                })),
              }
            : stage,
        ),
      },
    };

    assert.notEqual(
      journeyRuleHash(program, "personal"),
      journeyRuleHash(tweaked, "personal"),
    );
  });
});

describe("advanced capabilities", () => {
  it("does not count a capability that was merely configured", () => {
    // One CRM sync and one transcript: connected, but nowhere near "used".
    const metrics = metricsFor({
      crmSyncedCalls: 1,
      transcriptionsCompleted: 1,
      aiResultsProduced: 1,
      rotationCallerIdsUsed: 1,
    });
    assert.deepEqual(usedCapabilities(metrics), []);
  });

  it("counts rotation only once two caller IDs were really used", () => {
    assert.deepEqual(
      usedCapabilities(metricsFor({ rotationCallerIdsUsed: 1 })),
      [],
    );
    assert.deepEqual(
      usedCapabilities(metricsFor({ rotationCallerIdsUsed: 2 })),
      ["caller_id_rotation"],
    );
  });

  it("requires transcripts behind an AI result", () => {
    assert.deepEqual(
      usedCapabilities(
        metricsFor({ aiResultsProduced: 5, transcriptionsCompleted: 2 }),
      ),
      [],
    );
    assert.deepEqual(
      usedCapabilities(
        metricsFor({ aiResultsProduced: 1, transcriptionsCompleted: 5 }),
      ),
      ["ai"],
    );
  });

  it("lets a workspace reach breadth without SIP", () => {
    // A digital call centre: campaigns, CRM and AI. No desk phone anywhere.
    const metrics = metricsFor({
      campaignsWithRealActivity: 1,
      crmSyncedCalls: 10,
      aiResultsProduced: 2,
      transcriptionsCompleted: 20,
    });
    assert.equal(countUsedCapabilities(metrics), 3);
    assert.ok(!usedCapabilities(metrics).includes("sip"));
  });
});

describe("metric bag hygiene", () => {
  it("clamps NaN and negatives to zero rather than propagating them", () => {
    const metrics = toJourneyMetrics({
      connectedCalls: Number.NaN,
      activeDays: -5,
      connectedMinutes: 12.9,
    });
    assert.equal(metrics.connectedCalls, 0);
    assert.equal(metrics.activeDays, 0);
    assert.equal(metrics.connectedMinutes, 12);
  });

  it("fills every declared key so a comparison can never read undefined", () => {
    const metrics = toJourneyMetrics({});
    for (const value of Object.values(metrics)) {
      assert.equal(typeof value, "number");
    }
  });
});
