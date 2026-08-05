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
 * against the real orchestration code: authorisation by achievement, sequence,
 * idempotency, budget, risk banding and what the client is allowed to be told.
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
    ...flags,
  });
  return () =>
    Object.assign(apiConfiguration as Record<string, unknown>, saved);
}

/** A metric bag that clears the first two rungs of the organization ladder. */
function metrics(
  overrides: Partial<JourneyRawMetrics> = {},
): JourneyRawMetrics {
  return {
    verifiedPhone: 1,
    dialableNumbers: 2,
    attemptedCalls: 60,
    connectedCalls: 40,
    meaningfulConversations: 25,
    connectedMinutes: 120,
    billableMinutes: 110,
    uniqueDestinations: 30,
    activeDays: 8,
    activeWeeks: 3,
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

interface Harness {
  service: JourneyService;
  achievements: Set<string>;
  claims: Map<string, Record<string, unknown>>;
  balance: () => number;
  events: Array<{ name: string; props: Record<string, unknown> }>;
  lockedProbes: number;
  budgetAllowed: boolean;
  rateLimited: boolean;
  riskBand: "low" | "medium" | "high";
}

function makeHarness(raw: JourneyRawMetrics = metrics()): Harness {
  const achievements = new Set<string>();
  const claims = new Map<string, Record<string, unknown>>();
  const events: Array<{ name: string; props: Record<string, unknown> }> = [];
  let wallet = 10;

  const state = {
    lockedProbes: 0,
    budgetAllowed: true,
    rateLimited: false,
    riskBand: "low" as "low" | "medium" | "high",
  };

  const journeyRepo = {
    getMetrics: async () => raw,
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
    listClaims: async () => [...claims.values()],
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
    checkRateLimit: async () =>
      state.rateLimited
        ? { allowed: false, block: "rate_limited", retryAfterSeconds: 42 }
        : { allowed: true },
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
    balance: () => wallet,
    events,
    get lockedProbes() {
      return state.lockedProbes;
    },
    set budgetAllowed(value: boolean) {
      state.budgetAllowed = value;
    },
    get budgetAllowed() {
      return state.budgetAllowed;
    },
    set rateLimited(value: boolean) {
      state.rateLimited = value;
    },
    get rateLimited() {
      return state.rateLimited;
    },
    set riskBand(value: "low" | "medium" | "high") {
      state.riskBand = value;
    },
    get riskBand() {
      return state.riskBand;
    },
  } as Harness;
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

    // The metric bag clears the first two organization rungs.
    assert.deepEqual([...harness.achievements].sort(), [
      "team_activated",
      "workspace_ready",
    ]);
  });

  it("is idempotent — a second read creates nothing new", async () => {
    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");
    harness.events.length = 0;
    await harness.service.getOverview(ORG, "user-1");

    assert.equal(
      harness.events.filter((e) => e.name === "journey_stage_achieved").length,
      0,
    );
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

  it("reports the stage the workspace is working on and one next action", async () => {
    const harness = makeHarness();
    const overview = await harness.service.getOverview(ORG, "user-1");

    assert.equal(overview.currentStageId, "campaign_operator");
    assert.ok(overview.nextRequirement);
    assert.equal(overview.completed, false);
  });

  it("marks reachable rewards claimable and later ones locked", async () => {
    const harness = makeHarness();
    const overview = await harness.service.getOverview(ORG, "user-1");

    const byId = new Map(overview.stages.map((s) => [s.id, s]));
    assert.equal(byId.get("team_activated")?.reward?.status, "claimable");
    assert.equal(byId.get("campaign_operator")?.reward?.status, "locked");
    assert.equal(byId.get("ai_sales_team")?.reward?.status, "locked");
  });

  it("gives the first rung no reward at all", async () => {
    const harness = makeHarness();
    const overview = await harness.service.getOverview(ORG, "user-1");
    assert.equal(overview.stages[0].reward, null);
  });

  it("reports rewards as unavailable when the program is paused", async () => {
    restore();
    restore = withFlags({ JOURNEY_REWARDS_ENABLED: false });
    const harness = makeHarness();
    const overview = await harness.service.getOverview(ORG, "user-1");

    assert.equal(overview.program.rewardsAvailable, false);
    assert.equal(overview.program.rewardsBlockedReason, "disabled");
    assert.equal(
      overview.stages.find((s) => s.id === "team_activated")?.reward?.status,
      "unavailable",
    );
  });

  it("marks a holdout workspace as ineligible without hiding progress", async () => {
    restore();
    restore = withFlags({
      JOURNEY_ROLLOUT_PERCENT: 100,
      JOURNEY_HOLDOUT_PERCENT: 100,
    });
    const harness = makeHarness();
    const overview = await harness.service.getOverview(ORG, "user-1");

    assert.equal(overview.program.rewardsBlockedReason, "holdout");
    assert.equal(overview.program.active, true, "progress still tracked");
  });

  it("keeps an earned stage achieved after the window goes quiet", async () => {
    const busy = makeHarness();
    await busy.service.getOverview(ORG, "user-1");

    // Same workspace, same achievements, but no activity in the new window.
    const quiet = makeHarness(
      metrics({ connectedCalls: 0, activeDays: 0, activeMembers: 0 }),
    );
    for (const stageId of busy.achievements) quiet.achievements.add(stageId);

    const overview = await quiet.service.getOverview(ORG, "user-1");
    const teamStage = overview.stages.find((s) => s.id === "team_activated");
    assert.equal(teamStage?.status, "achieved");
    assert.equal(teamStage?.reward?.status, "claimable");
  });
});

describe("JourneyService.claimReward — authorisation", () => {
  it("pays a stage the workspace genuinely reached", async () => {
    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");

    const result = await harness.service.claimReward(
      ORG,
      "team_activated",
      "user-1",
    );

    assert.equal(result.outcome, "claimed");
    assert.equal(result.amountCents, 300);
    assert.equal(harness.balance(), 13);
  });

  it("refuses a stage that has not been reached", async () => {
    const harness = makeHarness();

    const result = await harness.service.claimReward(
      ORG,
      "advanced_operation",
      "user-1",
    );

    assert.equal(result.outcome, "not_eligible");
    assert.equal(harness.balance(), 10);
    assert.equal(harness.lockedProbes, 1, "the probe is recorded for risk");
  });

  it("ignores a client-supplied amount entirely", async () => {
    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");

    // The API takes only a stageId; the amount comes from the program.
    const result = await harness.service.claimReward(
      ORG,
      "team_activated",
      "user-1",
    );
    assert.equal(result.amountCents, 300);
  });

  it("rejects a stage id that is not on this workspace's ladder", async () => {
    const harness = makeHarness();
    // `consistent_caller` is a personal-ladder stage.
    await assert.rejects(
      () => harness.service.claimReward(ORG, "consistent_caller", "user-1"),
      /Unknown stage/,
    );
  });

  it("rejects a fabricated stage id", async () => {
    const harness = makeHarness();
    await assert.rejects(
      () =>
        harness.service.claimReward(ORG, "'; DROP TABLE users; --", "user-1"),
      /Unknown stage/,
    );
  });

  it("rejects an unpaid stage", async () => {
    const harness = makeHarness();
    await assert.rejects(
      () => harness.service.claimReward(ORG, "workspace_ready", "user-1"),
      /does not carry a reward/,
    );
  });
});

describe("JourneyService.claimReward — idempotency", () => {
  it("pays once for a double click", async () => {
    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");

    const first = await harness.service.claimReward(
      ORG,
      "team_activated",
      "user-1",
    );
    const second = await harness.service.claimReward(
      ORG,
      "team_activated",
      "user-1",
    );

    assert.equal(first.outcome, "claimed");
    assert.equal(second.outcome, "already_claimed");
    assert.equal(harness.balance(), 13);
    assert.equal(harness.claims.size, 1);
  });

  it("pays once when two admins claim concurrently", async () => {
    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");

    const [a, b] = await Promise.all([
      harness.service.claimReward(ORG, "team_activated", "admin-a"),
      harness.service.claimReward(ORG, "team_activated", "admin-b"),
    ]);

    const paid = [a, b].filter((r) => r.outcome === "claimed");
    assert.equal(paid.length, 1);
    assert.equal(harness.balance(), 13);
  });

  it("builds the idempotency key only from server-side facts", async () => {
    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");
    await harness.service.claimReward(ORG, "team_activated", "user-1");

    assert.deepEqual(
      [...harness.claims.keys()],
      [
        `journey:organization:org-1:${apiConfiguration.JOURNEY_PROGRAM_VERSION}:team_activated`,
      ],
    );
  });
});

describe("JourneyService.claimReward — controls", () => {
  it("stops at the rate limit and tells the client when to retry", async () => {
    const harness = makeHarness();
    harness.rateLimited = true;

    const result = await harness.service.claimReward(
      ORG,
      "team_activated",
      "user-1",
    );

    assert.equal(result.outcome, "rate_limited");
    assert.equal(result.retryAfterSeconds, 42);
    assert.equal(harness.balance(), 10);
  });

  it("refuses to pay when the daily budget is exhausted", async () => {
    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");
    harness.budgetAllowed = false;

    const result = await harness.service.claimReward(
      ORG,
      "team_activated",
      "user-1",
    );

    assert.equal(result.outcome, "unavailable");
    assert.equal(harness.balance(), 10);
  });

  it("refuses everything when the program is switched off", async () => {
    restore();
    restore = withFlags({ JOURNEY_V2_ENABLED: false });
    const harness = makeHarness();

    const result = await harness.service.claimReward(
      ORG,
      "team_activated",
      "user-1",
    );

    assert.equal(result.outcome, "unavailable");
    assert.equal(result.messageCode, "journey.program_paused");
  });

  it("holds a claim for review in dry-run mode without losing it", async () => {
    restore();
    restore = withFlags({ JOURNEY_DRY_RUN: true });
    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");

    const result = await harness.service.claimReward(
      ORG,
      "team_activated",
      "user-1",
    );

    assert.equal(result.outcome, "pending_review");
    assert.equal(harness.balance(), 10, "no money moved");
    assert.equal(harness.claims.size, 1, "the claim is still recorded");
  });

  it("holds every claim when auto-approve is off", async () => {
    restore();
    restore = withFlags({ JOURNEY_AUTO_APPROVE_ENABLED: false });
    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");

    const result = await harness.service.claimReward(
      ORG,
      "team_activated",
      "user-1",
    );
    assert.equal(result.outcome, "pending_review");
    assert.equal(harness.balance(), 10);
  });

  it("never pays a holdout workspace", async () => {
    restore();
    restore = withFlags({ JOURNEY_HOLDOUT_PERCENT: 100 });
    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");

    const result = await harness.service.claimReward(
      ORG,
      "team_activated",
      "user-1",
    );
    assert.equal(result.outcome, "unavailable");
    assert.equal(harness.balance(), 10);
  });
});

describe("JourneyService.claimReward — risk", () => {
  it("holds a medium-risk claim for review", async () => {
    restore();
    restore = withFlags({ JOURNEY_RISK_REVIEW_ENABLED: true });
    const harness = makeHarness();
    harness.riskBand = "medium";
    await harness.service.getOverview(ORG, "user-1");

    const result = await harness.service.claimReward(
      ORG,
      "team_activated",
      "user-1",
    );

    assert.equal(result.outcome, "pending_review");
    assert.equal(harness.balance(), 10);
  });

  it("rejects a high-risk claim without paying", async () => {
    restore();
    restore = withFlags({ JOURNEY_RISK_REVIEW_ENABLED: true });
    const harness = makeHarness();
    harness.riskBand = "high";
    await harness.service.getOverview(ORG, "user-1");

    const result = await harness.service.claimReward(
      ORG,
      "team_activated",
      "user-1",
    );

    assert.equal(result.outcome, "rejected");
    assert.equal(harness.balance(), 10);
  });

  it("never tells the client why it was rejected", async () => {
    restore();
    restore = withFlags({ JOURNEY_RISK_REVIEW_ENABLED: true });
    const harness = makeHarness();
    harness.riskBand = "high";
    await harness.service.getOverview(ORG, "user-1");

    const result = await harness.service.claimReward(
      ORG,
      "team_activated",
      "user-1",
    );
    const serialised = JSON.stringify(result);

    // No score, no band, no reason code, no accusation.
    assert.equal(result.messageCode, "journey.needs_more_activity");
    assert.ok(!serialised.includes("riskScore"));
    assert.ok(!serialised.includes("phone_unverified"));
    assert.ok(!/fraud|abuse|suspicious/i.test(serialised));
  });
});

describe("JourneyService.claimAll", () => {
  it("claims every eligible stage in one server-driven pass", async () => {
    const harness = makeHarness(
      metrics({
        campaignConnectedCalls: 40,
        campaignUniqueDestinations: 20,
        campaignActiveDays: 5,
        workedLeads: 25,
        connectedCalls: 80,
        outcomesLogged: 40,
      }),
    );
    await harness.service.getOverview(ORG, "user-1");

    const result = await harness.service.claimAll(ORG, "user-1");

    // team_activated ($3) + campaign_operator ($5).
    assert.equal(result.claimedCents, 800);
    assert.equal(harness.balance(), 18);
  });

  it("skips stages that are not reached", async () => {
    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");

    const result = await harness.service.claimAll(ORG, "user-1");

    assert.deepEqual(
      result.results.map((r) => r.stageId),
      ["team_activated"],
    );
  });

  it("is idempotent — running it twice pays once", async () => {
    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");

    await harness.service.claimAll(ORG, "user-1");
    const second = await harness.service.claimAll(ORG, "user-1");

    assert.equal(second.claimedCents, 0);
    assert.equal(harness.balance(), 13);
  });

  it("stops early when rate limited rather than hammering", async () => {
    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");
    harness.rateLimited = true;

    const result = await harness.service.claimAll(ORG, "user-1");

    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].outcome, "rate_limited");
  });
});

describe("JourneyService — program versioning", () => {
  it("scopes the idempotency key to the program version", async () => {
    const harness = makeHarness();
    await harness.service.getOverview(ORG, "user-1");
    await harness.service.claimReward(ORG, "team_activated", "user-1");

    const key = [...harness.claims.keys()][0];
    assert.ok(key.includes(apiConfiguration.JOURNEY_PROGRAM_VERSION));
  });

  it("fails loudly on an unknown configured version", async () => {
    const saved = apiConfiguration.JOURNEY_PROGRAM_VERSION;
    (apiConfiguration as Record<string, unknown>).JOURNEY_PROGRAM_VERSION =
      "1999.01";
    const harness = makeHarness();
    try {
      // Silently serving a different ladder than the one stamped on a
      // workspace's achievements would corrupt the audit trail.
      await assert.rejects(
        () => harness.service.getOverview(ORG, "user-1"),
        /Unknown Journey program/,
      );
    } finally {
      (apiConfiguration as Record<string, unknown>).JOURNEY_PROGRAM_VERSION =
        saved;
    }
  });
});
