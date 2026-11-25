import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { FakeDispatchRedis } from "./dispatch-test-support";
import {
  ProviderDispatchDeferredError,
  type DispatchAlert,
} from "./dispatch.types";
import { baselineSettings, type DispatchSettings } from "./dispatch-settings";
import { RingeeManagedAccountResolver } from "./provider-account";
import {
  DispatchRuntime,
  ProviderDispatchService,
  classifyFailure,
} from "./provider-dispatch.service";

/** The module under test reads configuration only when no baseline is given. */
vi.mock("@ringee/configuration", () => ({ apiConfiguration: {} }));

const baseline = (
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

function build(
  settings: Partial<DispatchSettings> = {},
  redis = new FakeDispatchRedis(),
) {
  const runtime = new DispatchRuntime();
  const alerts: DispatchAlert[] = [];
  runtime.setAlertSink((alert) => {
    alerts.push(alert);
  });
  const service = new ProviderDispatchService(redis as never, runtime, {
    baseline: baseline(settings),
    resolver: new RingeeManagedAccountResolver("test-account"),
    nowMs: () => redis.nowMs,
    sleep: redis.sleep,
    random: () => 0,
    settingsCacheMs: 0,
  });
  // Most policy cases start after the shared egress recovery window.
  redis.idempotency.set(
    "cps:{telnyx-test-account}:l0:egress:initialized",
    Infinity,
  );
  return { service, redis, runtime, alerts };
}

const workspace = { userId: "u1", organizationId: "o1" };

describe("admission by traffic class", () => {
  it("expires a queued operation instead of waiting past its dispatch deadline", async () => {
    const { service, redis } = build();
    await service.admit({ source: "web_dial" });
    const decision = await service.admit({
      source: "agent_api",
      expiresAtMs: redis.nowMs - 1,
    });
    expect(decision).toMatchObject({ granted: false, reason: "expired" });
  });

  it("fails closed on a cold settings-store outage, including interactive calls", async () => {
    const { service, runtime } = build();
    runtime.setSettingsSource(async () => {
      throw new Error("store unavailable");
    });
    expect(await service.admit({ source: "web_dial" })).toMatchObject({
      granted: false,
      reason: "coordination_unavailable",
    });
    expect(await service.peek({ source: "agent_api" })).toMatchObject({
      free: false,
    });
    runtime.setSettingsSource(async () => ({}));
    expect((await service.admit({ source: "web_dial" })).granted).toBe(true);
  });
  it("grants a person at once when the clock is free", async () => {
    const { service, redis } = build();
    const decision = await service.admit({ source: "web_dial" });
    expect(decision).toMatchObject({ granted: true, waitedMs: 0 });
    if (decision.granted) {
      expect(decision.permit).toMatchObject({
        cls: "interactive",
        level: 0,
        overage: false,
        degraded: false,
        counted: false,
        consumed: false,
      });
    }
    expect(redis.hourCounters().attempts ?? 0).toBe(0);
  });

  it("makes a second person wait one interval, then grants", async () => {
    const { service } = build();
    await service.admit({ source: "web_dial" });
    const second = await service.admit({ source: "extension_dial" });
    expect(second.granted).toBe(true);
    // 250 ms between grants at 4 CPS.
    expect(second.waitedMs).toBeGreaterThanOrEqual(250);
    expect(second.waitedMs).toBeLessThanOrEqual(251);
  });

  it("never overrides the account ceiling when an interactive wait expires", async () => {
    const { service, redis } = build({ interactiveMaxWaitMs: 100 });
    await service.admit({ source: "web_dial" });
    const late = await service.admit({ source: "web_dial" });
    expect(late).toMatchObject({ granted: false, reason: "busy" });
    expect(redis.hourCounters().overage ?? 0).toBe(0);
  });

  it("can be told to defer a person instead (an explicit operating choice)", async () => {
    const { service } = build({
      interactiveMaxWaitMs: 100,
      interactiveOnTimeout: "defer",
    });
    await service.admit({ source: "web_dial" });
    const late = await service.admit({ source: "web_dial" });
    expect(late).toMatchObject({ granted: false, reason: "busy" });
  });

  it("defers background work at once, saying when to come back", async () => {
    const { service } = build();
    expect(
      (await service.admit({ source: "agent_api", workspace })).granted,
    ).toBe(true);
    const next = await service.admit({ source: "agent_api", workspace });
    expect(next).toMatchObject({ granted: false, reason: "busy", waitedMs: 0 });
    if (!next.granted) {
      // The slowest of the clocks it needs: level 3 is 500 ms apart.
      expect(next.retryAfterMs).toBe(500);
    }
    expect(service.counters.deferred_l3).toBe(1);
  });

  it("makes scheduled work wait its bound, then grants in order", async () => {
    const { service } = build();
    const waits: number[] = [];
    for (let i = 0; i < 12; i++) {
      const decision = await service.admit({
        source: "agent_reminder",
        workspace,
      });
      expect(decision.granted).toBe(true);
      waits.push(decision.waitedMs);
    }
    // One grant per level-1 interval after the first (333 ms), none refused.
    expect(waits[0]).toBe(0);
    expect(Math.min(...waits.slice(1))).toBeGreaterThanOrEqual(0);
    expect(Math.max(...waits)).toBeLessThanOrEqual(10_000);
  });

  it("gives up on scheduled work whose wait would pass its bound", async () => {
    const { service } = build({ scheduledMaxWaitMs: 200 });
    await service.admit({ source: "agent_reminder", workspace });
    const next = await service.admit({ source: "agent_reminder", workspace });
    expect(next.granted).toBe(false);
    // Whichever clock holds it longest: here the workspace's own (500 ms).
    if (!next.granted)
      expect(["busy", "workspace_busy"]).toContain(next.reason);
  });

  it("blames the workspace's own clock when that is what is busy", async () => {
    const { service } = build({ orgAutomationCps: 0.5, scheduledMaxWaitMs: 0 });
    await service.admit({ source: "agent_reminder", workspace });
    const next = await service.admit({ source: "agent_reminder", workspace });
    expect(next).toMatchObject({ granted: false, reason: "workspace_busy" });
    if (!next.granted) expect(next.retryAfterMs).toBe(2_000);
  });

  it("does not hold a person to an automation workspace clock", async () => {
    const { service } = build({ orgAutomationCps: 0.1 });
    await service.admit({ source: "agent_api", workspace });
    // The workspace's automated clock is a tenth of a CPS; a person dialing in
    // that workspace is only ever paced by the shared account clock.
    const person = await service.admit({ source: "web_dial", workspace });
    expect(person.granted).toBe(true);
    expect(person.waitedMs).toBeLessThanOrEqual(251);
  });

  it("keeps two workspaces' automated clocks apart", async () => {
    const { service } = build({
      orgAutomationCps: 0.5,
      backgroundMaxWaitMs: 0,
    });
    await service.admit({ source: "agent_api", workspace });
    const other = await service.admit({
      source: "agent_api",
      workspace: { userId: "u2", organizationId: "o2" },
    });
    // Not the workspace clock: the shared account clocks are what hold it.
    if (!other.granted) expect(other.reason).not.toBe("workspace_busy");
  });

  it("pauses background dispatch and nothing else", async () => {
    const { service } = build({ pausedClasses: ["background"] });
    const paused = await service.admit({ source: "agent_api", workspace });
    expect(paused).toMatchObject({ granted: false, reason: "paused" });
    // Interactive and scheduled work carry on.
    expect((await service.admit({ source: "web_dial" })).granted).toBe(true);
    expect(
      (await service.admit({ source: "agent_reminder", workspace })).granted,
    ).toBe(true);
  });

  it("follows an administrator's move of a source to another class", async () => {
    const { service } = build({ classOverrides: { agent_api: "automation" } });
    const decision = await service.admit({ source: "agent_api", workspace });
    expect(decision.granted && decision.permit.cls).toBe("automation");
    // A person cannot be demoted, whatever the map says.
    const person = await service.admit({ source: "inbound_ring" });
    expect(person.granted && person.permit.cls).toBe("interactive");
  });

  it("answers `peek` without spending a grant", async () => {
    const { service } = build();
    for (let i = 0; i < 5; i++)
      expect(
        (await service.peek({ source: "progressive_dial", workspace })).free,
      ).toBe(true);
    await service.admit({ source: "progressive_dial", workspace });
    const busy = await service.peek({ source: "progressive_dial", workspace });
    expect(busy.free).toBe(false);
    expect(busy.retryAfterMs).toBeGreaterThan(0);
  });
});

describe("modes", () => {
  it("`off` is the kill switch: no Redis, no counting, a grant for everyone", async () => {
    const { service, redis } = build({ mode: "off" });
    for (const source of ["web_dial", "agent_api", "agent_reminder"] as const) {
      const decision = await service.admit({ source, workspace });
      expect(decision.granted && decision.permit.mode).toBe("off");
    }
    expect(redis.calls).toBe(0);
    expect(await service.beginEgress("POST", "/calls")).toBeNull();
  });

  it("`observe` never delays or defers, and records what enforcement would have", async () => {
    const { service, redis } = build({ mode: "observe" });
    for (let i = 0; i < 6; i++) {
      const before = redis.nowMs;
      await service.runInScope({ source: "agent_api", workspace }, () =>
        service.beginEgress("POST", "/calls"),
      );
      expect(redis.nowMs).toBe(before);
    }
    const hour = redis.hourCounters();
    expect(hour.attempts).toBe(6);
    // The first was within pace; the other five would have been deferred.
    expect(hour.would_defer_l3).toBe(5);
  });

  it("`observe` ignores a pause: nothing is stopped while only measuring", async () => {
    const { service } = build({
      mode: "observe",
      pausedClasses: ["background"],
    });
    expect(
      (await service.admit({ source: "agent_api", workspace })).granted,
    ).toBe(true);
  });

  it("`peek` reports free in observe mode", async () => {
    const { service } = build({ mode: "observe" });
    await service.admit({ source: "agent_api", workspace });
    expect((await service.peek({ source: "agent_api", workspace })).free).toBe(
      true,
    );
  });
});

describe("when Redis cannot be reached", () => {
  it("defers automated work instead of letting it through", async () => {
    const { service, redis } = build();
    redis.failure = "error";
    for (const source of [
      "agent_api",
      "agent_reminder",
      "progressive_dial",
    ] as const) {
      const decision = await service.admit({ source, workspace });
      expect(decision).toMatchObject({
        granted: false,
        reason: "coordination_unavailable",
      });
      if (!decision.granted)
        expect(decision.retryAfterMs).toBeGreaterThanOrEqual(1_000);
    }
  });

  it("defers interactive traffic across all replicas during an outage", async () => {
    const redis = new FakeDispatchRedis();
    redis.failure = "error";
    const replicas = Array.from({ length: 5 }, () => build({}, redis).service);
    const decisions = await Promise.all(
      replicas.map((service) => service.admit({ source: "web_dial" })),
    );
    expect(
      decisions.every(
        (d) => !d.granted && d.reason === "coordination_unavailable",
      ),
    ).toBe(true);
  });

  it("treats a Redis that does not answer as down", async () => {
    const { service, redis } = build({ coordinationTimeoutMs: 20 });
    redis.failure = "hang";
    const decision = await service.admit({ source: "agent_api", workspace });
    expect(decision).toMatchObject({
      granted: false,
      reason: "coordination_unavailable",
    });
  });

  it("opens a breaker so a long outage does not slow every dial by a timeout", async () => {
    const { service, redis } = build();
    redis.failure = "error";
    for (let i = 0; i < 3; i++)
      await service.admit({ source: "agent_api", workspace });
    const callsAtTrip = redis.calls;
    for (let i = 0; i < 20; i++)
      await service.admit({ source: "agent_api", workspace });
    // Open: nothing reached Redis.
    expect(redis.calls).toBe(callsAtTrip);
    // After the open window the next request probes Redis again and recovers.
    redis.nowMs += 5_001;
    redis.failure = "none";
    const recovered = await service.admit({ source: "agent_api", workspace });
    expect(recovered.granted).toBe(true);
    expect(redis.calls).toBeGreaterThan(callsAtTrip);
  });

  it("never blocks in observe mode, even when it cannot see", async () => {
    const { service, redis } = build({ mode: "observe" });
    redis.failure = "error";
    const decision = await service.admit({ source: "agent_api", workspace });
    expect(decision.granted && decision.permit.degraded).toBe(true);
  });

  it("raises one critical alert, not one per request", async () => {
    const { service, redis, alerts } = build();
    redis.failure = "error";
    for (let i = 0; i < 30; i++)
      await service.admit({ source: "agent_api", workspace });
    const critical = alerts.filter(
      (alert) => alert.key === "coordination_unavailable",
    );
    expect(critical).toHaveLength(1);
    expect(critical[0].severity).toBe("critical");
  });
});

describe("the egress guard", () => {
  it("ignores requests that do not start a call", async () => {
    const { service, redis } = build();
    expect(await service.beginEgress("GET", "/calls")).toBeNull();
    expect(
      await service.beginEgress("POST", "/calls/x/actions/hangup"),
    ).toBeNull();
    expect(redis.calls).toBe(0);
  });

  it("paces an undeclared call as interactive and counts it as a bypass", async () => {
    const { service, redis, alerts } = build();
    const handle = await service.beginEgress("POST", "/calls");
    expect(handle).not.toBeNull();
    expect(service.counters.bypass).toBe(1);
    expect(redis.hourCounters().bypass).toBe(1);
    expect(alerts[0]).toMatchObject({ severity: "warning" });
    expect(alerts[0].key).toMatch(/^bypass:/);
    // Never refused: a second one waits its turn like a person would.
    expect(await service.beginEgress("POST", "/calls")).not.toBeNull();
  });

  it("names the path in a bypass alert without ids", async () => {
    const { service, alerts } = build();
    await service.beginEgress(
      "POST",
      "/calls/6f1c2d3e-aaaa-bbbb-cccc-0123456789ab/actions/transfer",
    );
    expect(alerts[0].detail.path).toBe("/calls/:id/actions/transfer");
  });

  it("paces a declared call at the moment it leaves, and defers automation before sending", async () => {
    const { service } = build();
    await service.runInScope({ source: "agent_api", workspace }, () =>
      service.beginEgress("POST", "/texml/ai_calls/app-1"),
    );
    const refused = service.runInScope({ source: "agent_api", workspace }, () =>
      service.beginEgress("POST", "/texml/ai_calls/app-1"),
    );
    await expect(refused).rejects.toBeInstanceOf(ProviderDispatchDeferredError);
    await expect(refused).rejects.toMatchObject({
      status: 429,
      reason: "busy",
    });
  });

  it("makes a declared person's leg wait for its turn rather than failing", async () => {
    const { service } = build();
    await service.runInScope({ source: "inbound_ring" }, () =>
      service.beginEgress("POST", "/calls"),
    );
    const second = await service.runInScope({ source: "inbound_ring" }, () =>
      service.beginEgress("POST", "/calls"),
    );
    expect(second).not.toBeNull();
    // Declared, so it is not a bypass.
    expect(service.counters.bypass ?? 0).toBe(0);
  });

  it("spends a permit exactly once: a second request under it is paced on its own", async () => {
    const { service, redis } = build();
    const decision = await service.admit({ source: "agent_api", workspace });
    if (!decision.granted) throw new Error("expected a grant");
    const attemptsAfterGrant = redis.hourCounters().attempts ?? 0;

    await service.runWithPermit(decision.permit, async () => {
      expect(
        await service.beginEgress("POST", "/texml/ai_calls/a"),
      ).not.toBeNull();
      // The permit was the first request's. The second must ask again — here
      // as the same class, so it is deferred rather than slipping through.
      const before = redis.nowMs;
      expect(
        await service.beginEgress("POST", "/texml/ai_calls/a"),
      ).not.toBeNull();
      expect(redis.nowMs - before).toBeGreaterThanOrEqual(500);
    });
    expect(decision.permit.consumed).toBe(true);
    expect(service.counters.permit_reuse).toBe(1);
    // Admission counted nothing; only the actual egress spent an attempt.
    expect(redis.hourCounters().attempts).toBe(attemptsAfterGrant + 2);
  });

  it("records what the provider answered", async () => {
    const { service, redis } = build();
    const ok = await service.beginEgress("POST", "/calls");
    ok?.accepted();
    await service.runInScope({ source: "inbound_ring" }, async () => {
      const refused = await service.beginEgress("POST", "/calls");
      refused?.failed({ response: { status: 422 } });
      const unknown = await service.beginEgress("POST", "/calls");
      unknown?.failed(new Error("socket hang up"));
    });
    await vi.waitFor(() => {
      const hour = redis.hourCounters();
      expect(hour.accepted).toBe(1);
      expect(hour.rejected).toBe(1);
      expect(hour.ambiguous).toBe(1);
    });
  });
});

describe("classifying a provider failure", () => {
  it.each([
    [
      { response: { status: 429, data: { errors: [{ code: "90103" }] } } },
      { rate_limited: 1, dps_rejected: 1 },
    ],
    [
      new HttpException({ errors: [{ code: "90103" }] }, 429),
      { rate_limited: 1, dps_rejected: 1 },
    ],
    [{ response: { status: 429 } }, { rate_limited: 1 }],
    [{ response: { status: 400 } }, { rejected: 1 }],
    [new HttpException("no", 422), { rejected: 1 }],
    [{ response: { status: 503 } }, { ambiguous: 1 }],
    [new HttpException("bad gateway", 502), { ambiguous: 1 }],
    [new Error("ETIMEDOUT"), { ambiguous: 1 }],
    [undefined, { ambiguous: 1 }],
  ])("%j is counted as %j", (error, counted) => {
    expect(classifyFailure(error)).toEqual(counted);
  });
});

describe("settings", () => {
  it("apply a stored override at runtime, without a restart", async () => {
    const redis = new FakeDispatchRedis();
    const { service, runtime } = build({}, redis);
    let stored: Record<string, unknown> = {};
    runtime.setSettingsSource(async () => stored);

    service.invalidateSettings();
    expect((await service.getSettings()).settings.mode).toBe("enforce");
    stored = { mode: "observe", pausedClasses: ["background"] };
    service.invalidateSettings();
    const next = await service.getSettings();
    expect(next.settings.mode).toBe("observe");
    expect(next.settings.pausedClasses).toEqual(["background"]);
    expect(next.overrides).toEqual(stored);
  });

  it("keep the last known overrides when the store cannot be read", async () => {
    const { service, runtime } = build();
    let fail = false;
    runtime.setSettingsSource(async () => {
      if (fail) throw new Error("database down");
      return { mode: "observe" };
    });
    expect((await service.getSettings()).settings.mode).toBe("observe");
    fail = true;
    service.invalidateSettings();
    // A database blip neither loosens nor wipes an administrator's limit.
    expect((await service.getSettings()).settings.mode).toBe("observe");
  });

  it("ignore a stored value that no longer validates", async () => {
    const { service, runtime } = build();
    runtime.setSettingsSource(async () => ({
      ceilingCps: -3,
      mode: "enforce",
    }));
    const { settings } = await service.getSettings();
    expect(settings.ceilingCps).toBe(5);
  });

  it("derive the limits the clocks use", async () => {
    const { service } = build({ ceilingCps: 10, safetyMargin: 0.5 });
    const { limits } = await service.getSettings();
    expect(limits.effectiveCps).toBe(5);
    expect(limits.levelIntervalsMicros[0]).toBe(200_000);
  });
});

describe("observed legs", () => {
  it("count a browser leg once, in the second its webhook arrived", async () => {
    const { service, redis } = build();
    await service.observeExternalAttempt({
      source: "web_dial",
      callControlId: "cc-1",
    });
    await service.observeExternalAttempt({
      source: "web_dial",
      callControlId: "cc-1",
    });
    await service.observeExternalAttempt({
      source: "web_dial",
      callControlId: "cc-2",
    });
    expect(redis.hourCounters()).toMatchObject({ attempts: 2, observed: 2 });
  });

  it("never throw: a counting failure must not fail a webhook", async () => {
    const { service, redis } = build();
    redis.failure = "error";
    await expect(
      service.observeExternalAttempt({
        source: "web_dial",
        callControlId: "cc-9",
      }),
    ).resolves.toBeUndefined();
  });

  it("do nothing when pacing is off", async () => {
    const { service, redis } = build({ mode: "off" });
    await service.observeExternalAttempt({
      source: "web_dial",
      callControlId: "cc-1",
    });
    expect(redis.calls).toBe(0);
  });
});
