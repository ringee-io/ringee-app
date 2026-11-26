/// <reference types="node" />
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  ProviderDispatchDeferredError,
  accountSlot,
  baselineSettings,
  providerAccount,
  type DispatchAlert,
} from "@ringee/platform";
import { DialPacingService } from "./dial-pacing.service";
import { DispatchAlertService } from "./dispatch-alert.service";
import { DispatchMaintenanceService } from "./dispatch-maintenance.service";
import { DispatchQueueService, maskNumber } from "./dispatch-queue.service";
import { DispatchSettingsService } from "./dispatch-settings.service";
import { DispatchStatsService } from "./dispatch-stats.service";

const ACCOUNT = providerAccount("telnyx", "unit-test");
const SLOT = accountSlot(ACCOUNT);
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 11, 10, 15, 30, 0);

/** The effective settings every fake dispatch service reports. */
function settings(overrides: Record<string, unknown> = {}) {
  return {
    mode: "enforce",
    ceilingCps: 5,
    safetyMargin: 0.2,
    surchargeBudgetUsd: 0,
    queueMaxTotal: 100,
    queueEnabled: true,
    pausedClasses: [] as string[],
    queueAgingMs: 60_000,
    classOverrides: {},
    ...overrides,
  };
}

function fakeDispatch(
  options: {
    settings?: Record<string, unknown>;
    hours?: Record<number, Record<string, number>>;
    seconds?: number[];
    redisDown?: boolean;
  } = {},
) {
  const raised: DispatchAlert[] = [];
  const reads: number[] = [];
  const service = {
    getAccount: () => ACCOUNT,
    getDefaultSettings: () =>
      baselineSettings({
        mode: "enforce",
        ceilingCps: 5,
        safetyMargin: 0.2,
        orgAutomationCps: 2,
        queueEnabled: true,
        orgConcurrency: 25,
        queueMaxPerWorkspace: 1000,
        queueMaxTotal: 100,
        queueMaxWaitMinutes: 120,
        surchargeBudgetUsd: 0,
      }),
    invalidated: 0,
    invalidateSettings() {
      this.invalidated++;
    },
    getSettings: async () => ({
      settings: settings(options.settings),
      limits: { effectiveCps: 4 },
      overrides: {},
    }),
    state: async () => ({
      account: ACCOUNT,
      settings: settings(options.settings),
      overrides: {},
      limits: { effectiveCps: 4 },
      breaker: { open: false, failures: 0 },
      counters: { granted: 1 },
    }),
    readHour: async (instantMs: number) => {
      if (options.redisDown) throw new Error("redis down");
      reads.push(Math.floor(instantMs / HOUR) * HOUR);
      return options.hours?.[Math.floor(instantMs / HOUR) * HOUR] ?? {};
    },
    recentSeconds: async () => {
      if (options.redisDown) throw new Error("redis down");
      return { endSecond: 0, counts: options.seconds ?? [] };
    },
    raise: (alert: DispatchAlert) => raised.push(alert),
  };
  return { service, raised, reads };
}

/** In-memory hourly store with the repository's monotonic merge. */
function fakeHours(
  initial: Array<{ hourStart: Date; peakCps: number; attempts: number }> = [],
) {
  const rows = new Map(
    initial.map((row) => [row.hourStart.getTime(), { ...row, counters: {} }]),
  );
  return {
    rows,
    merges: [] as number[],
    async latest() {
      const newest = Math.max(...rows.keys(), -1);
      return newest < 0 ? null : rows.get(newest)!;
    },
    async merge(
      _key: string,
      hourStart: Date,
      next: {
        peakCps: number;
        attempts: number;
        counters: Record<string, number>;
      },
    ) {
      this.merges.push(hourStart.getTime());
      const existing = rows.get(hourStart.getTime());
      rows.set(hourStart.getTime(), {
        hourStart,
        peakCps: Math.max(existing?.peakCps ?? 0, next.peakCps),
        attempts: Math.max(existing?.attempts ?? 0, next.attempts),
        counters: next.counters,
      });
    },
    async listBetween(_key: string, from: Date, to: Date) {
      return [...rows.values()].filter(
        (row) => row.hourStart >= from && row.hourStart < to,
      );
    },
  };
}

describe("DialPacingService", () => {
  it("does nothing where pacing is not wired", async () => {
    await new DialPacingService().paceInteractive("web_dial", { userId: "u" });
  });

  it("paces a person's dial as a direct start, without counting a provider attempt", async () => {
    const asked: unknown[] = [];
    const pacing = new DialPacingService({
      admit: async (request: unknown) => {
        asked.push(request);
        return { granted: true, waitedMs: 120, permit: {} };
      },
    } as never);
    await pacing.paceInteractive("extension_dial", {
      userId: "u",
      organizationId: "o",
    });
    assert.deepEqual(asked, [
      {
        source: "extension_dial",
        workspace: { userId: "u", organizationId: "o" },
        countAttempt: false,
        // The browser dials right after: the grant comes from the same start
        // budget a server-sent leg spends.
        directStart: true,
      },
    ]);
  });

  it("answers 429 only when an administrator chose to defer people", async () => {
    const pacing = new DialPacingService({
      admit: async () => ({
        granted: false,
        reason: "busy",
        retryAfterMs: 900,
        waitedMs: 3000,
      }),
    } as never);
    await assert.rejects(
      pacing.paceInteractive("web_dial", { userId: "u" }),
      (error: unknown) =>
        error instanceof ProviderDispatchDeferredError &&
        error.getStatus() === 429 &&
        error.retryAfterMs === 900,
    );
  });
});

