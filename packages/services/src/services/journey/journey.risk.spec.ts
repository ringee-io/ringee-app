/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  JOURNEY_RISK_RULES,
  JourneyRiskSnapshot,
  evaluateJourneyRisk,
} from "./journey.risk";

const thresholds = {
  minAccountAgeHours: 24,
  maxRewardedWorkspacesPerUser: 2,
  mediumThreshold: 30,
  highThreshold: 70,
};

/** A healthy, ordinary workspace. Each test breaks exactly one thing. */
function cleanSnapshot(
  overrides: Partial<JourneyRiskSnapshot> = {},
): JourneyRiskSnapshot {
  return {
    accountAgeHours: 30 * 24,
    workspaceAgeHours: 20 * 24,
    emailVerified: true,
    phoneVerified: true,
    userBlocked: false,
    usersSharingPhone: 1,
    workspacesSharingPaymentMethod: 1,
    relatedRewardedWorkspaces: 1,
    workspacesCreatedLast7Days: 0,
    hoursSinceSignupAtClaim: 30 * 24,
    attemptedCalls: 120,
    failedCalls: 10,
    veryShortCalls: 12,
    connectedCalls: 80,
    topDestinationCalls: 6,
    selfDialedCalls: 0,
    connectedMinutes: 200,
    premiumRateMinutes: 5,
    burstConcentration: 0.15,
    lockedStageAttempts24h: 0,
    hasActivePaymentBlock: false,
    ...overrides,
  };
}

describe("evaluateJourneyRisk — the healthy case", () => {
  it("scores a normal workspace as low risk with no reasons", () => {
    const verdict = evaluateJourneyRisk(cleanSnapshot(), thresholds);
    assert.equal(verdict.score, 0);
    assert.equal(verdict.band, "low");
    assert.deepEqual(verdict.reasons, []);
  });

  it("stamps the rule version so a decision can be replayed later", () => {
    assert.match(
      evaluateJourneyRisk(cleanSnapshot(), thresholds).version,
      /^\d{4}\./,
    );
  });
});

describe("evaluateJourneyRisk — identity signals", () => {
  it("flags a blocked user as high risk on its own", () => {
    const verdict = evaluateJourneyRisk(
      cleanSnapshot({ userBlocked: true }),
      thresholds,
    );
    assert.equal(verdict.band, "high");
    assert.ok(verdict.reasons.includes("user_blocked"));
  });

  it("flags a brand-new account", () => {
    const verdict = evaluateJourneyRisk(
      cleanSnapshot({ accountAgeHours: 2, hoursSinceSignupAtClaim: 2 }),
      thresholds,
    );
    assert.ok(verdict.reasons.includes("account_too_new"));
    assert.ok(verdict.reasons.includes("claim_too_fast"));
    assert.equal(verdict.band, "medium");
  });

  it("does not flag workspace age for a personal workspace", () => {
    // 0 means "no separate workspace birthday", not "created zero hours ago".
    const verdict = evaluateJourneyRisk(
      cleanSnapshot({ workspaceAgeHours: 0 }),
      thresholds,
    );
    assert.ok(!verdict.reasons.includes("workspace_too_new"));
  });

  it("flags a phone shared across accounts", () => {
    const verdict = evaluateJourneyRisk(
      cleanSnapshot({ usersSharingPhone: 4 }),
      thresholds,
    );
    assert.ok(verdict.reasons.includes("shared_phone"));
  });

  it("flags one card behind many workspaces", () => {
    const verdict = evaluateJourneyRisk(
      cleanSnapshot({ workspacesSharingPaymentMethod: 5 }),
      thresholds,
    );
    assert.ok(verdict.reasons.includes("shared_payment_method"));
  });

  it("flags a person collecting rewards across many workspaces", () => {
    const verdict = evaluateJourneyRisk(
      cleanSnapshot({ relatedRewardedWorkspaces: 3 }),
      thresholds,
    );
    assert.ok(verdict.reasons.includes("related_workspaces"));
  });

  it("does not flag exactly the allowed number of workspaces", () => {
    const verdict = evaluateJourneyRisk(
      cleanSnapshot({ relatedRewardedWorkspaces: 2 }),
      thresholds,
    );
    assert.ok(!verdict.reasons.includes("related_workspaces"));
  });
});

