import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { connectRedisClient } from "../../redis/redis-client";
import { RedisService } from "../../redis/redis.service";
import { baselineSettings, deriveLimits } from "./dispatch-settings";
import { PacingClocks, type PacingRequest } from "./gcra";
import {
  RedisCpsLimiter,
  type AcquireInput,
  type AcquireMode,
} from "./redis-cps-limiter";
import { providerAccount, type ProviderAccountRef } from "./provider-account";
import type { TrafficLevel } from "./traffic-class";

/**
 * The pacing script against a real Redis (CPS-004), through several
 * independent connections that stand in for API replicas and workers.
 *
 * Opt in with a disposable server:
 *   RINGEE_CPS_TEST_REDIS_URL=redis://127.0.0.1:<port>
 * Without it the suite is skipped, as the PostgreSQL suites are. It only ever
 * uses keys of a per-test account, and never FLUSHes anything but the database
 * it was pointed at.
 */
const url = process.env.RINGEE_CPS_TEST_REDIS_URL;
const suite = url ? describe : describe.skip;

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const account = (): ProviderAccountRef =>
  providerAccount("telnyx", `t-${randomUUID().slice(0, 8)}`);

interface Replica {
  limiter: RedisCpsLimiter;
  redis: RedisService;
  close: () => void;
}