describe("DispatchSettingsService", () => {
  /**
   * `persisted` is what the database holds. The replica's cached settings are
   * deliberately something else (`cached`): every decision must be made on
   * what is stored, never on a copy that may be two seconds old.
   */
  function build(
    persisted: Record<string, unknown> = {},
    cached: Record<string, unknown> = {},
  ) {
    const rows: Record<string, unknown> = { ...persisted };
    const stored: Array<{ values: Record<string, unknown>; by: unknown }> = [];
    const removed: string[][] = [];
    const { service: dispatch } = fakeDispatch({ settings: cached });
    const service = new DispatchSettingsService(
      dispatch as never,
      { setSettingsSource() {} } as never,
      {
        change: async (
          _key: string,
          decide: (stored: Record<string, unknown>) => {
            upsert?: Record<string, unknown>;
            remove?: string[];
          },
          by: unknown,
        ) => {
          const plan = decide({ ...rows });
          if (plan.upsert) {
            stored.push({ values: plan.upsert, by });
            Object.assign(rows, plan.upsert);
          }
          let count = 0;
          if (plan.remove) {
            removed.push(plan.remove);
            for (const key of plan.remove)
              if (key in rows) {
                delete rows[key];
                count++;
              }
          }
          return { removed: count };
        },
        listForAccount: async () => ({ ...rows }),
      } as never,
    );
    return { service, stored, removed, dispatch, rows };
  }

  it("registers the stored overrides as the pacing layer's settings source", async () => {
    let source: (() => Promise<Record<string, unknown>>) | null = null;
    const { service: dispatch } = fakeDispatch();
    const service = new DispatchSettingsService(
      dispatch as never,
      { setSettingsSource: (fn: typeof source) => (source = fn) } as never,
      { listForAccount: async (key: string) => ({ asked: key }) } as never,
    );
    service.onModuleInit();
    assert.deepEqual(await source!(), { asked: SLOT });
  });

  it("stores only what validates, tells the pacing layer, and records who and why", async () => {
    const { service, stored, dispatch } = build();
    await service.update(
      { mode: "observe", pausedClasses: ["background"] },
      { userId: "staff-1", reason: "  paused during an incident  " },
    );
    assert.deepEqual(stored[0].values, {
      mode: "observe",
      pausedClasses: ["background"],
    });
    assert.deepEqual(stored[0].by, {
      userId: "staff-1",
      reason: "paused during an incident",
    });
    assert.equal(dispatch.invalidated, 1);
  });

  it("refuses an invalid or empty change, naming every problem, and stores nothing", async () => {
    const { service, stored } = build();
    await assert.rejects(
      service.update({ ceilingCps: -4, nonsense: true }, { userId: "s" }),
      (error: unknown) =>
        error instanceof BadRequestException &&
        JSON.stringify(error.getResponse()).includes("nonsense"),
    );
    await assert.rejects(
      service.update({}, { userId: "s" }),
      BadRequestException,
    );
    assert.deepEqual(stored, []);
  });

  it("makes raising the ceiling above the free 5 CPS an explicit, explained decision", async () => {
    const { service, stored } = build();
    await assert.rejects(
      service.update(
        { ceilingCps: 10 },
        { userId: "s", reason: "more volume" },
      ),
      (error: unknown) => {
        assert.ok(error instanceof BadRequestException);
        const body = error.getResponse() as {
          code: string;
          exposureUsdPerMonth: number;
          message: string;
        };
        assert.equal(body.code, "ceiling_increase_needs_confirmation");
        // 5 CPS above the free 5, at $12 each.
        assert.equal(body.exposureUsdPerMonth, 60);
        assert.match(body.message, /billed|bills/);
        return true;
      },
    );
    // Confirmed but unexplained is still refused.
    await assert.rejects(
      service.update(
        { ceilingCps: 10 },
        { userId: "s", reason: "ok", confirmCeilingIncrease: true },
      ),
      BadRequestException,
    );
    assert.deepEqual(stored, []);

    await service.update(
      { ceilingCps: 10 },
      {
        userId: "s",
        reason: "Black Friday campaign volume",
        confirmCeilingIncrease: true,
      },
    );
    assert.equal(
      (stored as Array<{ values: Record<string, unknown> }>)[0].values
        .ceilingCps,
      10,
    );
  });

  it("lets the ceiling go down, or stay at or under the free CPS, without ceremony", async () => {
    const { service, stored } = build({ ceilingCps: 8 });
    await service.update({ ceilingCps: 5 }, { userId: "s" });
    await service.update({ ceilingCps: 3 }, { userId: "s" });
    assert.equal(stored.length, 2);
  });

  it("asks for nothing when the stored ceiling does not change", async () => {
    const { service, stored } = build({ ceilingCps: 8 });
    await service.update({ ceilingCps: 8 }, { userId: "s" });
    assert.equal(stored.length, 1);
  });

  it("judges a raise against the stored ceiling, not a stale cached one", async () => {
    // Another replica lowered the ceiling to 5 a moment ago; this replica's
    // cache still says 10. Sending 10 again is a raise from 5.
    const { service, stored } = build({ ceilingCps: 5 }, { ceilingCps: 10 });
    await assert.rejects(
      service.update({ ceilingCps: 10 }, { userId: "s" }),
      (error: unknown) =>
        error instanceof BadRequestException &&
        (error.getResponse() as { code?: string }).code ===
          "ceiling_increase_needs_confirmation",
    );
    assert.deepEqual(stored, []);
  });

  it("refuses shares that would leave a level no capacity at the stored ceiling", async () => {
    const { service, stored } = build({ ceilingCps: 1, safetyMargin: 0.9 });
    await assert.rejects(
      service.update(
        { classCapFractions: [1, 0.5, 0.25, 0.000001] },
        { userId: "s" },
      ),
      (error: unknown) =>
        error instanceof BadRequestException &&
        JSON.stringify(error.getResponse()).includes("without capacity"),
    );
    assert.deepEqual(stored, []);
  });

  it("resets overrides back to the environment, only for settings that exist", async () => {
    const { service, removed } = build();
    await service.reset(["mode", "pausedClasses"], { userId: "s" });
    assert.deepEqual(removed, [["mode", "pausedClasses"]]);
    await assert.rejects(
      service.reset(["mode", "bogus"], { userId: "s" }),
      BadRequestException,
    );
    await assert.rejects(
      service.reset([], { userId: "s" }),
      BadRequestException,
    );
  });
});

