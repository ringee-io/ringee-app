/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { apiConfiguration } from "@ringee/configuration";
import { JourneyService } from "./journey.service";
import { JourneyRawMetrics } from "@ringee/database";

/**
 * Integration-shaped tests for the claim state machine.
 *
 * The service is exercised end to end against in-memory doubles of its
 * collaborators, so the properties the API contract depends on are asserted
 * against the real orchestration code: authorisation by achievement, dependency
 * satisfaction, idempotency, budget, risk banding, batch rate limiting, legacy
 * payment blocking, and what the client is allowed to be told.
 *
 * Flags are mutated per test and restored afterwards, because the flag posture
 * IS part of the behaviour under test.
 */

const ORG = { userId: "user-1", organizationId: "org-1" };

const FLAG_KEYS = [
  "JOURNEY_V2_ENABLED",
  "JOURNEY_REWARDS_ENABLED",
  "JOURNEY_AUTO_APPROVE_ENABLED",
  "JOURNEY_RISK_REVIEW_ENABLED",
  "JOURNEY_DRY_RUN",
  "JOURNEY_ROLLOUT_PERCENT",
  "JOURNEY_HOLDOUT_PERCENT",
  "JOURNEY_OVERVIEW_CACHE_SECONDS",
  "JOURNEY_PROGRAM_VERSION",
] as const;

type Flags = Partial<Record<(typeof FLAG_KEYS)[number], unknown>>;

function withFlags(flags: Flags) {
  const saved: Record<string, unknown> = {};
  for (const key of FLAG_KEYS) {
    saved[key] = (apiConfiguration as Record<string, unknown>)[key];
  }
  Object.assign(apiConfiguration as Record<string, unknown>, {
    JOURNEY_V2_ENABLED: true,
    JOURNEY_REWARDS_ENABLED: true,
    JOURNEY_AUTO_APPROVE_ENABLED: true,
    JOURNEY_RISK_REVIEW_ENABLED: false,
    JOURNEY_DRY_RUN: false,
    JOURNEY_ROLLOUT_PERCENT: 100,
    JOURNEY_HOLDOUT_PERCENT: 0,
    JOURNEY_OVERVIEW_CACHE_SECONDS: 0,
    JOURNEY_PROGRAM_VERSION: "2026.09",
    ...flags,
  });
  return () =>
    Object.assign(apiConfiguration as Record<string, unknown>, saved);
}

/** A metric bag that clears Core plus the first Team nodes. */
function metrics(
  overrides: Partial<JourneyRawMetrics> = {},
): JourneyRawMetrics {
  return {
    verifiedPhone: 1,
    dialableNumbers: 2,
    attemptedCalls: 120,
    connectedCalls: 80,
    meaningfulConversations: 30,
    connectedMinutes: 200,
    billableMinutes: 180,
    uniqueDestinations: 40,
    activeDays: 8,
    activeWeeks: 4,
    activeMembers: 2,
    acceptedMembers: 3,
    callSources: 2,
    outcomesLogged: 25,
    campaignConnectedCalls: 0,
    campaignUniqueDestinations: 0,
    campaignActiveDays: 0,
    campaignsWithRealActivity: 0,
    workedLeads: 0,
    callbacksWorked: 0,
    meetingsSynced: 0,
    inboundCallsAnswered: 0,
    inboundSipDeviceCalls: 0,
    inboundMissedFollowedUp: 0,
    crmSyncedCalls: 0,
    customIntegrationDeliveries: 0,
    enrichmentImports: 0,
    integrationSuccesses: 0,
    transcriptionsCompleted: 0,
    aiResultsProduced: 0,
    aiMembersCovered: 0,
    mcpSessions: 0,
    mcpCalls: 0,
    rotationCallerIdsUsed: 0,
    sipDeviceCalls: 0,
    sdkCalls: 0,
    extensionCalls: 0,
    callSessionCalls: 0,
    ...overrides,
  };
}

