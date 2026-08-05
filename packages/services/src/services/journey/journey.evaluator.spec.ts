/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateJourney,
  newlyAchievedNodes,
  newlyCompletedTracks,
  JourneyEvaluation,
} from "./journey.evaluator";
import { JOURNEY_PROGRAM_2026_09 } from "./program/journey.program";
import {
  emptyJourneyMetrics,
  toJourneyMetrics,
  JourneyMetrics,
} from "./program/journey.metrics";
import { countUsedCapabilities } from "./program/journey.capabilities";
import { journeyRuleHash } from "./program/journey.hash";

const program = JOURNEY_PROGRAM_2026_09;

function metricsFor(overrides: Partial<JourneyMetrics>): JourneyMetrics {
  const base = toJourneyMetrics({ ...emptyJourneyMetrics(), ...overrides });
  // Mirrors what JourneyService does before evaluating: the derived key is not
  // measured, it is computed from the others.
  base.advancedCapabilitiesUsed = countUsedCapabilities(base);
  return base;
}

const node = (result: JourneyEvaluation, id: string) => {
  const found = result.nodes.find((n) => n.id === id);
  assert.ok(found, `node ${id} not in evaluation`);
  return found!;
};

const track = (result: JourneyEvaluation, id: string) => {
  const found = result.tracks.find((t) => t.id === id);
  assert.ok(found, `track ${id} not in evaluation`);
  return found!;
};

/** Metrics that satisfy the whole Core track. */
const CORE_DONE: Partial<JourneyMetrics> = {
  verifiedPhone: 1,
  dialableNumbers: 1,
  connectedCalls: 60,
  activeDays: 4,
  activeWeeks: 3,
  uniqueDestinations: 10,
  connectedMinutes: 20,
  outcomesLogged: 10,
  meaningfulConversations: 25,
};

describe("evaluateJourney — node states", () => {
  it("starts with the root available and everything else locked", () => {
    const result = evaluateJourney(program, "personal", emptyJourneyMetrics());

    assert.equal(node(result, "core.setup").status, "available");
    assert.equal(node(result, "core.first_call").status, "locked");
    assert.equal(node(result, "ai.insights").status, "locked");
    assert.equal(result.completion.complete, false);
  });

  it("marks a node in_progress once any requirement has moved", () => {
    const result = evaluateJourney(
      program,
      "personal",
      metricsFor({ verifiedPhone: 1 }),
    );
    assert.equal(node(result, "core.setup").status, "in_progress");
  });

  it("distinguishes available from in_progress", () => {
    const result = evaluateJourney(
      program,
      "personal",
      metricsFor({ verifiedPhone: 1, dialableNumbers: 1 }),
    );
    // Unlocked but untouched.
    assert.equal(node(result, "core.first_call").status, "available");
  });

  it("does NOT unlock a node whose own metrics are satisfied but whose dependencies are not", () => {
    // The v1 bug, pinned: AI signals alone used to grant the AI stage and every
    // stage beneath it. Here the workspace has world-class AI numbers but has
    // never made a call, so nothing downstream is reachable.
    const result = evaluateJourney(
      program,
      "personal",
      metricsFor({
        transcriptionsCompleted: 500,
        aiResultsProduced: 50,
        mcpCalls: 100,
        mcpSessions: 10,
      }),
    );

    assert.equal(node(result, "ai.transcription").status, "locked");
    assert.equal(node(result, "ai.insights").status, "locked");
    assert.equal(node(result, "automation.agents").status, "locked");
    assert.equal(track(result, "ai").complete, false);
  });

  it("names the actual blocking dependency rather than a generic predecessor", () => {
    const result = evaluateJourney(
      program,
      "personal",
      metricsFor({ verifiedPhone: 1, dialableNumbers: 1, connectedCalls: 1 }),
    );

    const discipline = node(result, "core.discipline");
    assert.equal(discipline.status, "locked");
    assert.deepEqual(discipline.blockedBy, ["core.rhythm"]);
  });

  it("reports multiple blockers when a node has several dependencies", () => {
    const result = evaluateJourney(
      program,
      "organization",
      emptyJourneyMetrics(),
    );
    const campaigns = node(result, "campaigns.first");
    assert.deepEqual(campaigns.blockedBy.sort(), [
      "core.rhythm",
      "team.calling",
    ]);
  });

  it("unlocks a node only when every dependency is achieved", () => {
    // Core rhythm done, team not: campaigns.first stays locked on one blocker.
    const result = evaluateJourney(
      program,
      "organization",
      metricsFor({
        verifiedPhone: 1,
        dialableNumbers: 1,
        connectedCalls: 15,
        activeDays: 4,
        uniqueDestinations: 10,
        connectedMinutes: 20,
      }),
    );
    assert.equal(node(result, "core.rhythm").status, "achieved");
    assert.deepEqual(node(result, "campaigns.first").blockedBy, [
      "team.calling",
    ]);
  });

  it("keeps a persisted achievement achieved when the window no longer satisfies it", () => {
    // A quiet month must not undo earned progress, and must not re-lock the
    // nodes it unlocked.
    const result = evaluateJourney(
      program,
      "personal",
      emptyJourneyMetrics(),
      new Set(["core.setup", "core.first_call"]),
    );

    assert.equal(node(result, "core.setup").status, "achieved");
    assert.equal(node(result, "core.first_call").status, "achieved");
    assert.equal(node(result, "core.rhythm").status, "available");
  });

  it("exposes dependsOn and unlocks for the drawer", () => {
    const result = evaluateJourney(program, "personal", emptyJourneyMetrics());
    const discipline = node(result, "core.discipline");

    assert.deepEqual(discipline.dependsOn, ["core.rhythm"]);
    assert.ok(discipline.unlocks.includes("core.scale"));
    assert.ok(discipline.unlocks.includes("ai.transcription"));
    assert.ok(discipline.unlocks.includes("integrations.crm"));
  });

  it("hides organization-only nodes from a personal workspace", () => {
    const result = evaluateJourney(program, "personal", emptyJourneyMetrics());
    const ids = result.nodes.map((n) => n.id);
    assert.ok(!ids.some((id) => id.startsWith("team.")));
    assert.ok(!ids.some((id) => id.startsWith("campaigns.")));
    assert.ok(!ids.includes("ai.team_adoption"));
  });

  it("never lists a non-visible node as a dependency or unlock", () => {
    const result = evaluateJourney(program, "personal", emptyJourneyMetrics());
    const visible = new Set(result.nodes.map((n) => n.id));
    for (const n of result.nodes) {
      for (const id of [...n.dependsOn, ...n.unlocks, ...n.blockedBy]) {
        assert.ok(visible.has(id), `${n.id} references hidden ${id}`);
      }
    }
  });
});

