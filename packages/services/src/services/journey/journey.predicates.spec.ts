/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  JourneyCallRow,
  hashIdentifier,
  isAttemptedCall,
  isConnectedCall,
  isMeaningfulConversation,
  localDayKey,
  localWeekKey,
  normalizeDestination,
  resolveRollout,
  resolveWorkspaceTimezone,
  workspaceBucket,
} from "./journey.predicates";

const thresholds = { minConnectedSeconds: 20, meaningfulSeconds: 60 };

const context = {
  ownedNumbers: new Set(["+14155550100"]),
  testDestinations: new Set(["+15005550006"]),
  thresholds,
};

/** A call that satisfies every clause, so each test can break exactly one. */
function goodCall(overrides: Partial<JourneyCallRow> = {}): JourneyCallRow {
  return {
    direction: "outbound",
    status: "completed",
    toNumber: "+34600111222",
    startedAt: new Date("2026-03-10T10:00:00Z"),
    answeredAt: new Date("2026-03-10T10:00:05Z"),
    endedAt: new Date("2026-03-10T10:02:00Z"),
    durationSeconds: 115,
    outcome: "interested",
    providerCallId: "telnyx-1",
    totalCost: 0.04,
    ...overrides,
  };
}

describe("normalizeDestination", () => {
  it("reduces formatting differences to one comparable key", () => {
    const expected = "+34600111222";
    for (const raw of [
      "+34 600 111 222",
      "(34) 600-111-222",
      "0034600111222".replace(/^00/, ""),
      "+34600111222",
    ]) {
      assert.equal(normalizeDestination(raw), expected);
    }
  });

  it("rejects values too short to be a real destination", () => {
    assert.equal(normalizeDestination("911"), "");
    assert.equal(normalizeDestination(""), "");
    assert.equal(normalizeDestination(null), "");
  });
});

describe("isAttemptedCall", () => {
  it("accepts a legacy row with no direction", () => {
    assert.equal(isAttemptedCall(goodCall({ direction: null }), context), true);
  });

  it("rejects inbound calls", () => {
    assert.equal(
      isAttemptedCall(goodCall({ direction: "inbound" }), context),
      false,
    );
  });

  it("rejects a call that never left the queue", () => {
    assert.equal(
      isAttemptedCall(goodCall({ status: "pending" }), context),
      false,
    );
  });

  it("rejects dialling a number the workspace owns", () => {
    assert.equal(
      isAttemptedCall(goodCall({ toNumber: "+1 415 555 0100" }), context),
      false,
    );
  });

  it("rejects configured QA destinations", () => {
    assert.equal(
      isAttemptedCall(goodCall({ toNumber: "+15005550006" }), context),
      false,
    );
  });
});

describe("isConnectedCall", () => {
  it("accepts a genuinely completed call", () => {
    assert.equal(isConnectedCall(goodCall(), context), true);
  });

  it("rejects a call that was never answered", () => {
    assert.equal(
      isConnectedCall(goodCall({ answeredAt: null }), context),
      false,
    );
  });

  it("rejects a call with no end stamp", () => {
    assert.equal(isConnectedCall(goodCall({ endedAt: null }), context), false);
  });

  it("rejects a call below the duration floor", () => {
    // Fake answer supervision stamps answeredAt on a ring; the floor is what
    // stops that from counting.
    assert.equal(
      isConnectedCall(goodCall({ durationSeconds: 19 }), context),
      false,
    );
    assert.equal(
      isConnectedCall(goodCall({ durationSeconds: 20 }), context),
      true,
    );
  });

  it("rejects machine and misdial dispositions", () => {
    for (const outcome of ["no_answer", "voicemail", "wrong_number"]) {
      assert.equal(
        isConnectedCall(goodCall({ outcome }), context),
        false,
        outcome,
      );
    }
  });

  it("accepts a connected call that has no disposition yet", () => {
    assert.equal(isConnectedCall(goodCall({ outcome: null }), context), true);
  });

  it("rejects a row the provider never acknowledged", () => {
    assert.equal(
      isConnectedCall(goodCall({ providerCallId: null }), context),
      false,
    );
  });

  it("rejects a failed call even with telephony stamps", () => {
    assert.equal(
      isConnectedCall(goodCall({ status: "failed" }), context),
      false,
    );
  });
});