/** Everything an organization can do — used for the "many claimable nodes" case. */
function everythingMetrics(): JourneyRawMetrics {
  return metrics({
    connectedCalls: 400,
    activeDays: 40,
    activeWeeks: 12,
    activeMembers: 6,
    acceptedMembers: 6,
    uniqueDestinations: 250,
    connectedMinutes: 900,
    meaningfulConversations: 300,
    outcomesLogged: 260,
    campaignConnectedCalls: 200,
    campaignUniqueDestinations: 120,
    campaignActiveDays: 20,
    campaignsWithRealActivity: 4,
    workedLeads: 120,
    callbacksWorked: 40,
    meetingsSynced: 30,
    inboundCallsAnswered: 30,
    inboundSipDeviceCalls: 20,
    inboundMissedFollowedUp: 20,
    crmSyncedCalls: 90,
    customIntegrationDeliveries: 90,
    enrichmentImports: 60,
    integrationSuccesses: 220,
    transcriptionsCompleted: 150,
    aiResultsProduced: 20,
    aiMembersCovered: 6,
    mcpSessions: 8,
    mcpCalls: 40,
    rotationCallerIdsUsed: 6,
    sipDeviceCalls: 40,
    sdkCalls: 20,
    extensionCalls: 20,
    callSessionCalls: 30,
  });
}

interface LegacyRow {
  programVersion: string;
  stageId: string;
  achievedAt: Date;
}

interface LegacyClaimRow {
  programVersion: string;
  stageId: string;
  status: string;
  amountCents: number;
  claimedAt: Date | null;
}

interface HarnessOptions {
  raw?: JourneyRawMetrics;
  legacyAchievements?: LegacyRow[];
  legacyClaims?: LegacyClaimRow[];
}