describe("DispatchStatsService", () => {
  const build = (
    fake = fakeDispatch(),
    hours = fakeHours(),
    depth: unknown[] = [],
  ) => ({
    fake,
    hours,
    stats: new DispatchStatsService(
      fake.service as never,
      hours as never,
      {
        depth: async () => depth,
        busiestWorkspaces: async () => [],
        countAmbiguous: async () => 0,
      } as never,
    ),
  });

  it("flushes the hours that have counters, from three days back on a first run", async () => {
    const current = Math.floor(NOW / HOUR) * HOUR;
    const { stats, hours, fake } = build(
      fakeDispatch({
        hours: {
          [current - 2 * HOUR]: { peak: 3, attempts: 40, l3: 40, accepted: 38 },
          [current]: { peak: 4, attempts: 9 },
        },
      }),
    );
    const { flushed } = await stats.rollup(NOW);
    assert.equal(flushed, 2);
    assert.equal(fake.reads.length, 73);
    assert.deepEqual(
      [...hours.rows.values()].map((r) => [r.peakCps, r.attempts]).sort(),
      [
        [3, 40],
        [4, 9],
      ],
    );
    // What is not a peak or a total is kept by name.
    assert.deepEqual(hours.rows.get(current - 2 * HOUR)!.counters, {
      l3: 40,
      accepted: 38,
    });
  });

  it("only re-reads the hour it last stored and the ones since", async () => {
    const current = Math.floor(NOW / HOUR) * HOUR;
    const { stats, fake } = build(
      fakeDispatch({ hours: { [current]: { peak: 2, attempts: 2 } } }),
      fakeHours([
        { hourStart: new Date(current - HOUR), peakCps: 1, attempts: 1 },
      ]),
    );
    await stats.rollup(NOW);
    assert.deepEqual(fake.reads, [current - 2 * HOUR, current - HOUR, current]);
  });

  it("never lowers a stored figure when Redis starts a flush from scratch", async () => {
    const current = Math.floor(NOW / HOUR) * HOUR;
    const { stats, hours } = build(
      fakeDispatch({ hours: { [current]: { peak: 1, attempts: 2 } } }),
      fakeHours([{ hourStart: new Date(current), peakCps: 4, attempts: 90 }]),
    );
    await stats.rollup(NOW);
    assert.equal(hours.rows.get(current)!.peakCps, 4);
    assert.equal(hours.rows.get(current)!.attempts, 90);
  });

  it("estimates a month from the stored hours and the hour in progress, with its caveats", async () => {
    const dec1 = Date.UTC(2026, 11, 1);
    const stored = Array.from({ length: 100 }, (_, i) => ({
      hourStart: new Date(dec1 + i * HOUR),
      peakCps: i < 94 ? 4 : 80,
      attempts: 10,
    }));
    const current = Math.floor(NOW / HOUR) * HOUR;
    const { stats } = build(
      fakeDispatch({ hours: { [current]: { peak: 3, attempts: 5 } } }),
      fakeHours(stored),
    );
    const month = await stats.estimateMonth(2026, 12, NOW);
    assert.equal(month.month, "2026-12");
    assert.equal(month.basis, "ringee_dispatch_measurement");
    // 100 stored hours plus the live one: 101 active; 6 of them at 80.
    assert.equal(month.estimate.activeHours, 101);
    assert.equal(month.estimate.p95, 80);
    assert.equal(month.estimate.surcharge.totalUsd, 1_120);
    assert.equal(month.topHours[0].peakCps, 80);
    assert.ok(month.caveats.some((c) => /not invoice-accurate/i.test(c)));
    assert.ok(
      month.caveats.some((c) =>
        /Telnyx does not publish its percentile/i.test(c),
      ),
    );
  });

  it("leaves out other months and hours with nothing in them", async () => {
    const { stats } = build(
      fakeDispatch(),
      fakeHours([
        {
          hourStart: new Date(Date.UTC(2026, 10, 30, 23)),
          peakCps: 99,
          attempts: 9,
        },
        {
          hourStart: new Date(Date.UTC(2026, 11, 1, 0)),
          peakCps: 0,
          attempts: 0,
        },
        {
          hourStart: new Date(Date.UTC(2026, 11, 1, 1)),
          peakCps: 3,
          attempts: 7,
        },
      ]),
    );
    const month = await stats.estimateMonth(2026, 12, Date.UTC(2026, 11, 20));
    assert.equal(month.estimate.activeHours, 1);
    assert.equal(month.estimate.maxPeakCps, 3);
  });

  it("estimates when the hour in progress cannot be read", async () => {
    const { stats } = build(
      fakeDispatch({ redisDown: true }),
      fakeHours([
        {
          hourStart: new Date(Date.UTC(2026, 11, 1, 1)),
          peakCps: 3,
          attempts: 7,
        },
      ]),
    );
    const month = await stats.estimateMonth(2026, 12, NOW);
    assert.equal(month.estimate.activeHours, 1);
  });

  it("reports a gap as a gap when Redis is down, and still describes the queue", async () => {
    const { stats } = build(fakeDispatch({ redisDown: true }), fakeHours(), [
      { level: 3, queued: 4, oldestQueuedAt: new Date(NOW - 90_000) },
    ]);
    const snapshot = await stats.snapshot(NOW);
    assert.equal(snapshot.live.maxPerSecond, null);
    assert.equal(snapshot.thisHour, null);
    assert.equal(snapshot.queue.total, 4);
    assert.deepEqual(snapshot.queue.byClass[0], {
      class: "background",
      label: "P3",
      queued: 4,
      oldestWaitSeconds: 90,
    });
    assert.equal(snapshot.account, SLOT);
  });

  it("shows live CPS against the ceiling Telnyx bills above", async () => {
    const { stats } = build(fakeDispatch({ seconds: [0, 2, 4, 1, 0] }));
    const snapshot = await stats.snapshot(NOW);
    assert.equal(snapshot.live.maxPerSecond, 4);
    assert.equal(snapshot.live.utilizationOfCeiling, 0.8);
    assert.equal(snapshot.live.averagePerSecond, 1.4);
  });
});