describe("isMeaningfulConversation", () => {
  const noEvidence = {
    hasCompletedTranscript: false,
    producedMeeting: false,
    producedCallback: false,
    producedCrmSync: false,
  };

  it("accepts a long call on duration alone", () => {
    assert.equal(
      isMeaningfulConversation(goodCall({ durationSeconds: 120 }), {
        ...context,
        evidence: noEvidence,
      }),
      true,
    );
  });

  it("rejects a short call with a hand-picked positive disposition", () => {
    // The whole point: the dropdown is the cheapest thing in the product.
    assert.equal(
      isMeaningfulConversation(
        goodCall({ durationSeconds: 25, outcome: "sale" }),
        { ...context, evidence: noEvidence },
      ),
      false,
    );
  });

  it("accepts a short call backed by operational evidence", () => {
    for (const key of [
      "hasCompletedTranscript",
      "producedMeeting",
      "producedCallback",
      "producedCrmSync",
    ] as const) {
      assert.equal(
        isMeaningfulConversation(goodCall({ durationSeconds: 25 }), {
          ...context,
          evidence: { ...noEvidence, [key]: true },
        }),
        true,
        key,
      );
    }
  });

  it("never accepts a call that was not connected in the first place", () => {
    assert.equal(
      isMeaningfulConversation(
        goodCall({ answeredAt: null, durationSeconds: 600 }),
        {
          ...context,
          evidence: { ...noEvidence, producedMeeting: true },
        },
      ),
      false,
    );
  });
});

describe("resolveWorkspaceTimezone", () => {
  it("accepts real IANA zones", () => {
    for (const zone of [
      "UTC",
      "Europe/Madrid",
      "America/New_York",
      "Asia/Tokyo",
    ]) {
      assert.equal(resolveWorkspaceTimezone(zone), zone);
    }
  });

  it("falls back to UTC rather than throwing", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "   ",
      "Not/AZone",
      "Mars/Olympus",
    ]) {
      assert.equal(resolveWorkspaceTimezone(bad), "UTC");
    }
  });

  it("rejects anything that could escape into SQL", () => {
    // The value is interpolated into `AT TIME ZONE`, so the format check is
    // also the injection guard.
    for (const attack of [
      'UTC\'; DROP TABLE "Call"; --',
      "UTC OR 1=1",
      "'; SELECT 1; --",
      'Europe/Madrid; DELETE FROM "User"',
    ]) {
      assert.equal(resolveWorkspaceTimezone(attack), "UTC");
    }
  });

  it("rejects an over-long value", () => {
    assert.equal(resolveWorkspaceTimezone("A/".repeat(40)), "UTC");
  });
});

describe("local day bucketing", () => {
  it("puts a late-evening Tokyo call on the local day, not the UTC one", () => {
    // 2026-03-10 23:30 UTC is already 2026-03-11 08:30 in Tokyo.
    const instant = new Date("2026-03-10T23:30:00Z");
    assert.equal(localDayKey(instant, "UTC"), "2026-03-10");
    assert.equal(localDayKey(instant, "Asia/Tokyo"), "2026-03-11");
  });

  it("puts an early-morning Los Angeles call on the previous local day", () => {
    // 2026-03-11 02:00 UTC is 2026-03-10 18:00 in Los Angeles.
    const instant = new Date("2026-03-11T02:00:00Z");
    assert.equal(localDayKey(instant, "UTC"), "2026-03-11");
    assert.equal(localDayKey(instant, "America/Los_Angeles"), "2026-03-10");
  });

  it("counts two distinct days for calls straddling local midnight", () => {
    const before = new Date("2026-03-10T22:30:00Z"); // 23:30 Madrid, 10th
    const after = new Date("2026-03-10T23:30:00Z"); // 00:30 Madrid, 11th
    assert.equal(localDayKey(before, "Europe/Madrid"), "2026-03-10");
    assert.equal(localDayKey(after, "Europe/Madrid"), "2026-03-11");
    // …and only one day in UTC, which is exactly the v1 bug.
    assert.equal(localDayKey(before, "UTC"), localDayKey(after, "UTC"));
  });

  it("handles the spring-forward DST transition", () => {
    // Europe/Madrid springs forward at 02:00 on 2026-03-29.
    const beforeJump = new Date("2026-03-29T00:30:00Z"); // 01:30 CET
    const afterJump = new Date("2026-03-29T01:30:00Z"); // 03:30 CEST
    assert.equal(localDayKey(beforeJump, "Europe/Madrid"), "2026-03-29");
    assert.equal(localDayKey(afterJump, "Europe/Madrid"), "2026-03-29");
  });

  it("handles the autumn fall-back transition", () => {
    // Europe/Madrid falls back at 03:00 on 2026-10-25; 01:30 UTC maps to 02:30
    // CEST and 02:30 UTC maps to 02:30 CET — same local day, repeated hour.
    const first = new Date("2026-10-25T00:30:00Z");
    const second = new Date("2026-10-25T01:30:00Z");
    assert.equal(localDayKey(first, "Europe/Madrid"), "2026-10-25");
    assert.equal(localDayKey(second, "Europe/Madrid"), "2026-10-25");
  });
});