function makeHarness(options: HarnessOptions = {}) {
  const raw = options.raw ?? metrics();
  const achievements = new Set<string>();
  const claims = new Map<string, Record<string, unknown>>();
  const events: Array<{ name: string; props: Record<string, unknown> }> = [];
  let wallet = 10;

  const state = {
    lockedProbes: 0,
    budgetAllowed: true,
    rateLimited: false,
    batchRateLimited: false,
    riskBand: "low" as "low" | "medium" | "high",
    rateLimitChecks: 0,
    batchRateLimitChecks: 0,
    metricReads: 0,
  };

  const journeyRepo = {
    getMetrics: async () => {
      state.metricReads += 1;
      return raw;
    },
    getWorkspaceTimezone: async () => "Europe/Madrid",
    getWorkspaceCreatedAt: async () => new Date("2026-01-01T00:00:00Z"),
    getRiskFacts: async () => ({}),
  };

  const achievementRepo = {
    list: async () =>
      [...achievements].map((stageId) => ({
        id: `a-${stageId}`,
        userId: null,
        organizationId: "org-1",
        programVersion: apiConfiguration.JOURNEY_PROGRAM_VERSION,
        stageId,
        achievedAt: new Date("2026-02-01T00:00:00Z"),
        ruleVersion: "x",
        ruleHash: "y",
      })),
    listLegacy: async () => options.legacyAchievements ?? [],
    recordMany: async (_ctx: unknown, rows: Array<{ stageId: string }>) => {
      const created: string[] = [];
      for (const row of rows) {
        if (!achievements.has(row.stageId)) {
          achievements.add(row.stageId);
          created.push(row.stageId);
        }
      }
      return created;
    },
    has: async (_ctx: unknown, _version: string, stageId: string) =>
      achievements.has(stageId),
  };

  const rewardRepo = {
    listClaims: async (_ctx: unknown, programVersion?: string) => {
      const current = [...claims.values()];
      // Mirrors the real repository: no version filter means "every version",
      // which is how the legacy lens sees v2 claims.
      if (!programVersion) return [...current, ...(options.legacyClaims ?? [])];
      return current.filter((c) => c.programVersion === programVersion);
    },
    claim: async (_ctx: unknown, input: Record<string, unknown>) => {
      const key = input.idempotencyKey as string;
      const existing = claims.get(key);
      if (existing) {
        return {
          claim: existing,
          settled: false,
          duplicate: true,
          balance: wallet,
        };
      }
      const settleNow = input.settleNow as boolean;
      if (settleNow) wallet += (input.amountCents as number) / 100;
      const row = {
        id: `claim-${claims.size + 1}`,
        userId: null,
        organizationId: "org-1",
        programVersion: input.programVersion,
        stageId: input.stageId,
        amountCents: input.amountCents,
        currency: "USD",
        status: settleNow ? "claimed" : "pending_review",
        claimedByUserId: input.claimedByUserId,
        idempotencyKey: key,
        riskScore: input.riskScore,
        riskBand: input.riskBand,
        riskReasons: input.riskReasons,
        balanceBefore: settleNow
          ? wallet - (input.amountCents as number) / 100
          : null,
        balanceAfter: settleNow ? wallet : null,
        claimedAt: settleNow ? new Date() : null,
        approvedAt: null,
        rejectedAt: null,
        rejectionReason: null,
        reviewNote: null,
        createdAt: new Date(),
      };
      claims.set(key, row);
      return {
        claim: row,
        settled: settleNow,
        duplicate: false,
        balance: wallet,
      };
    },
    reject: async (id: string) => {
      for (const row of claims.values()) {
        if (row.id === id) {
          row.status = "rejected";
          return row;
        }
      }
      return null;
    },
    approve: async () => null,
    listPendingReview: async () =>
      [...claims.values()].filter((c) => c.status === "pending_review"),
    totalGrantedCents: async () => 0,
    grantedCentsBetween: async () => 0,
  };

  const risk = {
    assess: async () => ({
      score:
        state.riskBand === "high" ? 90 : state.riskBand === "medium" ? 45 : 0,
      band: state.riskBand,
      reasons: state.riskBand === "low" ? [] : ["phone_unverified"],
      version: "test",
    }),
    recordLockedStageAttempt: async () => {
      state.lockedProbes += 1;
    },
  };

  const budget = {
    checkRateLimit: async () => {
      state.rateLimitChecks += 1;
      return state.rateLimited
        ? { allowed: false, block: "rate_limited", retryAfterSeconds: 42 }
        : { allowed: true };
    },
    checkBatchRateLimit: async () => {
      state.batchRateLimitChecks += 1;
      return state.batchRateLimited
        ? { allowed: false, block: "rate_limited", retryAfterSeconds: 42 }
        : { allowed: true };
    },
    checkBudget: async () =>
      state.budgetAllowed
        ? { allowed: true }
        : { allowed: false, block: "daily_budget" },
    recordSpend: async () => undefined,
    remaining: async () => ({ dayCents: 100_000, monthCents: 1_000_000 }),
  };

  const analytics = {
    track: (name: string, props: Record<string, unknown>) =>
      events.push({ name, props }),
  };

  const redis = {
    get: async () => undefined,
    set: async () => undefined,
    del: async () => undefined,
    has: async () => true,
  };

  const prisma = {
    credit: { findFirst: async () => ({ amount: wallet }) },
  };

  const service = new JourneyService(
    journeyRepo as never,
    achievementRepo as never,
    rewardRepo as never,
    risk as never,
    budget as never,
    analytics as never,
    redis as never,
    prisma as never,
  );

  return {
    service,
    achievements,
    claims,
    events,
    state,
    balance: () => wallet,
  };
}

let restore = () => {};
beforeEach(() => {
  restore();
  restore = withFlags({});
});