describe("DispatchAlertService", () => {
  interface Setup {
    seconds?: number[];
    hours?: Record<string, number>;
    depth?: Array<{
      level: number;
      queued: number;
      oldestQueuedAt: Date | null;
    }>;
    ambiguous?: number;
    settings?: Record<string, unknown>;
    estimateUsd?: number;
    now?: number;
  }
  function build(setup: Setup = {}) {
    const now = setup.now ?? Date.UTC(2026, 11, 10, 15, 30);
    const current = Math.floor(now / HOUR) * HOUR;
    const fake = fakeDispatch({
      seconds: setup.seconds ?? [1, 2, 1],
      hours: { [current]: setup.hours ?? {} },
      settings: setup.settings,
    });
    const sent: Array<{ to: unknown; subject: string }> = [];
    const alerts = new DispatchAlertService(
      fake.service as never,
      { setAlertSink() {} } as never,
      {
        estimateMonth: async () => ({
          month: "2026-12",
          estimate: {
            p95: 3,
            activeHours: 10,
            hoursToClear: 0,
            surcharge: { totalUsd: setup.estimateUsd ?? 0 },
            surchargeUpper: { totalUsd: setup.estimateUsd ?? 0 },
          },
        }),
      } as never,
      {
        depth: async () => setup.depth ?? [],
        countAmbiguous: async () => setup.ambiguous ?? 0,
      } as never,
      { setIfAbsent: async () => true } as never,
      {
        sendEmail: async (to: unknown, subject: string) => {
          sent.push({ to, subject });
          return { sent: true };
        },
      } as never,
    );
    return { alerts, fake, sent, now };
  }
  const keys = (list: DispatchAlert[]) => list.map((a) => a.key);

  it("raises nothing when everything is calm", async () => {
    const { alerts, now } = build();
    assert.deepEqual(await alerts.evaluate(now), []);
  });

  it("warns when outbound reaches the free CPS and goes critical above it", async () => {
    const warn = build({ seconds: [1, 5, 2] });
    assert.deepEqual(keys(await warn.alerts.evaluate(warn.now)), [
      "cps_near_ceiling",
    ]);
    const critical = build({ seconds: [1, 6, 2] });
    const raised = await critical.alerts.evaluate(critical.now);
    assert.deepEqual(keys(raised), ["cps_above_ceiling"]);
    assert.equal(raised[0].severity, "critical");
  });

  it("goes critical when the estimated surcharge passes the budget, and says it is an estimate", async () => {
    const { alerts, now } = build({
      estimateUsd: 240,
      settings: { surchargeBudgetUsd: 100 },
    });
    const [raised] = await alerts.evaluate(now);
    assert.equal(raised.key, "surcharge_over_budget");
    assert.match(String(raised.detail.basis), /not invoice-accurate/);
    assert.equal(raised.detail.upperUsd, 240);
    const within = build({
      estimateUsd: 240,
      settings: { surchargeBudgetUsd: 500 },
    });
    assert.deepEqual(await within.alerts.evaluate(within.now), []);
  });

  it("reports a queue that waits too long, per level, and one that is nearly full", async () => {
    const now = Date.UTC(2026, 11, 10, 15, 30);
    const { alerts } = build({
      now,
      depth: [
        { level: 2, queued: 10, oldestQueuedAt: new Date(now - 6 * 60_000) },
        { level: 3, queued: 85, oldestQueuedAt: new Date(now - 60_000) },
      ],
    });
    assert.deepEqual(keys(await alerts.evaluate(now)).sort(), [
      "queue_saturated",
      "queue_wait_l2",
    ]);
  });

  it("flags calls committed and never answered, which are not redialed", async () => {
    const { alerts, now } = build({ ambiguous: 2 });
    const [raised] = await alerts.evaluate(now);
    assert.equal(raised.key, "dispatch_in_doubt");
    assert.match(String(raised.detail.note), /not redialed/);
  });

  it("reads provider rejections, bypasses and a delayed person from the hour's counters", async () => {
    const { alerts, now } = build({
      hours: {
        rate_limited: 2,
        dps_rejected: 1,
        bypass: 3,
        w_l0_1000: 1,
        overage: 1,
      },
    });
    assert.deepEqual(keys(await alerts.evaluate(now)).sort(), [
      "interactive_delayed",
      "path_bypassed_limiter",
      "provider_rate_limited",
    ]);
  });

  it("looks at the previous hour too in the first quarter of a new one", async () => {
    const now = Date.UTC(2026, 11, 10, 15, 5);
    const previous = Date.UTC(2026, 11, 10, 14);
    const fake = fakeDispatch({ hours: { [previous]: { rate_limited: 1 } } });
    const alerts = new DispatchAlertService(
      fake.service as never,
      { setAlertSink() {} } as never,
      {
        estimateMonth: async () => ({
          month: "m",
          estimate: { surchargeUpper: { totalUsd: 0 } },
        }),
      } as never,
      { depth: async () => [], countAmbiguous: async () => 0 } as never,
      { setIfAbsent: async () => true } as never,
      { sendEmail: async () => ({}) } as never,
    );
    assert.deepEqual(keys(await alerts.evaluate(now)), [
      "provider_rate_limited",
    ]);
  });

  it("warns when pacing is only watching once Telnyx has started billing, and not before", async () => {
    const after = build({
      settings: { mode: "observe" },
      now: Date.UTC(2026, 11, 2),
    });
    assert.deepEqual(keys(await after.alerts.evaluate(after.now)), [
      "pacing_not_enforced",
    ]);
    const off = build({
      settings: { mode: "off" },
      now: Date.UTC(2026, 11, 2),
    });
    assert.equal((await off.alerts.evaluate(off.now))[0].severity, "critical");
    const before = build({
      settings: { mode: "observe" },
      now: Date.UTC(2026, 10, 20),
    });
    assert.deepEqual(await before.alerts.evaluate(before.now), []);
    const enforcing = build({
      settings: { mode: "enforce" },
      now: Date.UTC(2026, 11, 2),
    });
    assert.deepEqual(await enforcing.alerts.evaluate(enforcing.now), []);
  });

  it("still evaluates what it can when Redis is down", async () => {
    const now = Date.UTC(2026, 11, 10, 15, 30);
    const fake = fakeDispatch({ redisDown: true });
    const alerts = new DispatchAlertService(
      fake.service as never,
      { setAlertSink() {} } as never,
      {
        estimateMonth: async () => ({
          month: "m",
          estimate: { surchargeUpper: { totalUsd: 0 } },
        }),
      } as never,
      { depth: async () => [], countAmbiguous: async () => 3 } as never,
      { setIfAbsent: async () => true } as never,
      { sendEmail: async () => ({}) } as never,
    );
    assert.deepEqual(keys(await alerts.evaluate(now)), ["dispatch_in_doubt"]);
  });

  describe("delivery", () => {
    const alert: DispatchAlert = {
      key: "cps_above_ceiling",
      severity: "critical",
      title: "Outbound reached 6 CPS",
      detail: { maxPerSecondLast5Min: 6, note: "<script>x</script>" },
    };
    const config = apiConfiguration as unknown as Record<string, unknown>;
    const team = config.RINGEE_TEAM_EMAIL;
    before(() => {
      config.RINGEE_TEAM_EMAIL = "team@example.invalid";
    });
    after(() => {
      config.RINGEE_TEAM_EMAIL = team;
    });

    /** A Redis that keeps claims the way `SET NX` and the CAS do. */
    const claims = () => {
      const held = new Map<string, string>();
      return {
        held,
        setIfAbsent: async (key: string, value: string) => {
          if (held.has(key)) return false;
          held.set(key, value);
          return true;
        },
        compareAndSwap: async (
          key: string,
          expected: string,
          next: string | null,
        ) => {
          if (held.get(key) !== expected) return false;
          if (next === null) held.delete(key);
          else held.set(key, next);
          return true;
        },
      };
    };
    const make = (
      redis: Record<string, unknown>,
      results: Array<{ accepted: boolean; retryable?: boolean }>,
      sent: unknown[],
    ) => {
      const alerts = new DispatchAlertService(
        fakeDispatch().service as never,
        { setAlertSink() {} } as never,
        {} as never,
        {} as never,
        redis as never,
        {
          send: async (message: {
            subject: string;
            html: string;
            idempotencyKey?: string;
          }) => {
            sent.push(message);
            const next = results.shift() ?? { accepted: true };
            return next.accepted
              ? { accepted: true, providerEmailId: "e-1" }
              : {
                  accepted: false,
                  error: "provider down",
                  retryable: next.retryable ?? true,
                };
          },
        } as never,
      );
      const slept: number[] = [];
      alerts.sleep = async (ms) => {
        slept.push(ms);
      };
      return { alerts, slept };
    };

    it("emails the team once per cooldown, across every process", async () => {
      const sent: unknown[] = [];
      const redis = claims();
      const { alerts } = make(redis, [], sent);
      await alerts.deliver(alert);
      await alerts.deliver(alert);
      assert.equal(sent.length, 1);
      // The escaping still holds: the detail is data, not markup.
      assert.doesNotMatch((sent[0] as { html: string }).html, /<script>/i);
    });

    it("retries a send the provider failed under its claim, then keeps the hour", async () => {
      const sent: unknown[] = [];
      const redis = claims();
      const { alerts, slept } = make(redis, [{ accepted: false }], sent);
      await alerts.deliver(alert);
      assert.equal(sent.length, 2, "a failure and the retry that went out");
      assert.equal(slept.length, 1);
      // Both tries carry the claim's one key, so a try the provider took
      // without saying so is not emailed twice.
      const [first, retry] = sent as Array<{ idempotencyKey?: string }>;
      assert.ok(first.idempotencyKey);
      assert.equal(retry.idempotencyKey, first.idempotencyKey);
      // Delivered: the claim stays, so the next raise in the hour sends nothing.
      assert.equal(redis.held.size, 1);
      await alerts.deliver(alert);
      assert.equal(sent.length, 2);
    });

    it("hands the claim back when every try fails, so the next raise sends it", async () => {
      const sent: unknown[] = [];
      const redis = claims();
      const failing = Array.from({ length: 3 }, () => ({ accepted: false }));
      const { alerts, slept } = make(redis, failing, sent);
      await alerts.deliver(alert);
      assert.equal(sent.length, 3, "bounded: the first try and two retries");
      assert.deepEqual(slept, [1_000, 4_000]);
      assert.equal(redis.held.size, 0, "the failed send used no cooldown");
      await alerts.deliver(alert);
      assert.equal(sent.length, 4);
      assert.equal(redis.held.size, 1);
    });

    it("hands the claim back through a Redis blip, and gives up after a bounded few", async () => {
      const failing = () =>
        Array.from({ length: 3 }, () => ({ accepted: false }));

      // One error, then Redis answers: the claim is handed back.
      const blip = claims();
      const swap = blip.compareAndSwap;
      let errors = 1;
      blip.compareAndSwap = async (key, expected, next) => {
        if (errors-- > 0) throw new Error("redis blinked");
        return swap(key, expected, next);
      };
      const once = make(blip, failing(), []);
      await once.alerts.deliver(alert);
      assert.equal(blip.held.size, 0, "the claim was handed back");
      assert.deepEqual(once.slept, [1_000, 4_000, 250]);

      // Redis stays down: a bounded few tries, then the claim is left to expire.
      const down = claims();
      let tries = 0;
      down.compareAndSwap = async () => {
        tries++;
        throw new Error("redis down");
      };
      const stuck = make(down, failing(), []);
      await assert.doesNotReject(stuck.alerts.deliver(alert));
      assert.equal(tries, 3);
      assert.equal(down.held.size, 1);
    });

    it("leaves a newer claim of this process alone when a slow failed send hands its own back", async () => {
      const sent: unknown[] = [];
      const down = {
        setIfAbsent: async () => {
          throw new Error("redis down");
        },
        compareAndSwap: async () => {
          throw new Error("redis down");
        },
      };
      // A's three tries fail; B, sent while A waits to retry, goes out.
      const { alerts } = make(
        down,
        [
          { accepted: false },
          { accepted: true },
          { accepted: false },
          { accepted: false },
        ],
        sent,
      );
      let now = NOW;
      alerts.now = () => now;
      let waits = 0;
      alerts.sleep = async () => {
        if (waits++ > 0) return;
        // A's retry waits past the cooldown, and B claims and sends meanwhile.
        now += 3_600_001;
        await alerts.deliver(alert);
      };
      await alerts.deliver(alert);
      assert.equal(sent.length, 4);
      // A handed back only its own claim: B's still holds this hour.
      await alerts.deliver(alert);
      assert.equal(sent.length, 4);
    });

    it("keeps the claim when trying again cannot help", async () => {
      const sent: unknown[] = [];
      const redis = claims();
      const { alerts, slept } = make(
        redis,
        [{ accepted: false, retryable: false }],
        sent,
      );
      await alerts.deliver(alert);
      await alerts.deliver(alert);
      assert.equal(sent.length, 1);
      assert.deepEqual(slept, []);
    });

    it("does not stay silent about Redis being down because Redis is down", async () => {
      const sent: unknown[] = [];
      const down = {
        setIfAbsent: async () => {
          throw new Error("redis down");
        },
        compareAndSwap: async () => {
          throw new Error("redis down");
        },
      };
      const failing = Array.from({ length: 3 }, () => ({ accepted: false }));
      const { alerts } = make(down, failing, sent);
      await assert.doesNotReject(alerts.deliver(alert));
      assert.equal(sent.length, 3);
      // The process's own throttle was handed back too: the next raise tries.
      await alerts.deliver(alert);
      assert.equal(sent.length, 4);
      // ...and once a send went out, it holds the hour in this process.
      await alerts.deliver(alert);
      assert.equal(sent.length, 4);
    });
  });
});