describe("evaluateJourney — track completion", () => {
  it("completes Core at its capstone", () => {
    const result = evaluateJourney(program, "personal", metricsFor(CORE_DONE));
    assert.equal(node(result, "core.scale").status, "achieved");
    assert.equal(track(result, "core").complete, true);
  });

  it("does not complete Core before the capstone", () => {
    const result = evaluateJourney(
      program,
      "personal",
      metricsFor({ ...CORE_DONE, connectedCalls: 20, activeWeeks: 1 }),
    );
    assert.equal(track(result, "core").complete, false);
  });

  it("completes Integrations with the roll-up plus any two capabilities — no CRM", () => {
    // Calendar + custom, zero CRM syncs. This is the case v2 could not express.
    const result = evaluateJourney(
      program,
      "personal",
      metricsFor({
        ...CORE_DONE,
        crmSyncedCalls: 0,
        meetingsSynced: 2,
        customIntegrationDeliveries: 5,
        enrichmentImports: 10,
        integrationSuccesses: 15,
      }),
    );

    // CRM was never used at all, so it stays untouched — and irrelevant.
    assert.equal(node(result, "integrations.crm").status, "available");
    assert.equal(node(result, "integrations.calendar").status, "achieved");
    assert.equal(node(result, "integrations.custom").status, "achieved");
    assert.equal(node(result, "integrations.connected").status, "achieved");
    assert.equal(track(result, "integrations").complete, true);
  });

  it("does not complete Integrations on the roll-up alone", () => {
    const result = evaluateJourney(
      program,
      "personal",
      metricsFor({ ...CORE_DONE, integrationSuccesses: 15 }),
    );
    assert.equal(node(result, "integrations.connected").status, "achieved");
    assert.equal(track(result, "integrations").complete, false);
  });

  it("completes AI at ai.insights without team adoption", () => {
    const result = evaluateJourney(
      program,
      "organization",
      metricsFor({
        ...CORE_DONE,
        transcriptionsCompleted: 10,
        aiResultsProduced: 1,
      }),
    );

    assert.equal(track(result, "ai").complete, true);
    assert.equal(node(result, "ai.team_adoption").status, "in_progress");
    assert.equal(node(result, "ai.team_adoption").optional, true);
  });

  it("completes Automation via breadth without ever touching agents", () => {
    const result = evaluateJourney(
      program,
      "personal",
      metricsFor({
        ...CORE_DONE,
        // Three capabilities of the workspace's own choosing: calendar,
        // enrichment and call sessions. No MCP anywhere.
        meetingsSynced: 2,
        enrichmentImports: 10,
        callSessionCalls: 5,
      }),
    );

    assert.equal(node(result, "automation.agents").status, "available");
    assert.equal(node(result, "automation.breadth").status, "achieved");
    assert.equal(track(result, "automation").complete, true);
  });

  it("completes Inbound with routing plus either branch", () => {
    const withDeskPhones = evaluateJourney(
      program,
      "personal",
      metricsFor({
        ...CORE_DONE,
        inboundCallsAnswered: 1,
        inboundSipDeviceCalls: 5,
      }),
    );
    assert.equal(track(withDeskPhones, "inbound").complete, true);

    const withRecovery = evaluateJourney(
      program,
      "personal",
      metricsFor({
        ...CORE_DONE,
        inboundCallsAnswered: 1,
        inboundMissedFollowedUp: 5,
      }),
    );
    assert.equal(track(withRecovery, "inbound").complete, true);
  });

  it("does not complete Inbound on routing alone", () => {
    const result = evaluateJourney(
      program,
      "personal",
      metricsFor({ ...CORE_DONE, inboundCallsAnswered: 3 }),
    );
    assert.equal(node(result, "inbound.routing").status, "achieved");
    assert.equal(track(result, "inbound").complete, false);
  });

  it("reports track progress against the rule, not the raw node count", () => {
    const result = evaluateJourney(
      program,
      "personal",
      metricsFor({
        ...CORE_DONE,
        integrationSuccesses: 15,
        meetingsSynced: 2,
      }),
    );
    const integrations = track(result, "integrations");
    // Rule needs 1 allOf + 2 anyOf = 3; we have connected + calendar = 2.
    assert.equal(integrations.needed, 3);
    assert.equal(integrations.satisfied, 2);
  });
});