describe("JourneyService.getOverview", () => {
  it("persists achievements as a side effect of reading", async () => {
    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");

    assert.ok(harness.achievements.has("core.setup"));
    assert.ok(harness.achievements.has("core.rhythm"));
    assert.ok(harness.achievements.has("core.scale"));
  });

  it("is idempotent — a second read creates nothing new", async () => {
    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");
    harness.events.length = 0;
    await harness.service.getOverview(ORG, "user-1");

    assert.equal(
      harness.events.filter((e) => e.name === "journey_node_achieved").length,
      0,
    );
  });

  it("returns tracks, nodes and a completion summary", async () => {
    const harness = makeHarness();
    const overview = await harness.service.getOverview(ORG, "user-1");

    assert.ok(overview.tracks.length > 0);
    assert.ok(overview.nodes.length > 0);
    assert.equal(overview.completion.requiredTotal, 1);
    assert.equal(overview.completion.electiveRequired, 3);
  });

  it("ships every node with its dependencies, unlocks and blockers", async () => {
    const harness = makeHarness();
    const overview = await harness.service.getOverview(ORG, "user-1");
    const node = overview.nodes.find((n) => n.id === "campaigns.first")!;

    assert.deepEqual(node.dependsOn.sort(), ["core.rhythm", "team.calling"]);
    assert.ok(node.unlocks.includes("campaigns.pipeline"));
  });

  it("reports possibleCents as the frozen program total", async () => {
    const harness = makeHarness();
    const overview = await harness.service.getOverview(ORG, "user-1");
    assert.equal(overview.totals.possibleCents, 3700);
  });

  it("never leaks a raw workspace id into an analytics event", async () => {
    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");

    for (const event of harness.events) {
      const serialised = JSON.stringify(event.props);
      assert.ok(!serialised.includes("org-1"), event.name);
      assert.ok(!serialised.includes("user-1"), event.name);
    }
  });

  it("does not recommend a node the workspace cannot see", async () => {
    const harness = makeHarness();
    const overview = await harness.service.getOverview(
      { userId: "user-1", organizationId: null },
      "user-1",
    );

    if (overview.recommendedNodeId) {
      const ids = overview.nodes.map((n) => n.id);
      assert.ok(ids.includes(overview.recommendedNodeId));
    }
  });
});

describe("JourneyService.claimReward", () => {
  it("pays a node whose requirements and dependencies are satisfied", async () => {
    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");

    const result = await harness.service.claimReward(
      ORG,
      "core.rhythm",
      "user-1",
    );

    assert.equal(result.outcome, "claimed");
    assert.equal(result.nodeId, "core.rhythm");
    assert.equal(result.amountCents, 200);
  });

  it("refuses a node that was never achieved", async () => {
    // Campaigns were never run, so campaigns.first is locked.
    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");

    const result = await harness.service.claimReward(
      ORG,
      "campaigns.first",
      "user-1",
    );

    assert.equal(result.outcome, "not_eligible");
    assert.equal(harness.state.lockedProbes, 1);
  });

  it("rejects an unknown node id", async () => {
    const harness = makeHarness();
    await assert.rejects(
      () => harness.service.claimReward(ORG, "not.a.node", "user-1"),
      /Unknown node/,
    );
  });

  it("rejects a node the workspace type cannot see", async () => {
    const harness = makeHarness();
    await assert.rejects(
      () =>
        harness.service.claimReward(
          { userId: "user-1", organizationId: null },
          "team.calling",
          "user-1",
        ),
      /Unknown node/,
    );
  });

  it("rejects a node that carries no reward", async () => {
    const harness = makeHarness();
    await assert.rejects(
      () => harness.service.claimReward(ORG, "core.setup", "user-1"),
      /does not carry a reward/,
    );
  });

  it("is idempotent — a second claim never pays twice", async () => {
    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");

    const first = await harness.service.claimReward(
      ORG,
      "core.rhythm",
      "user-1",
    );
    const balanceAfterFirst = harness.balance();
    const second = await harness.service.claimReward(
      ORG,
      "core.rhythm",
      "user-1",
    );

    assert.equal(first.outcome, "claimed");
    assert.equal(second.outcome, "already_claimed");
    assert.equal(harness.balance(), balanceAfterFirst);
  });

  it("survives concurrent claims of the same node", async () => {
    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");

    const results = await Promise.all([
      harness.service.claimReward(ORG, "core.rhythm", "user-1"),
      harness.service.claimReward(ORG, "core.rhythm", "user-1"),
      harness.service.claimReward(ORG, "core.rhythm", "user-1"),
    ]);

    const paid = results.filter((r) => r.outcome === "claimed");
    assert.equal(paid.length, 1);
    assert.equal(harness.claims.size, 1);
  });

  it("holds a medium-risk claim for review instead of paying", async () => {
    const harness = makeHarness();
    harness.state.riskBand = "medium";
    await harness.service.getOverview(ORG, "user-1");

    const before = harness.balance();
    const result = await harness.service.claimReward(
      ORG,
      "core.rhythm",
      "user-1",
    );

    assert.equal(result.outcome, "pending_review");
    assert.equal(harness.balance(), before);
  });

  it("never tells a high-risk claimant they were flagged", async () => {
    const harness = makeHarness();
    harness.state.riskBand = "high";
    await harness.service.getOverview(ORG, "user-1");

    const result = await harness.service.claimReward(
      ORG,
      "core.rhythm",
      "user-1",
    );

    assert.equal(result.outcome, "rejected");
    assert.equal(result.messageCode, "journey.needs_more_activity");
    assert.ok(!JSON.stringify(result).includes("risk"));
  });

  it("blocks on the workspace cap", async () => {
    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");
    harness.state.budgetAllowed = false;

    const result = await harness.service.claimReward(
      ORG,
      "core.rhythm",
      "user-1",
    );
    assert.equal(result.outcome, "unavailable");
  });

  it("pays nothing in dry run", async () => {
    restore();
    restore = withFlags({ JOURNEY_DRY_RUN: true });

    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");
    const before = harness.balance();

    const result = await harness.service.claimReward(
      ORG,
      "core.rhythm",
      "user-1",
    );

    assert.equal(result.outcome, "pending_review");
    assert.equal(harness.balance(), before);
  });

  it("routes through review when auto-approve is off", async () => {
    restore();
    restore = withFlags({ JOURNEY_AUTO_APPROVE_ENABLED: false });

    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");

    const result = await harness.service.claimReward(
      ORG,
      "core.rhythm",
      "user-1",
    );
    assert.equal(result.outcome, "pending_review");
  });

  it("pays nothing to a holdout workspace", async () => {
    restore();
    restore = withFlags({ JOURNEY_HOLDOUT_PERCENT: 100 });

    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");

    const result = await harness.service.claimReward(
      ORG,
      "core.rhythm",
      "user-1",
    );
    assert.equal(result.outcome, "unavailable");
  });

  it("pays nothing while the program is off", async () => {
    restore();
    restore = withFlags({ JOURNEY_V2_ENABLED: false });

    const harness = makeHarness();
    const result = await harness.service.claimReward(
      ORG,
      "core.rhythm",
      "user-1",
    );

    assert.equal(result.outcome, "unavailable");
    assert.equal(result.messageCode, "journey.program_paused");
  });

  it("reports a rate limit without attempting the claim", async () => {
    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");
    harness.state.rateLimited = true;

    const result = await harness.service.claimReward(
      ORG,
      "core.rhythm",
      "user-1",
    );

    assert.equal(result.outcome, "rate_limited");
    assert.equal(result.retryAfterSeconds, 42);
    assert.equal(harness.claims.size, 0);
  });
});