describe("DispatchMaintenanceService", () => {
  it("keeps going when one step fails, and says which did not run", async () => {
    const calls: string[] = [];
    const maintenance = new DispatchMaintenanceService(
      {
        rollup: async () => {
          calls.push("rollup");
          throw new Error('relation "ProviderDispatchHour" does not exist');
        },
      } as never,
      {
        evaluate: async () => {
          calls.push("alerts");
          return [{}, {}];
        },
      } as never,
      {
        expireDue: async () => {
          calls.push("expiry");
          return ["a"];
        },
      } as never,
    );
    const summary = await maintenance.run(NOW);
    assert.deepEqual(calls, ["rollup", "expiry", "alerts"]);
    assert.deepEqual(summary, { flushedHours: null, expired: 1, alerts: 2 });
  });
});

describe("DispatchQueueService pass", () => {
  type Candidate = {
    agentCallId: string;
    workspaceKey: string;
    trafficLevel: number;
    source: string;
    userId: string;
    organizationId: string | null;
    queuedAt: Date;
  };
  const candidate = (id: string, org: string, level = 3): Candidate => ({
    agentCallId: id,
    workspaceKey: `organization:${org}`,
    trafficLevel: level,
    source: "agent_api",
    queuedAt: new Date(1_000_000),
    userId: `u-${org}`,
    organizationId: org,
  });

  function build(options: {
    queue: Candidate[][];
    free?: (id: string) => boolean;
    outcome?: (id: string) => unknown;
    queueEnabled?: boolean;
    mode?: string;
  }) {
    const peeked: string[] = [];
    const dispatched: string[] = [];
    const clock = { now: 1_000_000, slept: [] as number[] };
    let round = 0;
    const waiting = new Set(options.queue.flat().map((c) => c.agentCallId));
    const service = new DispatchQueueService(
      {
        getSettings: async () => ({
          settings: settings({
            queueEnabled: options.queueEnabled ?? true,
            mode: options.mode ?? "enforce",
          }),
        }),
        peek: async (request: { workspace: { organizationId: string } }) => {
          peeked.push(request.workspace.organizationId);
          const free = options.free?.(request.workspace.organizationId) ?? true;
          return free
            ? { free: true, retryAfterMs: 0 }
            : { free: false, retryAfterMs: 400, reason: "busy" };
        },
      } as never,
      {
        expireDue: async () => [],
        peekCandidates: async () =>
          (
            options.queue[Math.min(round++, options.queue.length - 1)] ?? []
          ).filter((c) => waiting.has(c.agentCallId)),
        depth: async () => [
          { level: 3, queued: waiting.size, oldestQueuedAt: null },
        ],
        earliestDueAt: async () => null,
      } as never,
      {
        dispatchQueued: async (id: string) => {
          dispatched.push(id);
          const outcome = (options.outcome?.(id) ?? {
            outcome: "placed",
            status: "initiating",
          }) as { outcome: string };
          if (outcome.outcome !== "deferred" && outcome.outcome !== "skipped")
            waiting.delete(id);
          return outcome;
        },
      } as never,
      {} as never,
    );
    const run = () =>
      service.runPass({
        budgetMs: 5_000,
        nowMs: () => clock.now,
        sleep: async (ms) => {
          clock.slept.push(ms);
          clock.now += ms;
        },
      });
    return { run, peeked, dispatched, clock, waiting };
  }

  it("does nothing, and says so, when the queue is off", async () => {
    const { run, dispatched } = build({
      queue: [[candidate("a", "o1")]],
      queueEnabled: false,
    });
    const summary = await run();
    assert.deepEqual(dispatched, []);
    assert.equal(summary.placed, 0);
  });

  it("places what capacity allows, re-reading the queue after each placement", async () => {
    const { run, dispatched } = build({
      queue: [
        [candidate("a", "o1"), candidate("b", "o2")],
        [candidate("b", "o2")],
        [],
      ],
    });
    const summary = await run();
    assert.deepEqual(dispatched, ["a", "b"]);
    assert.equal(summary.placed, 2);
  });

  it("looks at capacity first and claims nothing for a workspace that must wait", async () => {
    const calm = false;
    const { run, dispatched, peeked, clock } = build({
      queue: [[candidate("a", "o1"), candidate("b", "o2")]],
      free: (org) => (org === "o2" ? true : calm),
    });
    const summary = await run();
    // o2 went ahead; o1 was only looked at, never claimed.
    assert.deepEqual(dispatched, ["b"]);
    assert.ok(peeked.includes("o1"));
    assert.equal(summary.placed, 1);
    void calm;
    assert.ok(clock.slept.every((ms) => ms >= 0));
  });

  it("waits for the soonest moment something might go, instead of spinning", async () => {
    const { run, clock } = build({
      queue: [[candidate("a", "o1")]],
      free: () => false,
    });
    await run();
    assert.ok(clock.slept.length >= 1);
    assert.ok(clock.slept[0] >= 400);
    assert.ok(clock.slept.length <= 14);
    assert.ok(clock.now >= 1_005_000 && clock.now <= 1_005_015);
    assert.ok(clock.slept.every((ms) => ms > 0 && ms <= 2_100));
  });

  it("counts failures and calls left in doubt, and does not stop for them", async () => {
    const { run, dispatched } = build({
      queue: [
        [candidate("a", "o1"), candidate("b", "o2"), candidate("c", "o3")],
        [candidate("b", "o2"), candidate("c", "o3")],
        [candidate("c", "o3")],
        [],
      ],
      outcome: (id) =>
        id === "a"
          ? { outcome: "failed", reason: "dnc" }
          : id === "b"
            ? { outcome: "in_doubt" }
            : { outcome: "placed", status: "initiating" },
    });
    const summary = await run();
    assert.deepEqual(dispatched, ["a", "b", "c"]);
    assert.deepEqual(
      [summary.failed, summary.inDoubt, summary.placed],
      [1, 1, 1],
    );
  });

  it("stops when its budget is spent", async () => {
    const { run, dispatched, clock } = build({
      queue: [[candidate("a", "o1")]],
      free: () => false,
    });
    await run();
    assert.deepEqual(dispatched, []);
    assert.ok(clock.now - 1_000_000 <= 5_000 + 2_100);
  });

  it("looks past a full page of workspaces that must wait, to one that can go now", async () => {
    // Twenty-six workspaces, one call each. The first twenty-five are on their
    // own automated clocks for longer than the pass; the last one is free.
    const all = Array.from({ length: 26 }, (_, i) =>
      candidate(`c${i}`, `o${i}`),
    );
    const waiting = new Set(all.map((c) => c.agentCallId));
    const dispatched: string[] = [];
    const claimedBusy: string[] = [];
    const reads: string[][] = [];
    const clock = { now: 1_000_000 };
    const service = new DispatchQueueService(
      {
        getSettings: async () => ({ settings: settings() }),
        peek: async (request: { workspace: { organizationId: string } }) =>
          request.workspace.organizationId === "o25"
            ? { free: true, retryAfterMs: 0 }
            : { free: false, retryAfterMs: 60_000, reason: "workspace_busy" },
      } as never,
      {
        expireDue: async () => [],
        // As the query does: one row per workspace, at most `limit`, none of
        // the workspaces the caller left out.
        peekCandidates: async (
          _now: Date,
          _leaseMs: number,
          limit: number,
          _agingMs: number,
          exclude: string[] = [],
        ) => {
          const page = all
            .filter(
              (c) =>
                waiting.has(c.agentCallId) && !exclude.includes(c.workspaceKey),
            )
            .slice(0, limit);
          // A workspace set aside comes back only once its minute is over,
          // long after this pass. A pass that read one again before then
          // would read it forever, and the fake clock moves only when the
          // pass sleeps: fail instead of hanging.
          const repeated = page.find((c) =>
            reads.some((read) => read.includes(c.agentCallId)),
          );
          if (repeated)
            throw new Error(
              `${repeated.workspaceKey} was read again while it was set aside`,
            );
          reads.push(page.map((c) => c.agentCallId));
          return page;
        },
        depth: async () => [
          { level: 3, queued: waiting.size, oldestQueuedAt: null },
        ],
        earliestDueAt: async () => null,
      } as never,
      {
        dispatchQueued: async (id: string) => {
          if (id !== "c25") claimedBusy.push(id);
          dispatched.push(id);
          waiting.delete(id);
          return { outcome: "placed", status: "initiating" };
        },
      } as never,
      {} as never,
    );

    const summary = await service.runPass({
      budgetMs: 5_000,
      nowMs: () => clock.now,
      sleep: async (ms) => {
        clock.now += ms;
      },
    });

    assert.equal(reads[0].length, 25);
    assert.ok(
      !reads[0].includes("c25"),
      "the free one was past the first page",
    );
    assert.deepEqual(dispatched, ["c25"]);
    assert.equal(summary.placed, 1);
    assert.deepEqual(claimedBusy, [], "no busy workspace was claimed");
    // It went out in this pass, long before any busy workspace's clock freed.
    assert.ok(clock.now - 1_000_000 <= 5_000 + 2_100);
  });
});

describe("maskNumber", () => {
  it("shows the last four digits only", () => {
    assert.equal(maskNumber("+12025550123"), "••••0123");
    assert.equal(maskNumber("12"), "••••");
  });
});
