import { describe, expect, it } from "vitest";
import { deriveLimits, baselineSettings } from "./dispatch-settings";
import { PacingClocks, type PacingRequest } from "./gcra";
import type { TrafficLevel } from "./traffic-class";

const SECOND = 1_000_000;
const limits = deriveLimits(
  baselineSettings({
    mode: "enforce",
    ceilingCps: 5,
    safetyMargin: 0.2,
    orgAutomationCps: 2,
    queueEnabled: false,
    orgConcurrency: 25,
    queueMaxPerWorkspace: 1000,
    queueMaxTotal: 5000,
    queueMaxWaitMinutes: 120,
    surchargeBudgetUsd: 0,
  }),
);

const request = (
  level: TrafficLevel,
  workspaceKey: string | null = null,
): PacingRequest => ({
  level,
  levelIntervalsMicros: limits.levelIntervalsMicros,
  workspaceKey,
  workspaceIntervalMicros: limits.orgIntervalMicros,
  automationGuardMicros: limits.automationGuardMicros,
});

/** A small seeded generator so a failing run can be replayed. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

describe("PacingClocks (strict GCRA)", () => {
  it("derives the documented defaults: 4 CPS effective, 250 ms between grants", () => {
    expect(limits.effectiveCps).toBe(4);
    expect(limits.levelCapsCps).toEqual([4, 3, 2.5, 2]);
    expect(limits.levelIntervalsMicros).toEqual([
      250_000, 333_334, 400_000, 500_000,
    ]);
    expect(limits.interactiveReserveCps).toBe(1);
    expect(limits.jitterToleranceMs).toBe(250);
    expect(limits.automationGuardMicros).toBe(25_000);
  });

  it("grants one, then refuses until a full interval has passed", () => {
    const clocks = new PacingClocks();
    expect(clocks.acquire(request(0), 1_000_000).granted).toBe(true);
    const refused = clocks.acquire(request(0), 1_100_000);
    expect(refused.granted).toBe(false);
    expect(refused.retryAfterMicros).toBe(150_000);
    expect(refused.blockedBy).toBe("level0");
    expect(clocks.acquire(request(0), 1_249_999).granted).toBe(false);
    expect(clocks.acquire(request(0), 1_250_000).granted).toBe(true);
  });

  it("has no burst: a burst of 100 at one instant yields exactly one grant", () => {
    const clocks = new PacingClocks();
    const grants = Array.from({ length: 100 }, () =>
      clocks.acquire(request(0), 5 * SECOND),
    ).filter((decision) => decision.granted);
    expect(grants).toHaveLength(1);
  });

  it("is not a token bucket: idle time never banks extra grants", () => {
    const clocks = new PacingClocks();
    // A long quiet period, then a flood: still one grant per interval.
    const granted: number[] = [];
    for (let t = 3_600 * SECOND; t < 3_600 * SECOND + 2 * SECOND; t += 1_000) {
      if (clocks.acquire(request(0), t).granted) granted.push(t);
    }
    for (let i = 1; i < granted.length; i++) {
      expect(granted[i] - granted[i - 1]).toBeGreaterThanOrEqual(250_000);
    }
    expect(granted).toHaveLength(8);
  });

  it("never lets any one-second window hold more than the ceiling", () => {
    // The failure a per-second counter has: five calls at the end of one
    // second and five at the start of the next are ten within a second.
    const clocks = new PacingClocks();
    const random = rng(42);
    const grants: number[] = [];
    for (let t = 0; t < 600 * SECOND; t += Math.floor(random() * 30_000)) {
      if (clocks.acquire(request(0), t).granted) grants.push(t);
    }
    let worst = 0;
    for (let i = 0; i < grants.length; i++) {
      let count = 0;
      for (let j = i; j < grants.length && grants[j] - grants[i] <= SECOND; j++)
        count++;
      worst = Math.max(worst, count);
    }
    // A closed second can hold the first and the fifth of a 250 ms train.
    expect(worst).toBeLessThanOrEqual(5);
    expect(grants.length).toBeGreaterThan(2_000);
  });

  it("stays within the ceiling even when arrivals are jittered by the tolerance", () => {
    // Grants 250 ms apart, each delayed by up to the derived tolerance (250 ms):
    // the worst closed one-second window must not exceed 5.
    const clocks = new PacingClocks();
    const random = rng(7);
    const arrivals: number[] = [];
    for (let t = 0; t < 600 * SECOND; t += 10_000) {
      if (clocks.acquire(request(0), t).granted)
        arrivals.push(
          t + Math.floor(random() * limits.jitterToleranceMs * 1000 * 0.999),
        );
    }
    arrivals.sort((a, b) => a - b);
    let worst = 0;
    for (let i = 0; i < arrivals.length; i++) {
      let count = 0;
      for (
        let j = i;
        j < arrivals.length && arrivals[j] - arrivals[i] <= SECOND;
        j++
      )
        count++;
      worst = Math.max(worst, count);
    }
    expect(worst).toBeLessThanOrEqual(5);
  });

  it("with no safety margin the same jitter DOES break the ceiling (why the margin exists)", () => {
    const tight = deriveLimits(
      baselineSettings({
        mode: "enforce",
        ceilingCps: 5,
        safetyMargin: 0,
        orgAutomationCps: 2,
        queueEnabled: false,
        orgConcurrency: 25,
        queueMaxPerWorkspace: 1,
        queueMaxTotal: 1,
        queueMaxWaitMinutes: 1,
        surchargeBudgetUsd: 0,
      }),
    );
    expect(tight.jitterToleranceMs).toBe(0);
    const clocks = new PacingClocks();
    const random = rng(7);
    const req: PacingRequest = {
      level: 0,
      levelIntervalsMicros: tight.levelIntervalsMicros,
      workspaceKey: null,
      workspaceIntervalMicros: 0,
    };
    const arrivals: number[] = [];
    for (let t = 0; t < 600 * SECOND; t += 10_000) {
      if (clocks.acquire(req, t).granted)
        arrivals.push(t + Math.floor(random() * 250_000));
    }
    arrivals.sort((a, b) => a - b);
    let worst = 0;
    for (let i = 0; i < arrivals.length; i++) {
      let count = 0;
      for (
        let j = i;
        j < arrivals.length && arrivals[j] - arrivals[i] <= SECOND;
        j++
      )
        count++;
      worst = Math.max(worst, count);
    }
    expect(worst).toBeGreaterThan(5);
  });

  describe("traffic levels", () => {
    it("caps each level's own throughput (P3 at 2 CPS, P2+P3 at 2.5, ...)", () => {
      const clocks = new PacingClocks();
      const grants = { 1: 0, 2: 0, 3: 0 };
      // All three automated levels hammer the clock for a minute.
      for (let t = 0; t < 60 * SECOND; t += 5_000) {
        for (const level of [3, 2, 1] as const) {
          if (clocks.acquire(request(level), t).granted) grants[level]++;
        }
      }
      const perSecond = (n: number) => n / 60;
      // Level 3 clock bounds ONLY level-3 grants; level 2's clock bounds 2+3.
      expect(perSecond(grants[3])).toBeLessThanOrEqual(2.001);
      expect(perSecond(grants[2] + grants[3])).toBeLessThanOrEqual(2.501);
      expect(perSecond(grants[1] + grants[2] + grants[3])).toBeLessThanOrEqual(
        3.001,
      );
    });

    it("keeps a quarter of the capacity for people: automation can never take it", () => {
      const clocks = new PacingClocks();
      let automated = 0;
      for (let t = 0; t < 120 * SECOND; t += 2_000) {
        for (const level of [1, 2, 3] as const) {
          if (clocks.acquire(request(level), t).granted) automated++;
        }
      }
      // Automation alone tops out at the level-1 cap, 3 CPS, of 4.
      expect(automated / 120).toBeLessThanOrEqual(3.001);
      expect(limits.interactiveReserveCps).toBe(1);
    });

    it("a person waits at most one interval behind saturated automation", () => {
      const clocks = new PacingClocks();
      const random = rng(99);
      // Automation retries exactly when told; a person arrives at random
      // moments (never twice within one interval, so only automation is ahead
      // of them) and retries exactly when told too.
      let personAt = 100_000;
      const arrivals: number[] = [];
      while (personAt < 300 * SECOND) {
        arrivals.push(personAt);
        personAt += 260_000 + Math.floor(random() * 2 * SECOND);
      }
      const waits: number[] = [];
      const autoNext = new Map<number, number>([
        [1, 0],
        [2, 0],
        [3, 0],
      ]);
      const personRetry = new Map<number, number>();
      let nextPerson = 0;
      for (let now = 0; now < 300 * SECOND; now += 1_000) {
        // Automation: every level retries as soon as it may.
        for (const level of [1, 2, 3] as const) {
          if (now >= (autoNext.get(level) ?? 0)) {
            const decision = clocks.acquire(request(level), now);
            if (!decision.granted)
              autoNext.set(level, now + decision.retryAfterMicros);
          }
        }
        // A person arrives, then retries exactly when told.
        if (nextPerson < arrivals.length && now >= arrivals[nextPerson]) {
          personRetry.set(nextPerson, now);
          nextPerson++;
        }
        for (const [index, at] of [...personRetry]) {
          if (now < at) continue;
          const decision = clocks.acquire(request(0), now);
          if (decision.granted) {
            waits.push(now - arrivals[index]);
            personRetry.delete(index);
          } else {
            personRetry.set(index, now + decision.retryAfterMicros);
          }
        }
      }
      expect(waits.length).toBeGreaterThan(50);
      // The grid is 1 ms; a person is never made to wait more than one interval.
      expect(Math.max(...waits)).toBeLessThanOrEqual(
        limits.levelIntervalsMicros[0] + 1_000,
      );
    });
  });

  describe("workspace clock", () => {
    it("spaces one workspace's automated starts and leaves others alone", () => {
      const clocks = new PacingClocks();
      expect(clocks.acquire(request(3, "org:a"), 0).granted).toBe(true);
      const second = clocks.acquire(request(3, "org:a"), 100_000);
      expect(second.granted).toBe(false);
      // Level 3's own clock (500 ms) and the workspace's (500 ms) agree here;
      // the next request is blocked by whichever is later.
      expect(second.retryAfterMicros).toBe(400_000);
      // A different workspace has its own clock but shares the account's:
      // it is held by the account-wide level clocks, never by org:a's clock.
      const other = clocks.acquire(request(3, "org:b"), 100_000);
      expect(other.granted).toBe(false);
      expect(other.blockedBy).not.toBe("workspace");
      expect(other.retryAfterMicros).toBe(400_000);
    });

    it("a workspace key of a person and an organization never share a clock", () => {
      const clocks = new PacingClocks();
      // Account clocks negligible, workspace clock long: only a workspace's
      // own clock can refuse.
      const slow = (key: string): PacingRequest => ({
        level: 1,
        levelIntervalsMicros: [1, 1, 1, 1],
        workspaceKey: key,
        workspaceIntervalMicros: 5 * SECOND,
      });
      clocks.advance(slow("user:u1"), 0);
      expect(clocks.peek(slow("user:u1"), SECOND).granted).toBe(false);
      // Same id, other kind of workspace: an independent clock.
      expect(clocks.peek(slow("org:u1"), SECOND).granted).toBe(true);
    });

    it("blames the workspace when only its clock is busy", () => {
      const clocks = new PacingClocks();
      const sparse: PacingRequest = {
        level: 1,
        levelIntervalsMicros: [1, 1, 1, 1],
        workspaceKey: "org:a",
        workspaceIntervalMicros: 500_000,
      };
      expect(clocks.acquire(sparse, 0).granted).toBe(true);
      const refused = clocks.acquire(sparse, 10);
      expect(refused.blockedBy).toBe("workspace");
      expect(refused.retryAfterMicros).toBe(499_990);
    });
  });

  describe("peek and advance", () => {
    it("peek reports without moving anything", () => {
      const clocks = new PacingClocks();
      for (let i = 0; i < 5; i++)
        expect(clocks.peek(request(0), 0).granted).toBe(true);
      expect(clocks.acquire(request(0), 0).granted).toBe(true);
      expect(clocks.peek(request(0), 0).granted).toBe(false);
    });

    it("advance moves the clocks even when busy (an overage is still paced against)", () => {
      const clocks = new PacingClocks();
      clocks.acquire(request(0), 0);
      clocks.advance(request(0), 10);
      // Two grants' worth of spacing is now owed.
      expect(clocks.peek(request(0), 499_999).granted).toBe(false);
      expect(clocks.peek(request(0), 500_000).granted).toBe(true);
    });

    it("bounds how far a flood of overages can push the clock", () => {
      const clocks = new PacingClocks();
      const flood: PacingRequest = {
        ...request(0),
        overageHorizonMicros: limits.overageHorizonMicros,
      };
      for (let i = 0; i < 1_000; i++) clocks.advance(flood, 10 * SECOND);
      // 1,000 grants of 250 ms would owe 250 s; the debt is capped at 2 s.
      expect(limits.overageHorizonMicros).toBe(2_000_000);
      expect(clocks.peek(request(0), 10 * SECOND + 1_999_999).granted).toBe(
        false,
      );
      expect(clocks.peek(request(0), 12 * SECOND).granted).toBe(true);
    });

    it("without the bound the same flood would owe minutes", () => {
      const clocks = new PacingClocks();
      for (let i = 0; i < 1_000; i++) clocks.advance(request(0), 10 * SECOND);
      expect(clocks.peek(request(0), 100 * SECOND).granted).toBe(false);
    });

    it("forgets idle workspaces so memory stays bounded", () => {
      const clocks = new PacingClocks();
      const light = (key: string): PacingRequest => ({
        level: 3,
        levelIntervalsMicros: [1, 1, 1, 1],
        workspaceKey: key,
        workspaceIntervalMicros: SECOND,
      });
      for (let i = 0; i < 10_000; i++) clocks.advance(light(`org:${i}`), 0);
      expect(clocks.trackedWorkspaces).toBe(10_000);
      // Everything above is idle by now; the next write drops them.
      clocks.advance(light("org:late"), 60 * SECOND);
      clocks.advance(light("org:later"), 60 * SECOND);
      expect(clocks.trackedWorkspaces).toBeLessThan(10_000);
      expect(clocks.peek(light("org:other"), 120 * SECOND).granted).toBe(true);
    });
  });
});