describe("JourneyService.claimAll", () => {
  it("checks the batch rate limit exactly once, however many nodes settle", async () => {
    // The bug this replaces: claimAll used to call the per-node rate limit in a
    // loop, so a workspace with more claimable nodes than the per-window limit
    // cut itself off partway through and stranded the rest.
    const harness = makeHarness({ raw: everythingMetrics() });
    await harness.service.getOverview(ORG, "user-1");
    harness.state.batchRateLimitChecks = 0;
    harness.state.rateLimitChecks = 0;

    const result = await harness.service.claimAll(ORG, "user-1");

    assert.equal(harness.state.batchRateLimitChecks, 1);
    assert.equal(harness.state.rateLimitChecks, 0);
    assert.ok(result.results.length > 0);
  });

  it("settles more than 10 nodes in one batch", async () => {
    // The default JOURNEY_CLAIM_MAX_PER_USER is 10; a full organization graph
    // has more rewarded nodes than that.
    const harness = makeHarness({ raw: everythingMetrics() });
    await harness.service.getOverview(ORG, "user-1");

    const result = await harness.service.claimAll(ORG, "user-1");
    const paid = result.results.filter((r) => r.outcome === "claimed");

    assert.ok(
      paid.length > 10,
      `expected more than 10 settled nodes, got ${paid.length}`,
    );
  });

  it("never pays more than the frozen program total", async () => {
    const harness = makeHarness({ raw: everythingMetrics() });
    await harness.service.getOverview(ORG, "user-1");

    const result = await harness.service.claimAll(ORG, "user-1");
    assert.ok(
      result.claimedCents <= 3700,
      `paid ${result.claimedCents}, cap is 3700`,
    );
  });

  it("reads metrics once for the whole batch", async () => {
    const harness = makeHarness({ raw: everythingMetrics() });
    await harness.service.getOverview(ORG, "user-1");
    harness.state.metricReads = 0;

    await harness.service.claimAll(ORG, "user-1");

    assert.equal(harness.state.metricReads, 1);
  });

  it("gives every node its own idempotency key", async () => {
    const harness = makeHarness({ raw: everythingMetrics() });
    await harness.service.getOverview(ORG, "user-1");

    await harness.service.claimAll(ORG, "user-1");
    const keys = [...harness.claims.keys()];

    assert.equal(new Set(keys).size, keys.length);
  });

  it("is idempotent — a second batch pays nothing more", async () => {
    const harness = makeHarness({ raw: everythingMetrics() });
    await harness.service.getOverview(ORG, "user-1");

    const first = await harness.service.claimAll(ORG, "user-1");
    const balanceAfterFirst = harness.balance();
    const second = await harness.service.claimAll(ORG, "user-1");

    assert.ok(first.claimedCents > 0);
    assert.equal(second.claimedCents, 0);
    assert.equal(harness.balance(), balanceAfterFirst);
  });

  it("refuses the whole batch when rate limited, without touching any node", async () => {
    const harness = makeHarness({ raw: everythingMetrics() });
    await harness.service.getOverview(ORG, "user-1");
    harness.state.batchRateLimited = true;

    const result = await harness.service.claimAll(ORG, "user-1");

    assert.deepEqual(result.results, []);
    assert.equal(result.claimedCents, 0);
    assert.equal(result.retryAfterSeconds, 42);
    assert.equal(harness.claims.size, 0);
  });

  it("skips nodes that were never achieved", async () => {
    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");

    const result = await harness.service.claimAll(ORG, "user-1");
    const ids = result.results.map((r) => r.nodeId);

    assert.ok(!ids.includes("campaigns.first"));
    assert.ok(!ids.includes("ai.insights"));
  });

  it("settles in dependency order", async () => {
    const harness = makeHarness({ raw: everythingMetrics() });
    await harness.service.getOverview(ORG, "user-1");

    const result = await harness.service.claimAll(ORG, "user-1");
    const ids = result.results.map((r) => r.nodeId);

    assert.ok(ids.indexOf("core.rhythm") < ids.indexOf("core.scale"));
    assert.ok(ids.indexOf("ai.transcription") < ids.indexOf("ai.insights"));
  });
});