describe("evaluateJourney — Journey completion policy", () => {
  it("does not complete on Core alone", () => {
    const result = evaluateJourney(program, "personal", metricsFor(CORE_DONE));
    assert.equal(track(result, "core").complete, true);
    assert.equal(result.completion.complete, false);
    assert.equal(result.completion.electiveComplete, 0);
    assert.equal(result.completion.electiveRequired, 2);
  });

  it("completes a personal Journey with Core plus any two elective tracks", () => {
    const result = evaluateJourney(
      program,
      "personal",
      metricsFor({
        ...CORE_DONE,
        // Elective 1: AI.
        transcriptionsCompleted: 10,
        aiResultsProduced: 1,
        // Elective 2: Inbound — the optional branch, used as a real path.
        inboundCallsAnswered: 1,
        inboundMissedFollowedUp: 5,
      }),
    );

    assert.equal(result.completion.electiveComplete, 2);
    assert.equal(result.completion.complete, true);
  });

  it("completes the same personal Journey by a completely different path", () => {
    const result = evaluateJourney(
      program,
      "personal",
      metricsFor({
        ...CORE_DONE,
        // Elective 1: Integrations (calendar + enrichment, no CRM).
        meetingsSynced: 2,
        enrichmentImports: 10,
        integrationSuccesses: 15,
        // Elective 2: Automation, via three capabilities.
        callSessionCalls: 5,
      }),
    );

    assert.equal(track(result, "integrations").complete, true);
    assert.equal(track(result, "automation").complete, true);
    assert.equal(track(result, "ai").complete, false);
    assert.equal(track(result, "inbound").complete, false);
    assert.equal(result.completion.complete, true);
  });

  it("requires three elective tracks for an organization", () => {
    const twoTracks = metricsFor({
      ...CORE_DONE,
      transcriptionsCompleted: 10,
      aiResultsProduced: 1,
      inboundCallsAnswered: 1,
      inboundMissedFollowedUp: 5,
    });

    const result = evaluateJourney(program, "organization", twoTracks);
    assert.equal(result.completion.electiveComplete, 2);
    assert.equal(result.completion.electiveRequired, 3);
    assert.equal(result.completion.complete, false);
  });

  it("completes an organization Journey with Core plus three elective tracks", () => {
    const result = evaluateJourney(
      program,
      "organization",
      metricsFor({
        ...CORE_DONE,
        transcriptionsCompleted: 10,
        aiResultsProduced: 1,
        inboundCallsAnswered: 1,
        inboundMissedFollowedUp: 5,
        meetingsSynced: 2,
        enrichmentImports: 10,
        integrationSuccesses: 15,
      }),
    );

    assert.ok(result.completion.electiveComplete >= 3);
    assert.equal(result.completion.complete, true);
    // Team and Campaigns were never touched, and that is a valid finish.
    assert.equal(track(result, "team").complete, false);
    assert.equal(track(result, "campaigns").complete, false);
  });

  it("never counts a hidden track against a personal workspace", () => {
    const result = evaluateJourney(program, "personal", metricsFor(CORE_DONE));
    // 5 elective tracks visible to a freelancer: integrations, ai, automation,
    // inbound — team and campaigns are absent entirely.
    assert.equal(result.completion.electiveAvailable, 4);
    assert.ok(!result.tracks.some((t) => t.id === "team"));
  });

  it("counts Core as the only required track", () => {
    for (const workspaceType of ["personal", "organization"] as const) {
      const result = evaluateJourney(
        program,
        workspaceType,
        emptyJourneyMetrics(),
      );
      assert.equal(result.completion.requiredTotal, 1);
    }
  });
});