describe("local week bucketing", () => {
  it("starts weeks on Monday, like date_trunc('week')", () => {
    // 2026-03-09 is a Monday; 2026-03-15 is the following Sunday.
    assert.equal(
      localWeekKey(new Date("2026-03-09T12:00:00Z"), "UTC"),
      localWeekKey(new Date("2026-03-15T12:00:00Z"), "UTC"),
    );
  });

  it("splits a Sunday and the following Monday into different weeks", () => {
    assert.notEqual(
      localWeekKey(new Date("2026-03-15T12:00:00Z"), "UTC"),
      localWeekKey(new Date("2026-03-16T12:00:00Z"), "UTC"),
    );
  });

  it("uses the workspace timezone, not the server's", () => {
    // Sunday 23:30 UTC is already Monday in Tokyo — a new week there.
    const instant = new Date("2026-03-15T23:30:00Z");
    assert.notEqual(
      localWeekKey(instant, "UTC"),
      localWeekKey(instant, "Asia/Tokyo"),
    );
  });
});

describe("rollout cohorts", () => {
  it("assigns a stable bucket for the same workspace", () => {
    const first = workspaceBucket("organization", "ws-1");
    for (let i = 0; i < 20; i += 1) {
      assert.equal(workspaceBucket("organization", "ws-1"), first);
    }
    assert.ok(first >= 0 && first < 100);
  });

  it("separates personal and organization workspaces with the same id", () => {
    assert.notEqual(
      workspaceBucket("personal", "same-id"),
      workspaceBucket("organization", "same-id"),
    );
  });

  it("never moves a workspace out of the rollout as the percentage grows", () => {
    const args = {
      workspaceType: "organization",
      workspaceId: "ws-42",
      userId: "user-1",
      holdoutPercent: 0,
      internalUserIds: new Set<string>(),
    };
    const bucket = workspaceBucket("organization", "ws-42");

    let seenEnabled = false;
    for (let percent = 0; percent <= 100; percent += 1) {
      const decision = resolveRollout({ ...args, rolloutPercent: percent });
      if (decision.enabled) seenEnabled = true;
      // Once in, always in as the percentage only grows.
      if (seenEnabled) assert.equal(decision.enabled, true, `at ${percent}%`);
    }
    assert.equal(bucket < 100, true);
  });

  it("always includes internal users and never puts them in the holdout", () => {
    const decision = resolveRollout({
      workspaceType: "personal",
      workspaceId: "ws-9",
      userId: "internal-1",
      rolloutPercent: 0,
      holdoutPercent: 50,
      internalUserIds: new Set(["internal-1"]),
    });
    assert.equal(decision.enabled, true);
    assert.equal(decision.holdout, false);
  });

  it("carves the holdout from the top so growing the rollout keeps it stable", () => {
    const inHoldout = (rolloutPercent: number, workspaceId: string) =>
      resolveRollout({
        workspaceType: "organization",
        workspaceId,
        userId: "u",
        rolloutPercent,
        holdoutPercent: 10,
        internalUserIds: new Set<string>(),
      });

    // A workspace in the bottom decile is enabled and never a holdout at 100%.
    const ids = Array.from({ length: 200 }, (_, i) => `ws-${i}`);
    const lowBucket = ids.find(
      (id) => workspaceBucket("organization", id) < 50,
    );
    assert.ok(lowBucket, "expected at least one low-bucket workspace");
    const decision = inHoldout(100, lowBucket as string);
    assert.equal(decision.enabled, true);
    assert.equal(decision.holdout, false);
  });
});

describe("hashIdentifier", () => {
  it("is deterministic and does not leak the input", () => {
    const hash = hashIdentifier("organization:abc-123");
    assert.equal(hash, hashIdentifier("organization:abc-123"));
    assert.equal(hash.length, 16);
    assert.ok(!hash.includes("abc"));
  });

  it("separates different inputs", () => {
    assert.notEqual(hashIdentifier("a"), hashIdentifier("b"));
  });
});