describe("JourneyService — legacy v2 rewards", () => {
  const legacyAchievements: LegacyRow[] = [
    {
      programVersion: "2026.08",
      stageId: "consistent_caller",
      achievedAt: new Date("2026-03-01T10:00:00Z"),
    },
  ];
  const legacyClaims: LegacyClaimRow[] = [
    {
      programVersion: "2026.08",
      stageId: "consistent_caller",
      status: "claimed",
      amountCents: 300,
      claimedAt: new Date("2026-03-02T10:00:00Z"),
    },
  ];

  it("refuses to pay a v3 node whose v2 stage was already paid", async () => {
    const harness = makeHarness({ legacyAchievements, legacyClaims });
    await harness.service.getOverview(ORG, "user-1");
    const before = harness.balance();

    const result = await harness.service.claimReward(
      ORG,
      "core.rhythm",
      "user-1",
    );

    assert.equal(result.outcome, "already_claimed");
    assert.equal(result.messageCode, "journey.already_claimed_legacy");
    assert.equal(harness.balance(), before);
  });

  it("reports the legacy reward as legacy_claimed, not claimable", async () => {
    const harness = makeHarness({ legacyAchievements, legacyClaims });
    const overview = await harness.service.getOverview(ORG, "user-1");
    const node = overview.nodes.find((n) => n.id === "core.rhythm")!;

    assert.equal(node.reward?.status, "legacy_claimed");
    assert.equal(node.reward?.legacyProgramVersion, "2026.08");
  });

  it("preserves the original settlement date rather than inventing one", async () => {
    const harness = makeHarness({ legacyAchievements, legacyClaims });
    const overview = await harness.service.getOverview(ORG, "user-1");
    const node = overview.nodes.find((n) => n.id === "core.rhythm")!;

    assert.equal(node.reward?.claimedAt, "2026-03-02T10:00:00.000Z");
  });

  it("counts legacy money separately from v3 money", async () => {
    const harness = makeHarness({ legacyAchievements, legacyClaims });
    const overview = await harness.service.getOverview(ORG, "user-1");

    assert.equal(overview.totals.legacyClaimedCents, 200);
    assert.equal(overview.totals.claimedCents, 0);
  });

  it("excludes legacy-paid nodes from claim-all", async () => {
    const harness = makeHarness({
      raw: everythingMetrics(),
      legacyAchievements,
      legacyClaims,
    });
    await harness.service.getOverview(ORG, "user-1");

    const result = await harness.service.claimAll(ORG, "user-1");
    assert.ok(!result.results.map((r) => r.nodeId).includes("core.rhythm"));
  });

  it("still lets an unpaid v2 achievement earn its v3 reward", async () => {
    const harness = makeHarness({
      legacyAchievements,
      legacyClaims: [{ ...legacyClaims[0], status: "rejected" }],
    });
    await harness.service.getOverview(ORG, "user-1");

    const result = await harness.service.claimReward(
      ORG,
      "core.rhythm",
      "user-1",
    );
    assert.equal(result.outcome, "claimed");
  });

  it("credits v3 nodes for v2 work even when the window no longer shows it", async () => {
    // A workspace that earned the ladder months ago and has been quiet since.
    const quiet = metrics({
      verifiedPhone: 1,
      dialableNumbers: 1,
      connectedCalls: 0,
      activeDays: 0,
      activeWeeks: 0,
      uniqueDestinations: 0,
      connectedMinutes: 0,
      meaningfulConversations: 0,
      outcomesLogged: 0,
      acceptedMembers: 0,
      activeMembers: 0,
    });

    const harness = makeHarness({
      raw: quiet,
      legacyAchievements: [
        {
          programVersion: "2026.08",
          stageId: "foundation",
          achievedAt: new Date("2026-01-15T10:00:00Z"),
        },
      ],
    });

    const overview = await harness.service.getOverview(ORG, "user-1");
    const setup = overview.nodes.find((n) => n.id === "core.setup")!;
    const firstCall = overview.nodes.find((n) => n.id === "core.first_call")!;

    assert.equal(setup.status, "achieved");
    assert.equal(firstCall.status, "achieved");
    assert.equal(firstCall.achievedAt, "2026-01-15T10:00:00.000Z");
  });
});

describe("JourneyService.recordClientEvent", () => {
  it("records a node view with a validated node id", async () => {
    const harness = makeHarness();
    await harness.service.recordClientEvent(
      ORG,
      "user-1",
      "journey_node_viewed",
      "core.rhythm",
    );

    const event = harness.events.find((e) => e.name === "journey_node_viewed");
    assert.ok(event);
    assert.equal(event!.props.nodeId, "core.rhythm");
    assert.equal(event!.props.trackId, "core");
  });

  it("drops an unknown node id rather than recording it", async () => {
    const harness = makeHarness();
    await harness.service.recordClientEvent(
      ORG,
      "user-1",
      "journey_node_viewed",
      "'; DROP TABLE calls; --",
    );

    const event = harness.events.find((e) => e.name === "journey_node_viewed");
    assert.equal(event!.props.nodeId, undefined);
  });

  it("drops a node id the workspace type cannot see", async () => {
    const harness = makeHarness();
    await harness.service.recordClientEvent(
      { userId: "user-1", organizationId: null },
      "user-1",
      "journey_node_viewed",
      "campaigns.first",
    );

    const event = harness.events.find((e) => e.name === "journey_node_viewed");
    assert.equal(event!.props.nodeId, undefined);
  });
});