describe("evaluateJourney — recommendation", () => {
  it("recommends Core while Core is unfinished", () => {
    const result = evaluateJourney(
      program,
      "personal",
      metricsFor({
        verifiedPhone: 1,
        dialableNumbers: 1,
        connectedCalls: 1,
        // Plenty of elective signal, which must not win.
        transcriptionsCompleted: 500,
        meetingsSynced: 20,
      }),
    );

    assert.equal(node(result, "core.rhythm").track, "core");
    assert.equal(result.recommendedNodeId, "core.rhythm");
  });

  it("recommends a node, not a locked one", () => {
    const result = evaluateJourney(program, "personal", emptyJourneyMetrics());
    const recommended = node(result, result.recommendedNodeId!);
    assert.notEqual(recommended.status, "locked");
    assert.notEqual(recommended.status, "achieved");
  });

  it("returns the most-advanced unmet requirement of the recommended node", () => {
    const result = evaluateJourney(
      program,
      "personal",
      metricsFor({
        verifiedPhone: 1,
        dialableNumbers: 1,
        connectedCalls: 14,
        activeDays: 1,
        uniqueDestinations: 1,
        connectedMinutes: 1,
      }),
    );

    assert.equal(result.recommendedNodeId, "core.rhythm");
    // 14/15 is the closest to done.
    assert.equal(result.recommendedRequirement?.id, "connected_calls");
  });

  it("prefers an in-progress node over an untouched one once Core is done", () => {
    const result = evaluateJourney(
      program,
      "personal",
      metricsFor({
        ...CORE_DONE,
        transcriptionsCompleted: 8, // ai.transcription is 8/10.
      }),
    );

    assert.equal(result.recommendedNodeId, "ai.transcription");
  });

  it("does not recommend a zero-reward bonus node while a completion path is open", () => {
    const result = evaluateJourney(
      program,
      "personal",
      metricsFor({
        ...CORE_DONE,
        // Bonus nodes with the most raw progress.
        rotationCallerIdsUsed: 1,
        callSessionCalls: 4,
      }),
    );

    const recommended = node(result, result.recommendedNodeId!);
    assert.ok(
      !(recommended.optional && recommended.rewardCents === 0),
      `recommended a zero-reward bonus node: ${recommended.id}`,
    );
  });

  it("returns null when there is nothing actionable left", () => {
    const everything = metricsFor({
      ...CORE_DONE,
      connectedCalls: 500,
      activeDays: 30,
      activeWeeks: 12,
      activeMembers: 5,
      acceptedMembers: 5,
      uniqueDestinations: 200,
      connectedMinutes: 600,
      meaningfulConversations: 300,
      outcomesLogged: 200,
      campaignConnectedCalls: 200,
      campaignUniqueDestinations: 100,
      campaignActiveDays: 20,
      campaignsWithRealActivity: 5,
      workedLeads: 100,
      callbacksWorked: 50,
      meetingsSynced: 50,
      crmSyncedCalls: 100,
      customIntegrationDeliveries: 100,
      enrichmentImports: 100,
      integrationSuccesses: 250,
      transcriptionsCompleted: 200,
      aiResultsProduced: 50,
      aiMembersCovered: 10,
      mcpSessions: 10,
      mcpCalls: 50,
      rotationCallerIdsUsed: 10,
      sipDeviceCalls: 50,
      callSessionCalls: 50,
      inboundCallsAnswered: 50,
      inboundSipDeviceCalls: 20,
      inboundMissedFollowedUp: 20,
    });

    const result = evaluateJourney(program, "organization", everything);
    assert.equal(result.completion.complete, true);
    assert.equal(result.recommendedNodeId, null);
    assert.equal(result.recommendedRequirement, null);
  });
});

