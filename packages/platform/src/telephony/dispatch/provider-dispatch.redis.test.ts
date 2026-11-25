import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { connectRedisClient } from "../../redis/redis-client";
import { RedisService } from "../../redis/redis.service";
import { baselineSettings, type DispatchSettings } from "./dispatch-settings";
import { RedisCpsLimiter } from "./redis-cps-limiter";
import {
  RingeeManagedAccountResolver,
  providerAccount,
  type ProviderAccountRef,
} from "./provider-account";
import {
  DispatchRuntime,
  ProviderDispatchService,
} from "./provider-dispatch.service";
import type { DispatchDecision, DispatchRequest } from "./dispatch.types";
import type { DispatchSource } from "./traffic-class";

vi.mock("@ringee/configuration", () => ({ apiConfiguration: {} }));

/**
 * The shared outbound budget, end to end, through the real service on a real
 * Redis and several independent connections that stand in for backend replicas
 * and Temporal workers (CPS-001..CPS-007). Nothing here reaches a telephony
 * provider: a grant is only a number written to Redis.
 *
 * Opt in with RINGEE_CPS_TEST_REDIS_URL=redis://127.0.0.1:<port>.
 */
const url = process.env.RINGEE_CPS_TEST_REDIS_URL;
const suite = url ? describe : describe.skip;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const settings = (
  overrides: Partial<DispatchSettings> = {},
): DispatchSettings => ({
  ...baselineSettings({
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
  ...overrides,
});

interface Replica {
  service: ProviderDispatchService;
  dial: (request: DispatchRequest) => Promise<DispatchDecision>;
  limiter: RedisCpsLimiter;
  redis: RedisService;
  close: () => void;
}

suite("outbound pacing through the service, on a real Redis", () => {
  const open: Replica[] = [];

  async function replica(
    account: ProviderAccountRef,
    overrides: Partial<DispatchSettings> = {},
  ): Promise<Replica> {
    const client = await connectRedisClient(url);
    const redis = new RedisService(client as never);
    const service = new ProviderDispatchService(redis, new DispatchRuntime(), {
      baseline: settings(overrides),
      resolver: new RingeeManagedAccountResolver(account.key),
    });
    // Existing, recovered Redis state. Cold-state recovery is tested separately.
    await redis.runScript(
      "return redis.call('SET', KEYS[1], '0', 'PX', 61000, 'NX')",
      [`${RedisCpsLimiter.keys(account).level(0)}:egress`],
      [],
    );
    let closed = false;
    const made = {
      service,
      dial: async (request: DispatchRequest): Promise<DispatchDecision> => {
        const result = await service.admit(request);
        if (result.granted)
          await service.runWithPermit(result.permit, async () => {
            const egress = await service.beginEgress("POST", "/calls");
            egress?.accepted();
          });
        return result;
      },
      limiter: new RedisCpsLimiter(redis),
      redis,
      close: () => {
        if (closed) return;
        closed = true;
        client.destroy();
      },
    };
    open.push(made);
    return made;
  }

  afterAll(() => open.forEach((r) => r.close()));

  const newAccount = () =>
    providerAccount("telnyx", `s-${randomUUID().slice(0, 8)}`);

  /** Aligned-second counts of attempts the script recorded, last 60 s. */
  const perSecond = async (r: Replica, account: ProviderAccountRef) => {
    const { counts } = await r.limiter.recentSeconds(account, 60);
    return counts;
  };

  describe("simultaneous requests", () => {
    it("100 simultaneous outbound requests: one grant, the rest told when to retry", async () => {
      const account = newAccount();
      const crew = await Promise.all(
        Array.from({ length: 5 }, () => replica(account)),
      );
      const sources: DispatchSource[] = [
        "agent_api",
        "agent_mcp",
        "agent_automation",
        "agent_reminder",
      ];
      const decisions = await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          crew[i % 5].dial({
            source: sources[i % 4],
            workspace: { userId: `u${i % 7}`, organizationId: `o${i % 7}` },
            maxWaitMs: 0,
          }),
        ),
      );
      expect(decisions.filter((d) => d.granted)).toHaveLength(1);
      for (const decision of decisions) {
        if (!decision.granted) {
          expect(decision.retryAfterMs).toBeGreaterThan(0);
          expect(decision.retryAfterMs).toBeLessThanOrEqual(600);
        }
      }
      expect(Math.max(...(await perSecond(crew[0], account)))).toBe(1);
    });

    it("1,000 simultaneous n8n requests from 10 organizations: still one grant, nothing thrown", async () => {
      const account = newAccount();
      const crew = await Promise.all(
        Array.from({ length: 8 }, () => replica(account)),
      );
      const decisions = await Promise.all(
        Array.from({ length: 1_000 }, (_, i) =>
          crew[i % 8].dial({
            source: "agent_api",
            workspace: { userId: `u${i % 10}`, organizationId: `o${i % 10}` },
            maxWaitMs: 0,
          }),
        ),
      );
      expect(decisions.filter((d) => d.granted)).toHaveLength(1);
      expect(decisions.filter((d) => !d.granted)).toHaveLength(999);
    }, 30_000);
  });

  describe("sustained load", () => {
    it("ten organizations at five attempts per second each never exceed the shared budget", async () => {
      const account = newAccount();
      const crew = await Promise.all(
        Array.from({ length: 5 }, () => replica(account)),
      );
      const grantedAt: number[] = [];
      const stopAt = Date.now() + 5_000;

      // Fifty attempts per second in all: ten workspaces, one attempt every
      // 200 ms each. Every attempt is tried once now and, if deferred, is the
      // caller's to retry later — as the queue does — so it tries again after
      // the retry hint.
      await Promise.all(
        Array.from({ length: 10 }, async (_, org) => {
          const member = crew[org % 5];
          while (Date.now() < stopAt) {
            const decision = await member.dial({
              source: "agent_api",
              workspace: { userId: `u${org}`, organizationId: `o${org}` },
              maxWaitMs: 0,
            });
            if (decision.granted) grantedAt.push(Date.now());
            await sleep(
              decision.granted ? 200 : Math.max(50, decision.retryAfterMs),
            );
          }
        }),
      );

      const counts = await perSecond(crew[0], account);
      // Background work tops out at 2 CPS however many organizations ask.
      expect(Math.max(...counts)).toBeLessThanOrEqual(2);
      expect(counts.reduce((a, b) => a + b, 0)).toBe(grantedAt.length);
      // ...and it was not throttled to nothing: the budget was used.
      expect(grantedAt.length).toBeGreaterThanOrEqual(7);
      expect(grantedAt.length).toBeLessThanOrEqual(13);
    }, 30_000);

    it("every class at once, from many replicas, stays inside the account ceiling", async () => {
      const account = newAccount();
      const crew = await Promise.all(
        Array.from({ length: 6 }, () => replica(account)),
      );
      const sources: DispatchRequest["source"][] = [
        "web_dial",
        "agent_reminder",
        "progressive_dial",
        "agent_api",
        "inbound_ring",
        "agent_mcp",
      ];
      const people = new Set<DispatchRequest["source"]>([
        "web_dial",
        "inbound_ring",
      ]);
      const stopAt = Date.now() + 5_000;
      let overages = 0;
      await Promise.all(
        crew.map(async (member, i) => {
          while (Date.now() < stopAt) {
            const decision = await member.dial({
              source: sources[i],
              workspace: { userId: `u${i}`, organizationId: `o${i}` },
              maxWaitMs: people.has(sources[i]) ? undefined : 100,
            });
            if (decision.granted && decision.permit.overage) overages++;
            // A person dials a few times a second at most; automation retries
            // as soon as it is told it may.
            await sleep(
              people.has(sources[i])
                ? 350
                : decision.granted
                  ? 10
                  : Math.max(20, decision.retryAfterMs),
            );
          }
        }),
      );
      const counts = await perSecond(crew[0], account);
      const total = counts.reduce((a, b) => a + b, 0);
      expect(overages).toBe(0);
      expect(Math.max(...counts)).toBeLessThanOrEqual(4);
      expect(total).toBeGreaterThan(10);
    }, 30_000);

    it("SIP-like and Voice API-like traffic share one account budget", async () => {
      const account = newAccount();
      const [sip, voiceApi] = await Promise.all([
        replica(account),
        replica(account),
      ]);
      const stopAt = Date.now() + 4_000;
      const waits: number[] = [];
      // Legs a person is on the line for (a carrier bridge, a desk phone): one
      // every 400 ms, each waiting its turn like a person would.
      const legs = async (source: DispatchSource) => {
        while (Date.now() < stopAt - 500) {
          const decision = await sip.dial({ source });
          if (decision.granted) waits.push(decision.waitedMs);
          await sleep(400);
        }
      };
      // Programmable Voice and TeXML automation, as fast as it is allowed.
      const automation = async (source: DispatchSource) => {
        while (Date.now() < stopAt) {
          const decision = await voiceApi.dial({
            source,
            workspace: { userId: "u", organizationId: "o" },
            maxWaitMs: 0,
          });
          await sleep(
            decision.granted ? 5 : Math.max(5, decision.retryAfterMs),
          );
        }
      };
      await Promise.all([
        legs("carrier_bridge"),
        automation("agent_reminder"),
        automation("agent_automation"),
      ]);
      const counts = await perSecond(sip, account);
      expect(Math.max(...counts)).toBeLessThanOrEqual(4);
      expect(counts.reduce((a, b) => a + b, 0)).toBeGreaterThan(8);
      // The legs a person is on were not starved by the automation beside them.
      expect(Math.max(...waits)).toBeLessThan(450);
    }, 30_000);
  });

  describe("manual calls while automation is saturated", () => {
    it("a person's dial waits about one interval at most, however long the queue", async () => {
      const account = newAccount();
      const crew = await Promise.all(
        Array.from({ length: 4 }, () => replica(account)),
      );
      const [person, ...automated] = crew;
      const stopAt = Date.now() + 5_000;
      const sources: DispatchSource[] = [
        "agent_reminder",
        "progressive_dial",
        "agent_api",
      ];

      const saturate = automated.map(async (member, i) => {
        while (Date.now() < stopAt) {
          const decision = await member.dial({
            source: sources[i],
            workspace: { userId: `u${i}`, organizationId: `o${i}` },
            maxWaitMs: 0,
          });
          await sleep(
            decision.granted ? 1 : Math.max(1, decision.retryAfterMs),
          );
        }
      });
      const waits: number[] = [];
      let overages = 0;
      const people = (async () => {
        while (Date.now() < stopAt - 800) {
          await sleep(300 + Math.floor(Math.random() * 400));
          const decision = await person.dial({ source: "web_dial" });
          if (decision.granted) {
            waits.push(decision.waitedMs);
            if (decision.permit.overage) overages++;
          }
        }
      })();
      await Promise.all([...saturate, people]);

      expect(waits.length).toBeGreaterThan(4);
      expect(overages).toBe(0);
      // p100, not p99: one interval is 250 ms, and a test process adds noise.
      expect(Math.max(...waits)).toBeLessThan(450);
      const sorted = [...waits].sort((a, b) => a - b);
      expect(sorted[Math.floor(sorted.length / 2)]).toBeLessThan(260);
    }, 30_000);

    it("ten people clicking in the same instant are all served, in order, and none refused", async () => {
      const account = newAccount();
      const crew = await Promise.all(
        Array.from({ length: 5 }, () => replica(account)),
      );
      const decisions = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          crew[i % 5].dial({ source: "web_dial" }),
        ),
      );
      expect(decisions.every((d) => d.granted)).toBe(true);
      // Ten grants one 250 ms interval apart need about 2.25 s: inside the 3 s
      // a person waits, so nobody was an overage.
      expect(
        decisions.filter((d) => d.granted && d.permit.overage),
      ).toHaveLength(0);
      expect(Math.max(...decisions.map((d) => d.waitedMs))).toBeLessThan(3_000);
    }, 30_000);
  });

  describe("a flood of people", () => {
    it("defers an interactive flood rather than exceeding the shared ceiling", async () => {
      const account = newAccount();
      const member = await replica(account);
      const people = await Promise.all(
        Array.from({ length: 200 }, () =>
          member.dial({ source: "web_dial", maxWaitMs: 0 }),
        ),
      );
      expect(people.filter((d) => d.granted)).toHaveLength(1);
      expect(people.filter((d) => !d.granted)).toHaveLength(199);
      expect(people.some((d) => d.granted && d.permit.overage)).toBe(false);
    }, 30_000);
  });

  describe("billing accounts", () => {
    it("two credentials of one account share one budget; another account has its own", async () => {
      const shared = newAccount();
      const other = newAccount();
      const [first, second, apart] = await Promise.all([
        replica(shared),
        replica(shared),
        replica(other),
      ]);
      const a = await first.dial({ source: "agent_api", maxWaitMs: 0 });
      const b = await second.dial({ source: "agent_api", maxWaitMs: 0 });
      const c = await apart.dial({ source: "agent_api", maxWaitMs: 0 });
      expect(a.granted).toBe(true);
      expect(b.granted).toBe(false);
      // A customer-managed carrier account is a budget of its own: one
      // customer's traffic never spends another account's CPS.
      expect(c.granted).toBe(true);
    });
  });

  describe("restarts and outages", () => {
    it("a process that starts after another stopped keeps pacing where it left off", async () => {
      const account = newAccount();
      const before = await replica(account);
      expect(
        (await before.dial({ source: "agent_api", maxWaitMs: 0 })).granted,
      ).toBe(true);
      before.close();
      const after = await replica(account);
      // A rolling deployment replaces the process, not the budget.
      expect(
        (await after.dial({ source: "agent_api", maxWaitMs: 0 })).granted,
      ).toBe(false);
    });

    it("loses Redis: all new outbound attempts stop safely", async () => {
      const account = newAccount();
      const member = await replica(account, { interactiveMaxWaitMs: 2_000 });
      // It works while Redis is there.
      expect(
        (await member.dial({ source: "agent_api", maxWaitMs: 0 })).granted,
      ).toBe(true);
      member.close();

      const automated = await Promise.all(
        Array.from({ length: 50 }, () =>
          member.dial({ source: "agent_api", maxWaitMs: 0 }),
        ),
      );
      expect(automated.every((d) => !d.granted)).toBe(true);
      expect(
        automated.every(
          (d) => !d.granted && d.reason === "coordination_unavailable",
        ),
      ).toBe(true);

      const people = await Promise.all(
        Array.from({ length: 3 }, () => member.dial({ source: "web_dial" })),
      );
      expect(
        people.every(
          (d) => !d.granted && d.reason === "coordination_unavailable",
        ),
      ).toBe(true);
    }, 30_000);

    it("an hour's counters survive the process that wrote them", async () => {
      const account = newAccount();
      const writer = await replica(account);
      await writer.dial({ source: "web_dial" });
      writer.close();
      const reader = await replica(account);
      const hour = await reader.limiter.readHour(account, Date.now());
      expect(hour.attempts).toBe(1);
      expect(hour.l0).toBe(1);
    });
  });

  describe("egress fencing", () => {
    it("re-paces old permits delayed by database work across replicas", async () => {
      const account = newAccount();
      const crew = await Promise.all(
        Array.from({ length: 3 }, () => replica(account)),
      );
      const permits = [];
      for (let i = 0; i < 8; i++) {
        const decision = await crew[i % 3].service.admit({
          source: "web_dial",
        });
        if (!decision.granted) throw new Error("Expected admission");
        permits.push(decision.permit);
      }
      await sleep(2_100);
      const sent: number[] = [];
      await Promise.all(
        permits.map((permit, i) =>
          crew[i % 3].service.runWithPermit(permit, async () => {
            await crew[i % 3].service.beginEgress("POST", "/calls");
            sent.push(Date.now());
          }),
        ),
      );
      sent.sort((a, b) => a - b);
      for (const start of sent)
        expect(
          sent.filter((at) => at >= start && at < start + 1000).length,
        ).toBeLessThanOrEqual(5);
      expect(
        (await crew[0].limiter.readHour(account, Date.now())).attempts,
      ).toBe(8);
    }, 30_000);

    it("waits a rolling second after coordination state is lost", async () => {
      const account = newAccount();
      const member = await replica(account);
      await member.redis.runScript(
        "return redis.call('DEL', KEYS[1])",
        [`${RedisCpsLimiter.keys(account).level(0)}:egress`],
        [],
      );
      const start = Date.now();
      const result = await member.dial({ source: "web_dial" });
      expect(result.granted).toBe(true);
      expect(Date.now() - start).toBeGreaterThanOrEqual(990);
    }, 10_000);
  });

  describe("shadow mode", () => {
    it("measures what enforcement would defer, without delaying anyone", async () => {
      const account = newAccount();
      const member = await replica(account, { mode: "observe" });
      const decisions = await Promise.all(
        Array.from({ length: 40 }, () =>
          member.dial({
            source: "agent_api",
            workspace: { userId: "u", organizationId: "o" },
          }),
        ),
      );
      expect(decisions.every((d) => d.granted && d.waitedMs < 100)).toBe(true);
      await sleep(50);
      const hour = await member.limiter.readHour(account, Date.now());
      expect(hour.attempts).toBe(40);
      expect(hour.would_defer_l3).toBeGreaterThanOrEqual(30);
    });
  });
});