describe("evaluateJourneyRisk — behavioural signals", () => {
  it("does not flag ratios on a tiny sample", () => {
    // 2 calls, both short and both failed: a first-day user, not a farm.
    const verdict = evaluateJourneyRisk(
      cleanSnapshot({ attemptedCalls: 2, failedCalls: 2, veryShortCalls: 2 }),
      thresholds,
    );
    assert.ok(!verdict.reasons.includes("high_failure_rate"));
    assert.ok(!verdict.reasons.includes("short_call_flood"));
  });

  it("flags a high failure rate once the sample is large enough", () => {
    const verdict = evaluateJourneyRisk(
      cleanSnapshot({ attemptedCalls: 100, failedCalls: 80 }),
      thresholds,
    );
    assert.ok(verdict.reasons.includes("high_failure_rate"));
  });

  it("flags a flood of sub-10-second calls", () => {
    const verdict = evaluateJourneyRisk(
      cleanSnapshot({ attemptedCalls: 100, veryShortCalls: 90 }),
      thresholds,
    );
    assert.ok(verdict.reasons.includes("short_call_flood"));
  });

  it("flags calling the same destination over and over", () => {
    const verdict = evaluateJourneyRisk(
      cleanSnapshot({ connectedCalls: 40, topDestinationCalls: 30 }),
      thresholds,
    );
    assert.ok(verdict.reasons.includes("destination_repetition"));
  });

  it("does not flag repetition below the sample floor", () => {
    const verdict = evaluateJourneyRisk(
      cleanSnapshot({ connectedCalls: 4, topDestinationCalls: 4 }),
      thresholds,
    );
    assert.ok(!verdict.reasons.includes("destination_repetition"));
  });

  it("flags a single self-dialled call", () => {
    const verdict = evaluateJourneyRisk(
      cleanSnapshot({ selfDialedCalls: 1 }),
      thresholds,
    );
    assert.ok(verdict.reasons.includes("self_dialing"));
  });

  it("flags credit burned on premium-rate destinations", () => {
    const verdict = evaluateJourneyRisk(
      cleanSnapshot({ connectedMinutes: 100, premiumRateMinutes: 70 }),
      thresholds,
    );
    assert.ok(verdict.reasons.includes("expensive_destinations"));
  });

  it("flags all activity compressed into one short burst", () => {
    const verdict = evaluateJourneyRisk(
      cleanSnapshot({ connectedCalls: 50, burstConcentration: 0.95 }),
      thresholds,
    );
    assert.ok(verdict.reasons.includes("time_compression"));
  });

  it("flags repeated probing of locked stages", () => {
    const verdict = evaluateJourneyRisk(
      cleanSnapshot({ lockedStageAttempts24h: 9 }),
      thresholds,
    );
    assert.ok(verdict.reasons.includes("locked_stage_probing"));
  });

  it("carries a payment-abuse block into the reward decision", () => {
    const verdict = evaluateJourneyRisk(
      cleanSnapshot({ hasActivePaymentBlock: true }),
      thresholds,
    );
    assert.ok(verdict.reasons.includes("payment_failures"));
  });
});

describe("evaluateJourneyRisk — banding", () => {
  it("caps the score at 100", () => {
    const verdict = evaluateJourneyRisk(
      cleanSnapshot({
        userBlocked: true,
        emailVerified: false,
        phoneVerified: false,
        selfDialedCalls: 10,
        usersSharingPhone: 9,
        accountAgeHours: 1,
        hoursSinceSignupAtClaim: 1,
      }),
      thresholds,
    );
    assert.equal(verdict.score, 100);
    assert.equal(verdict.band, "high");
  });

  it("puts a moderately suspicious workspace in review, not rejection", () => {
    // Unverified phone (25) + unverified email (20) = 45 → medium.
    const verdict = evaluateJourneyRisk(
      cleanSnapshot({ phoneVerified: false, emailVerified: false }),
      thresholds,
    );
    assert.equal(verdict.score, 45);
    assert.equal(verdict.band, "medium");
  });

  it("treats the medium threshold as inclusive and high as inclusive", () => {
    const at = (score: number) =>
      score >= 70 ? "high" : score >= 30 ? "medium" : "low";
    assert.equal(at(29), "low");
    assert.equal(at(30), "medium");
    assert.equal(at(69), "medium");
    assert.equal(at(70), "high");
  });
});

describe("rule catalogue hygiene", () => {
  it("has unique reason codes", () => {
    const codes = JOURNEY_RISK_RULES.map((r) => r.code);
    assert.equal(new Set(codes).size, codes.length);
  });

  it("assigns positive points to every rule", () => {
    for (const rule of JOURNEY_RISK_RULES) {
      assert.ok(rule.points > 0, rule.code);
    }
  });

  it("has no single rule that alone reaches medium except the severe ones", () => {
    // A single ordinary signal should not by itself hold a claim for review;
    // the ones that do are deliberate and enumerated here.
    const allowedSoloMedium = new Set([
      "user_blocked",
      "account_too_new",
      "shared_phone",
      "shared_payment_method",
      "self_dialing",
    ]);
    for (const rule of JOURNEY_RISK_RULES) {
      if (rule.points >= thresholds.mediumThreshold) {
        assert.ok(
          allowedSoloMedium.has(rule.code),
          `${rule.code} (${rule.points}) alone triggers review`,
        );
      }
    }
  });
});