describe("newlyAchievedNodes", () => {
  it("returns only nodes satisfied by the current metrics", () => {
    const result = evaluateJourney(
      program,
      "personal",
      metricsFor({ verifiedPhone: 1, dialableNumbers: 1, connectedCalls: 1 }),
      new Set(),
    );

    const pending = newlyAchievedNodes(result, new Set());
    assert.deepEqual(
      pending.map((n) => n.id),
      ["core.setup", "core.first_call"],
    );
  });

  it("does not re-record an already persisted node", () => {
    const result = evaluateJourney(
      program,
      "personal",
      metricsFor({ verifiedPhone: 1, dialableNumbers: 1, connectedCalls: 1 }),
      new Set(["core.setup"]),
    );

    const pending = newlyAchievedNodes(result, new Set(["core.setup"]));
    assert.deepEqual(
      pending.map((n) => n.id),
      ["core.first_call"],
    );
  });

  it("does not record a node that is only achieved by grandfathering", () => {
    // `core.first_call` is persisted but its metrics are gone. It must not earn
    // a second row, and the node it unlocked must still earn its own.
    const result = evaluateJourney(
      program,
      "personal",
      emptyJourneyMetrics(),
      new Set(["core.setup", "core.first_call"]),
    );

    assert.deepEqual(
      newlyAchievedNodes(result, new Set(["core.setup", "core.first_call"])),
      [],
    );
  });

  it("returns nodes in dependency order", () => {
    const result = evaluateJourney(
      program,
      "personal",
      metricsFor(CORE_DONE),
      new Set(),
    );
    const ids = newlyAchievedNodes(result, new Set()).map((n) => n.id);
    assert.ok(ids.indexOf("core.setup") < ids.indexOf("core.rhythm"));
    assert.ok(ids.indexOf("core.rhythm") < ids.indexOf("core.scale"));
  });
});

describe("newlyCompletedTracks", () => {
  it("returns tracks that just completed", () => {
    const result = evaluateJourney(program, "personal", metricsFor(CORE_DONE));
    const fresh = newlyCompletedTracks(result, new Set());
    assert.deepEqual(
      fresh.map((t) => t.id),
      ["core"],
    );
  });

  it("does not re-announce a track already recorded as complete", () => {
    const result = evaluateJourney(program, "personal", metricsFor(CORE_DONE));
    assert.deepEqual(newlyCompletedTracks(result, new Set(["core"])), []);
  });
});

describe("journeyRuleHash", () => {
  it("is stable for the same program and workspace type", () => {
    assert.equal(
      journeyRuleHash(program, "personal"),
      journeyRuleHash(program, "personal"),
    );
  });

  it("differs between workspace types", () => {
    assert.notEqual(
      journeyRuleHash(program, "personal"),
      journeyRuleHash(program, "organization"),
    );
  });

  it("changes when a completion rule changes", () => {
    const loosened = {
      ...program,
      tracks: program.tracks.map((track) =>
        track.id === "integrations"
          ? {
              ...track,
              completion: {
                type: "combined" as const,
                allOf: ["integrations.connected"],
                anyOf: [
                  "integrations.crm",
                  "integrations.calendar",
                  "integrations.enrichment",
                  "integrations.custom",
                ],
                minimumAnyOf: 1,
              },
            }
          : track,
      ),
    };

    assert.notEqual(
      journeyRuleHash(program, "personal"),
      journeyRuleHash(loosened, "personal"),
    );
  });

  it("changes when the completion policy changes", () => {
    const easier = {
      ...program,
      policy: {
        ...program.policy,
        minimumElectiveTracks: { personal: 1, organization: 3 },
      },
    };

    assert.notEqual(
      journeyRuleHash(program, "personal"),
      journeyRuleHash(easier, "personal"),
    );
  });

  it("changes when a dependency is removed", () => {
    const detached = {
      ...program,
      nodes: program.nodes.map((n) =>
        n.id === "ai.insights" ? { ...n, dependsOn: [] } : n,
      ),
    };

    assert.notEqual(
      journeyRuleHash(program, "personal"),
      journeyRuleHash(detached, "personal"),
    );
  });
});