suite("outbound pacing on a real Redis", () => {
  const replicas: Replica[] = [];

  async function replica(): Promise<Replica> {
    const client = await connectRedisClient(url);
    const redis = new RedisService(client as never);
    let closed = false;
    const made = {
      limiter: new RedisCpsLimiter(redis),
      redis,
      // A test may close a replica to model a process dying; teardown then
      // closes it again.
      close: () => {
        if (closed) return;
        closed = true;
        client.destroy();
      },
    };
    replicas.push(made);
    return made;
  }

  afterAll(() => replicas.forEach((r) => r.close()));

  const input = (
    acct: ProviderAccountRef,
    level: TrafficLevel,
    extra: Partial<AcquireInput> = {},
  ): AcquireInput => ({
    account: acct,
    level,
    mode: "acquire",
    levelIntervalsMicros: limits.levelIntervalsMicros,
    workspaceKey: null,
    workspaceIntervalMicros: limits.orgIntervalMicros,
    automationGuardMicros: limits.automationGuardMicros,
    overageHorizonMicros: limits.overageHorizonMicros,
    countAttempt: true,
    ...extra,
  });

  /** Largest number of grants in a closed one-second window. */
  const worstWindow = (grantsMicros: number[], window = 1_000_000) => {
    const sorted = [...grantsMicros].sort((a, b) => a - b);
    let worst = 0;
    for (let i = 0; i < sorted.length; i++) {
      let count = 0;
      for (let j = i; j < sorted.length && sorted[j] - sorted[i] <= window; j++)
        count++;
      worst = Math.max(worst, count);
    }
    return worst;
  };

  describe("the script is the model", () => {
    it("decides exactly as the pure GCRA does, over a random mix of operations", async () => {
      const { limiter } = await replica();
      const acct = account();
      // Short spacings so a few seconds see many grants, refusals and expiries.
      const intervals: [number, number, number, number] = [
        20_000, 26_000, 32_000, 40_000,
      ];
      const guard = 2_000;
      const horizon = 100_000;
      const workspaceInterval = 50_000;
      const model = new PacingClocks();
      let seed = 1234;
      const random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 2 ** 32;
      };
      const workspaces = [null, "org:a", "user:b"] as const;
      let grants = 0;
      let refusals = 0;

      for (let step = 0; step < 500; step++) {
        const level = Math.floor(random() * 4) as TrafficLevel;
        const workspaceKey =
          level >= 1 ? workspaces[Math.floor(random() * 3)] : null;
        const pick = random();
        const mode: AcquireMode =
          pick < 0.15 ? "peek" : pick < 0.25 ? "force" : "acquire";
        const result = await limiter.acquire({
          ...input(acct, level, { mode, workspaceKey }),
          levelIntervalsMicros: intervals,
          workspaceIntervalMicros: workspaceInterval,
          automationGuardMicros: guard,
          overageHorizonMicros: horizon,
        });
        const request: PacingRequest = {
          level,
          levelIntervalsMicros: intervals,
          workspaceKey,
          workspaceIntervalMicros: workspaceInterval,
          automationGuardMicros: guard,
          overageHorizonMicros: mode === "force" ? horizon : 0,
        };
        if (mode === "peek") {
          const expected = model.peek(request, result.nowMicros);
          expect(result.granted).toBe(expected.granted);
          expect(result.retryAfterMicros).toBe(expected.retryAfterMicros);
          if (!expected.granted)
            expect(result.blockedBy).toBe(expected.blockedBy);
        } else if (mode === "force") {
          expect(result.granted).toBe(true);
          model.advance(request, result.nowMicros);
        } else {
          const expected = model.acquire(request, result.nowMicros);
          expect(result.granted).toBe(expected.granted);
          expect(result.retryAfterMicros).toBe(expected.retryAfterMicros);
          if (!expected.granted)
            expect(result.blockedBy).toBe(expected.blockedBy);
        }
        if (result.granted) grants++;
        else refusals++;
        if (random() < 0.3) await sleep(Math.floor(random() * 40));
      }
      // Both outcomes were exercised, or the comparison proved little.
      expect(grants).toBeGreaterThan(100);
      expect(refusals).toBeGreaterThan(100);
    }, 60_000);
  });

  describe("across replicas", () => {
    it("grants exactly one of 100 simultaneous requests: there is no burst", async () => {
      const six = await Promise.all(Array.from({ length: 6 }, () => replica()));
      const acct = account();
      const results = await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          six[i % 6].limiter.acquire(input(acct, 0)),
        ),
      );
      expect(results.filter((r) => r.granted)).toHaveLength(1);
      // Everyone else is told when to come back, never more than one interval.
      for (const refused of results.filter((r) => !r.granted)) {
        expect(refused.retryAfterMicros).toBeGreaterThan(0);
        expect(refused.retryAfterMicros).toBeLessThanOrEqual(250_000);
      }
    });

    it("grants at most one per interval for 1,000 simultaneous automated requests", async () => {
      const eight = await Promise.all(
        Array.from({ length: 8 }, () => replica()),
      );
      const acct = account();
      const results = await Promise.all(
        Array.from({ length: 1_000 }, (_, i) =>
          eight[i % 8].limiter.acquire(
            input(acct, 3, { workspaceKey: `org:${i % 10}` }),
          ),
        ),
      );
      expect(results.filter((r) => r.granted)).toHaveLength(1);
    });

    it("never exceeds the ceiling in any one-second window, from many replicas for 4 s", async () => {
      const crew = await Promise.all(
        Array.from({ length: 6 }, () => replica()),
      );
      const acct = account();
      const granted: number[] = [];
      const stopAt = Date.now() + 4_000;
      await Promise.all(
        crew.map(async (member, index) => {
          while (Date.now() < stopAt) {
            const level = (index % 4) as TrafficLevel;
            const workspaceKey = level >= 1 ? `org:${index}` : null;
            const result = await member.limiter.acquire(
              input(acct, level, { workspaceKey }),
            );
            if (result.granted) granted.push(result.nowMicros);
            else await sleep(Math.max(1, result.retryAfterMicros / 1000));
          }
        }),
      );
      expect(granted.length).toBeGreaterThan(5);
      // Redis's own timestamps: grants of the level-0 clock are one interval apart.
      const sorted = [...granted].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(250_000);
      }
      expect(worstWindow(sorted)).toBeLessThanOrEqual(5);

      // And the counters the script wrote agree: no aligned second above 4.
      const { counts } = await crew[0].limiter.recentSeconds(acct, 30);
      expect(Math.max(...counts)).toBeLessThanOrEqual(4);
      expect(counts.reduce((a, b) => a + b, 0)).toBe(granted.length);
    }, 30_000);

    it("keeps the interval across a window edge: five at the end plus five at the start cannot happen", async () => {
      const { limiter } = await replica();
      const acct = account();
      // Hammer a clock for just over two second boundaries.
      const granted: number[] = [];
      const stopAt = Date.now() + 2_600;
      while (Date.now() < stopAt) {
        const result = await limiter.acquire(input(acct, 0));
        if (result.granted) granted.push(result.nowMicros);
        else await sleep(Math.max(1, result.retryAfterMicros / 1000));
      }
      const perSecond = new Map<number, number>();
      for (const at of granted) {
        const second = Math.floor(at / 1_000_000);
        perSecond.set(second, (perSecond.get(second) ?? 0) + 1);
      }
      expect(Math.max(...perSecond.values())).toBeLessThanOrEqual(4);
      expect(worstWindow(granted)).toBeLessThanOrEqual(5);
    }, 20_000);
  });

  describe("traffic classes", () => {
    it("never makes a person wait more than one interval behind saturating automation", async () => {
      const crew = await Promise.all(
        Array.from({ length: 4 }, () => replica()),
      );
      const [personReplica] = crew;
      const acct = account();
      const stopAt = Date.now() + 4_000;
      let automated = 0;
      const waits: number[] = [];

      const automation = crew.slice(1).map(async (member, index) => {
        const level = (index + 1) as TrafficLevel;
        while (Date.now() < stopAt) {
          const result = await member.limiter.acquire(
            input(acct, level, { workspaceKey: `org:${index}` }),
          );
          if (result.granted) automated++;
          else await sleep(Math.max(1, result.retryAfterMicros / 1000));
        }
      });
      const people = (async () => {
        // A person arrives about every 700 ms, retrying exactly when told.
        while (Date.now() < stopAt - 600) {
          await sleep(500 + Math.floor(Math.random() * 400));
          const started = Date.now();
          for (;;) {
            const result = await personReplica.limiter.acquire(input(acct, 0));
            if (result.granted) break;
            await sleep(Math.max(0, result.retryAfterMicros / 1000));
          }
          waits.push(Date.now() - started);
        }
      })();
      await Promise.all([...automation, people]);

      expect(waits.length).toBeGreaterThan(3);
      expect(automated).toBeGreaterThan(5);
      // One interval is 250 ms; allow scheduling noise of a test process.
      expect(Math.max(...waits)).toBeLessThan(400);
    }, 30_000);

    it("holds automation under its share and leaves the rest to people", async () => {
      const { limiter } = await replica();
      const acct = account();
      const granted: number[] = [];
      const stopAt = Date.now() + 4_000;
      while (Date.now() < stopAt) {
        const result = await limiter.acquire(input(acct, 1));
        if (result.granted) granted.push(result.nowMicros);
        else await sleep(Math.max(1, result.retryAfterMicros / 1000));
      }
      // Level 1 tops out at 3 CPS of the 4 available.
      const seconds = (granted[granted.length - 1] - granted[0]) / 1_000_000;
      expect((granted.length - 1) / seconds).toBeLessThanOrEqual(3.05);
    }, 20_000);

    it("lets a person through when the clock is busy, counting an overage", async () => {
      const { limiter, redis } = await replica();
      const acct = account();
      expect((await limiter.acquire(input(acct, 0))).granted).toBe(true);
      const refused = await limiter.acquire(input(acct, 0));
      expect(refused.granted).toBe(false);

      const forced = await limiter.acquire(input(acct, 0, { mode: "force" }));
      expect(forced.granted).toBe(true);
      expect(forced.overage).toBe(true);

      // The forced grant is paid back: the next regular one waits for both.
      const after = await limiter.acquire(input(acct, 0));
      expect(after.granted).toBe(false);
      expect(after.retryAfterMicros).toBeGreaterThan(250_000);

      const hour = await limiter.readHour(acct, Date.now());
      expect(hour.overage).toBe(1);
      void redis;
    });
  });

  describe("workspaces", () => {
    it("holds one workspace to its own automated rate while another proceeds", async () => {
      const { limiter } = await replica();
      const acct = account();
      const slowWorkspace = {
        workspaceKey: "org:noisy",
        workspaceIntervalMicros: 500_000,
        levelIntervalsMicros: [1_000, 1_000, 1_000, 1_000] as [
          number,
          number,
          number,
          number,
        ],
        automationGuardMicros: 0,
      };
      expect(
        (await limiter.acquire(input(acct, 3, slowWorkspace))).granted,
      ).toBe(true);
      const again = await limiter.acquire(input(acct, 3, slowWorkspace));
      expect(again.granted).toBe(false);
      expect(again.blockedBy).toBe("workspace");
      // Another workspace is unaffected by the noisy one's clock.
      await sleep(5);
      const quiet = await limiter.acquire(
        input(acct, 3, { ...slowWorkspace, workspaceKey: "org:quiet" }),
      );
      expect(quiet.granted).toBe(true);
    });

    it("keeps a person's workspace and an organization of the same id apart", async () => {
      const { limiter } = await replica();
      const acct = account();
      const base = {
        workspaceIntervalMicros: 5_000_000,
        levelIntervalsMicros: [1_000, 1_000, 1_000, 1_000] as [
          number,
          number,
          number,
          number,
        ],
        automationGuardMicros: 0,
      };
      expect(
        (
          await limiter.acquire(
            input(acct, 1, { ...base, workspaceKey: "user:x" }),
          )
        ).granted,
      ).toBe(true);
      await sleep(5);
      expect(
        (
          await limiter.acquire(
            input(acct, 1, { ...base, workspaceKey: "org:x" }),
          )
        ).granted,
      ).toBe(true);
      expect(
        (
          await limiter.acquire(
            input(acct, 1, { ...base, workspaceKey: "user:x" }),
          )
        ).granted,
      ).toBe(false);
    });

    it("gives each billing account a budget of its own", async () => {
      const { limiter } = await replica();
      const a = account();
      const b = account();
      expect((await limiter.acquire(input(a, 0))).granted).toBe(true);
      expect((await limiter.acquire(input(b, 0))).granted).toBe(true);
      expect((await limiter.acquire(input(a, 0))).granted).toBe(false);
    });
  });

  describe("modes", () => {
    it("peek reports without spending anything", async () => {
      const { limiter } = await replica();
      const acct = account();
      for (let i = 0; i < 20; i++)
        expect(
          (await limiter.acquire(input(acct, 0, { mode: "peek" }))).granted,
        ).toBe(true);
      expect((await limiter.acquire(input(acct, 0))).granted).toBe(true);
      expect(
        (await limiter.acquire(input(acct, 0, { mode: "peek" }))).granted,
      ).toBe(false);
    });

    it("observe never refuses, counts what enforcement would have deferred, and spends nothing then", async () => {
      const { limiter } = await replica();
      const acct = account();
      const first = await limiter.acquire(input(acct, 3, { mode: "observe" }));
      expect(first.granted).toBe(true);
      expect(first.wouldDefer).toBe(false);
      const shadow = await limiter.acquire(input(acct, 3, { mode: "observe" }));
      expect(shadow.granted).toBe(true);
      expect(shadow.wouldDefer).toBe(true);

      const hour = await limiter.readHour(acct, Date.now());
      expect(hour.attempts).toBe(2);
      expect(hour.would_defer_l3).toBe(1);
      // The refused-in-shadow request did not push the clock further out.
      const real = await limiter.acquire(input(acct, 3));
      expect(real.retryAfterMicros).toBeLessThanOrEqual(500_000);
    });
  });

  describe("idempotency and statistics", () => {
    it("spends one grant for a retried command", async () => {
      const { limiter } = await replica();
      const acct = account();
      const first = await limiter.acquire(
        input(acct, 0, { idempotencyRef: "inbound-endpoint-attempt-1" }),
      );
      expect(first.granted).toBe(true);
      expect(first.reused).toBe(false);
      const retry = await limiter.acquire(
        input(acct, 0, { idempotencyRef: "inbound-endpoint-attempt-1" }),
      );
      expect(retry.granted).toBe(true);
      expect(retry.reused).toBe(true);
      // The retry moved no clock and counted nothing.
      const next = await limiter.acquire(input(acct, 0));
      expect(next.granted).toBe(false);
      expect(next.retryAfterMicros).toBeLessThanOrEqual(250_000);
      const hour = await limiter.readHour(acct, Date.now());
      expect(hour.attempts).toBe(1);
    });

    it("a different command is a different grant", async () => {
      const { limiter } = await replica();
      const acct = account();
      await limiter.acquire(input(acct, 0, { idempotencyRef: "a" }));
      await sleep(260);
      const other = await limiter.acquire(
        input(acct, 0, { idempotencyRef: "b" }),
      );
      expect(other.reused).toBe(false);
      expect(other.granted).toBe(true);
    });

    it("counts attempts per second and records the hourly peak", async () => {
      const { limiter } = await replica();
      const acct = account();
      const fast: Partial<AcquireInput> = {
        levelIntervalsMicros: [1_000, 1_000, 1_000, 1_000],
      };
      await Promise.all(
        Array.from({ length: 3 }, (_, i) =>
          sleep(i).then(() => limiter.acquire(input(acct, 0, fast))),
        ),
      );
      const hour = await limiter.readHour(acct, Date.now());
      expect(hour.attempts).toBeGreaterThanOrEqual(1);
      expect(hour.peak).toBeGreaterThanOrEqual(1);
      expect(hour.peak).toBeLessThanOrEqual(hour.attempts);
      expect(hour.l0).toBe(hour.attempts);
    });

    it("does not count a pre-flight that the browser will dial later", async () => {
      const { limiter } = await replica();
      const acct = account();
      await limiter.acquire(input(acct, 0, { countAttempt: false }));
      const hour = await limiter.readHour(acct, Date.now());
      expect(hour.attempts ?? 0).toBe(0);
    });

    it("counts an observed leg once, however often its webhook is redelivered", async () => {
      const { limiter } = await replica();
      const acct = account();
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          limiter.record(
            acct,
            { observed: 1 },
            { countAttempt: true, dedupeRef: "obs:call-1" },
          ),
        ),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
      const hour = await limiter.readHour(acct, Date.now());
      expect(hour.attempts).toBe(1);
      expect(hour.observed).toBe(1);
    });

    it("records outcomes without counting a second attempt", async () => {
      const { limiter } = await replica();
      const acct = account();
      await limiter.acquire(input(acct, 0));
      await limiter.record(acct, { accepted: 1 });
      await limiter.record(acct, { rejected: 2, ambiguous: 1 });
      const hour = await limiter.readHour(acct, Date.now());
      expect(hour).toMatchObject({
        attempts: 1,
        accepted: 1,
        rejected: 2,
        ambiguous: 1,
      });
    });

    it("refuses a statistics field that is not a plain name", async () => {
      const { limiter } = await replica();
      await expect(
        limiter.record(account(), { "bad field;": 1 }),
      ).rejects.toThrow(/Invalid statistics field/);
    });

    it("keeps every key of an account under one hash tag and gives all of them an expiry", async () => {
      const { limiter, redis } = await replica();
      const acct = account();
      await limiter.acquire(
        input(acct, 3, { workspaceKey: "org:z", idempotencyRef: "x" }),
      );
      const keys = RedisCpsLimiter.keys(acct);
      const tag = keys.level(0).match(/\{[^}]+\}/)![0];
      for (const key of [
        keys.level(0),
        keys.level(3),
        keys.workspace("org:z"),
        keys.idempotency("x"),
        keys.hour(Date.now()),
      ]) {
        expect(key).toContain(tag);
        expect(await redis.ttlSeconds(key)).toBeGreaterThan(0);
      }
      const hourStart = Math.floor(Date.now() / 3_600_000) * 3_600_000;
      expect(await redis.ttlSeconds(keys.hour(hourStart))).toBeGreaterThan(
        24 * 3600,
      );
    });
  });

  describe("restarts", () => {
    it("a fresh process keeps pacing where the last one stopped: state is in Redis, not in memory", async () => {
      const acct = account();
      const before = await replica();
      expect((await before.limiter.acquire(input(acct, 0))).granted).toBe(true);
      before.close();
      const after = await replica();
      const right = await after.limiter.acquire(input(acct, 0));
      expect(right.granted).toBe(false);
    });

    it("if Redis itself restarts empty, at most one extra grant lands in one second", async () => {
      const client = await connectRedisClient(url);
      const redis = new RedisService(client as never);
      const limiter = new RedisCpsLimiter(redis);
      const acct = account();
      const granted: number[] = [];
      const stopAt = Date.now() + 2_400;
      let flushed = false;
      try {
        while (Date.now() < stopAt) {
          const result = await limiter.acquire(input(acct, 0));
          if (result.granted) granted.push(result.nowMicros);
          else await sleep(Math.max(1, result.retryAfterMicros / 1000));
          if (!flushed && Date.now() > stopAt - 1_200) {
            // The failure: every clock is lost, as after a restart without
            // persistence. Only this test's database is touched.
            await (
              client as unknown as { flushDb: () => Promise<string> }
            ).flushDb();
            flushed = true;
          }
        }
      } finally {
        client.destroy();
      }
      expect(flushed).toBe(true);
      // Strict pacing plus the safety margin absorb the one grant that the
      // reset can add: the ceiling of 5 still holds in any second.
      expect(worstWindow(granted)).toBeLessThanOrEqual(5);
    }, 20_000);
  });

  describe("the reply is checked", () => {
    it("rejects a reply that is not what the script returns", async () => {
      const broken = new RedisCpsLimiter({
        runScript: async () => "OK",
        hashGetAll: async () => ({}),
      });
      await expect(broken.acquire(input(account(), 0))).rejects.toThrow(
        /Unexpected reply/,
      );
    });
  });
});
