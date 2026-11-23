/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NumberPurchased, PoolMemberWithNumber } from "@ringee/database";
import {
  CallerIdRotationService,
  RotationReason,
} from "./caller-id-rotation.service";
import { NumberPurchasedService } from "../number.purchased.service";
import { resolveRegion } from "./destination-region";

const ctx = { userId: "user-1", organizationId: "org-1" };
function member(
  numberId: string,
  phoneNumber: string,
  patch: Partial<PoolMemberWithNumber> = {},
): PoolMemberWithNumber {
  return {
    id: `pool-${numberId}`,
    numberId,
    ...ctx,
    participating: true,
    rotationStatus: "active",
    dailyCap: null,
    healthScore: 100,
    lastUsedAt: null,
    coolingUntil: null,
    flaggedAt: null,
    areaCode: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    number: {
      id: numberId,
      phoneNumber,
      isoCountry: resolveRegion(phoneNumber).country ?? "US",
      ...ctx,
      kind: "purchased",
      status: "active",
      allowedOutboundSources: [],
      allowedOutboundUserIds: [],
    } as unknown as NumberPurchased,
    ...patch,
  };
}
function build(
  initial: PoolMemberWithNumber[],
  options: {
    enabled?: boolean;
    strategy?: string;
    cap?: number;
    owned?: NumberPurchased[];
  } = {},
) {
  const pool = [...initial];
  const owned = options.owned ?? pool.map((m) => m.number);
  const usage = new Map<
    string,
    { count: number; answered: number; shortCalls: number }
  >();
  const settings = {
    enabled: options.enabled ?? true,
    strategy: options.strategy ?? "local_presence",
    defaultDailyCap: options.cap ?? 50,
  };
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  let claimsFail = 0;
  const repo = {
    findSettings: async () => settings,
    listPoolMembers: async () => pool,
    findPoolMemberByNumberId: async (id: string) =>
      pool.find((m) => m.numberId === id),
    findEligibleMembers: async () =>
      pool
        .filter((m) => m.participating && m.rotationStatus === "active")
        .map((m) => ({ ...m })),
    createPoolMember: async (_ctx: unknown, id: string) => {
      if (!pool.some((m) => m.numberId === id))
        pool.push(member(id, owned.find((n) => n.id === id)!.phoneNumber));
    },
    usageForNumbers: async () => usage,
    usageSince: async (id: string) =>
      usage.get(id) ?? { count: 0, answered: 0, shortCalls: 0 },
    listMembersForHealthRecompute: async () =>
      pool.filter((m) => ["active", "cooling"].includes(m.rotationStatus)),
    updatePoolMember: async (id: string, data: Record<string, unknown>) => {
      updates.push({ id, data });
      Object.assign(pool.find((m) => m.numberId === id)!, data);
    },
    upsertSettings: async (_ctx: unknown, patch: object) => {
      Object.assign(settings, patch);
    },
    markUsed: async (id: string, previous: Date | null) => {
      if (claimsFail > 0) {
        claimsFail--;
        return false;
      }
      const current = pool.find((m) => m.numberId === id)!;
      if (current.lastUsedAt?.getTime() !== previous?.getTime()) return false;
      current.lastUsedAt = new Date(
        Math.max(Date.now(), (previous?.getTime() ?? 0) + 1),
      );
      return true;
    },
  };
  const numberRepo = { findRotatable: async () => owned };
  // Exercise the canonical surface/member allow-list, with only persistence mocked.
  const numbers = {
    listOutboundCallerIds:
      NumberPurchasedService.prototype.listOutboundCallerIds,
    numberPurchasedRepository: numberRepo,
  };
  const service = new CallerIdRotationService(
    repo as never,
    numberRepo as never,
    numbers as never,
  );
  const logs: Record<string, unknown>[] = [];
  Object.assign(service, {
    logger: {
      debug: (data: Record<string, unknown>) => logs.push(data),
      warn: (data: Record<string, unknown>) => logs.push(data),
    },
  });
  const select = (destination = "+12125550123", opts = {}) =>
    service.selectForDial(ctx, destination, { phoneNumber: null }, opts);
  return {
    service,
    select,
    usage,
    pool,
    settings,
    updates,
    logs,
    failClaims: (n: number) => {
      claimsFail = n;
    },
  };
}

describe("caller-ID rotation", () => {
  it("dials the reported 307 destination even without a local match", async () => {
    const b = build([
      member("ny", "+12125550101"),
      member("ca", "+14155550101"),
      member("nyc", "+16465550101"),
    ]);
    const result = await b.select("+1 (307) 555-1234");
    assert.ok(b.pool.some((m) => m.numberId === result.numberId));
    assert.ok(result.phoneNumber);
  });
  it("uses uniform random fallback across the entire eligible campaign pool, without state or health ranking", async (t) => {
    const b = build([
      member("ny", "+15185550101", { healthScore: 100 }),
      member("ca", "+14155550101", { healthScore: 60 }),
      member("tx", "+12145550101", { healthScore: 80 }),
    ]);
    const random = t.mock.method(Math, "random", () => 0);
    // Include the edges of every equal-width bucket, including a number in
    // another state with lower health. Every eligible number gets a chance.
    for (const [value, expected] of [
      [0, "ny"],
      [0.32, "ny"],
      [1 / 3, "ca"],
      [0.66, "ca"],
      [2 / 3, "tx"],
      [0.999999, "tx"],
    ] as const) {
      random.mock.mockImplementation(() => value);
      assert.equal((await b.select()).numberId, expected);
    }
  });
  it("rotates local matches by health and LRU without consulting randomness", async (t) => {
    t.mock.method(Math, "random", () => {
      throw new Error("local matching must not use random fallback");
    });
    const b = build([
      member("nonlocal", "+14155550101"),
      member("a", "+12125550101"),
      member("b", "+12125550102"),
      member("unhealthy", "+12125550103", { healthScore: 10 }),
    ]);
    assert.equal((await b.select("0012125550123")).numberId, "a");
    assert.equal((await b.select("011 1 212 555 0123")).numberId, "b");
  });
  it("falls back only within the authorized, under-cap campaign subset when local numbers are unavailable", async (t) => {
    t.mock.method(Math, "random", () => 0.999999);
    const b = build([
      member("local-capped", "+12125550101", { dailyCap: 0 }),
      member("local-disabled", "+12125550102", { rotationStatus: "disabled" }),
      member("outside-campaign", "+12125550103"),
      member("outside-workspace", "+12125550104"),
      member("fallback-a", "+14155550101"),
      member("fallback-b", "+16465550101"),
    ]);
    const outside = b.pool.find((m) => m.numberId === "outside-workspace")!;
    outside.number.allowedOutboundUserIds = ["another-user"];
    const result = await b.select(undefined, {
      restrictToNumberIds: b.pool
        .filter((m) => m.numberId !== "outside-campaign")
        .map((m) => m.numberId),
    });
    assert.equal(result.numberId, "fallback-b");
  });
  it("does not escape the campaign pool through the fixed fallback when the destination is invalid", async () => {
    const b = build([member("fixed", "+12125550101")]);
    const result = await b.service.selectForDial(
      ctx,
      "not a phone",
      { phoneNumber: "+12125550101", numberId: "fixed" },
      { restrictToNumberIds: ["different-number"] },
    );
    assert.equal(result.phoneNumber, null);
    assert.equal(result.reason, RotationReason.UNPARSEABLE);
  });
  it("uses random fallback when a valid calling plan has no supported geographic area", async (t) => {
    t.mock.method(Math, "random", () => 0.999999);
    const b = build([
      member("gb-a", "+442079460958"),
      member("gb-b", "+442079460959"),
      member("us", "+12125550101"),
    ]);
    assert.equal(resolveRegion("+44 20 7946 0960").areaCode, null);
    const result = await b.select("+44 20 7946 0960");
    assert.equal(result.numberId, "gb-b");
    assert.equal(result.reason, RotationReason.RANDOM_FALLBACK);
    const single = build([member("single", "+12125550101")]);
    assert.equal((await single.select("+13075551234")).numberId, "single");
  });
  it("reports selection counts, fallback and session context without phone numbers", async (t) => {
    t.mock.method(Math, "random", () => 0.999999);
    const b = build([member("a", "+12125550101"), member("b", "+14155550101")]);
    await b.select("+13075551234", {
      logContext: { campaignId: "campaign", sessionId: "session" },
    });
    assert.deepEqual(b.logs.at(-1), {
      event: "caller_id.selection",
      campaignId: "campaign",
      sessionId: "session",
      configuredCount: 2,
      eligibleCount: 2,
      localMatchCount: 0,
      randomFallback: true,
      reason: RotationReason.RANDOM_FALLBACK,
      selectedNumberId: "b",
    });
    assert.ok(!JSON.stringify(b.logs).includes("+1"));
  });
  it("never selects malformed caller IDs or numbers absent from the workspace allow-list", async () => {
    const good = member("good", "+14155550101");
    const b = build(
      [
        member("foreign", "+12125550101"),
        member("invalid", "not a phone"),
        good,
      ],
      { owned: [good.number, member("invalid", "not a phone").number] },
    );
    assert.equal((await b.select()).numberId, "good");
    assert.equal(
      (await b.select(undefined, { restrictToNumberIds: ["foreign"] }))
        .phoneNumber,
      null,
    );
  });
  it("prefers area and otherwise randomly falls back within country; ignores stale cached area codes", async (t) => {
    t.mock.method(Math, "random", () => 0.999999);
    const b = build([
      member("ca", "+14155550101"),
      member("ny", "+15185550101"),
      member("nyc", "+12125550101"),
    ]);
    assert.equal((await b.select()).numberId, "nyc");
    b.pool[2].participating = false;
    assert.equal((await b.select()).numberId, "ny");
    b.pool[1].participating = false;
    assert.equal((await b.select()).numberId, "ca");
  });
  it("balanced strategy rotates within country without preferring state", async () => {
    const b = build(
      [member("a-ca", "+14155550101"), member("b-ny", "+12125550101")],
      { strategy: "balanced" },
    );
    assert.equal((await b.select()).numberId, "a-ca");
    assert.equal((await b.select()).numberId, "b-ny");
  });
  it("keeps US, Canada, Dominican Republic and Puerto Rico apart despite +1", async () => {
    const b = build([
      member("us", "+12125550101"),
      member("ca", "+14165550101"),
      member("do", "+18095550101"),
      member("pr", "+17875550101"),
    ]);
    for (const [destination, id] of [
      ["+12125550123", "us"],
      ["+14165550123", "ca"],
      ["+18495550123", "do"],
      ["+19395550123", "pr"],
    ])
      assert.equal((await b.select(destination)).numberId, id);
  });
  it("uses parsed country over stale inventory metadata and handles international prefixes", async () => {
    const es = member("es", "+34912345678");
    es.number.isoCountry = "US";
    const b = build([
      member("us", "+12125550101"),
      es,
      member("gb", "+442079460958"),
    ]);
    assert.equal((await b.select("0034 912 345 679")).numberId, "es");
    assert.equal((await b.select("011442079460959")).numberId, "gb");
  });
  it("supports non-geographic international calling codes", async () => {
    const b = build([
      member("global", "+80012345678"),
      member("us", "+12125550101"),
    ]);
    assert.equal((await b.select("+80012345679")).numberId, "global");
  });
  it("never uses excluded, cooling, flagged or disabled numbers as a fallback", async () => {
    for (const patch of [
      { participating: false },
      { rotationStatus: "cooling" },
      { rotationStatus: "flagged" },
      { rotationStatus: "disabled" },
    ] as Partial<PoolMemberWithNumber>[]) {
      const n = member("ny", "+12125550101", patch);
      const b = build([n]);
      const result = await b.service.selectForDial(ctx, "+12125550123", {
        phoneNumber: n.number.phoneNumber,
      });
      assert.equal(result.phoneNumber, null);
      assert.equal(result.reason, RotationReason.NO_ELIGIBLE_CALLER_IDS);
    }
  });
  it("excludes inactive purchased numbers and surface-restricted local matches before random fallback", async (t) => {
    t.mock.method(Math, "random", () => 0.999999);
    const inactive = member("inactive", "+12125550101");
    inactive.number.status = "released";
    const restricted = member("restricted", "+12125550102");
    restricted.number.allowedOutboundSources = ["sip_device"];
    const b = build([inactive, restricted, member("fallback", "+14155550101")]);
    assert.equal((await b.select()).numberId, "fallback");
  });
  it("honors daily limits before area preference and an explicit over-cap override", async () => {
    const b = build(
      [member("ny", "+12125550101"), member("ca", "+14155550101")],
      { cap: 1 },
    );
    b.usage.set("ny", { count: 1, answered: 0, shortCalls: 0 });
    assert.equal((await b.select()).numberId, "ca");
    b.usage.set("ca", { count: 1, answered: 0, shortCalls: 0 });
    assert.equal((await b.select()).reason, RotationReason.ALL_OVER_CAP);
    assert.equal(
      (await b.select(undefined, { allowOverCap: true })).numberId,
      "ny",
    );
  });
  it("respects a zero per-number cap and campaign subsets on every path", async () => {
    const b = build([
      member("ny", "+12125550101", { dailyCap: 0 }),
      member("ca", "+14155550101"),
    ]);
    assert.equal(
      (await b.select(undefined, { restrictToNumberIds: ["ny"] })).reason,
      RotationReason.ALL_OVER_CAP,
    );
    assert.equal(
      (await b.select(undefined, { restrictToNumberIds: ["other-workspace"] }))
        .phoneNumber,
      null,
    );
    assert.equal(
      (await b.select(undefined, { restrictToNumberIds: [] })).numberId,
      "ca",
    );
  });
  it("enforces member and outbound surface restrictions through the canonical allow-list", async () => {
    const a = member("other-user", "+12125550101");
    a.number.allowedOutboundUserIds = ["user-2"];
    const b = member("extension", "+12125550102");
    b.number.allowedOutboundSources = ["chrome_extension"];
    const c = member("web", "+12125550103");
    c.number.allowedOutboundSources = ["web"];
    const h = build([a, b, c]);
    assert.equal((await h.select()).numberId, "web");
    assert.equal(
      (await h.select(undefined, { source: "chrome_extension" })).numberId,
      "extension",
    );
  });
  it("materializes newly purchased numbers during dial without visiting settings", async () => {
    const n = member("new", "+12125550101");
    const b = build([], { owned: [n.number] });
    assert.equal((await b.select()).numberId, "new");
  });
  it("validates fixed caller-ID ownership even when rotation is disabled", async () => {
    const n = member("ny", "+12125550101");
    const b = build([n], { enabled: false });
    const good = await b.service.selectForDial(ctx, "+34912345678", {
      phoneNumber: n.number.phoneNumber,
      numberId: n.numberId,
    });
    assert.equal(good.numberId, "ny");
    assert.equal(good.rotated, false);
    const bad = await b.service.selectForDial(ctx, "+34912345678", {
      phoneNumber: "+12125550999",
    });
    assert.equal(bad.phoneNumber, null);
  });
  it("refuses an unparseable calling plan instead of bypassing rotation eligibility", async () => {
    const n = member("ny", "+12125550101");
    const b = build([n]);
    const result = await b.service.selectForDial(ctx, "not a phone", {
      phoneNumber: n.number.phoneNumber,
    });
    assert.equal(result.numberId, null);
    assert.equal(result.reason, RotationReason.UNPARSEABLE);
  });
  it("does not reuse the same LRU snapshot for simultaneous callers", async () => {
    const b = build([member("a", "+12125550101"), member("b", "+12125550102")]);
    const results = await Promise.all([b.select(), b.select()]);
    assert.deepEqual(
      new Set(results.map((r) => r.numberId)),
      new Set(["a", "b"]),
    );
    b.failClaims(5);
    await assert.rejects(b.select(), /selection is busy/);
  });
  it("recovers expired cooling even without recent calls, and leaves flagged numbers alone", async () => {
    const b = build([
      member("cooling", "+12125550101", {
        rotationStatus: "cooling",
        coolingUntil: new Date(0),
        healthScore: 0,
      }),
      member("flagged", "+12125550102", { rotationStatus: "flagged" }),
    ]);
    const result = await b.service.recomputeHealth();
    assert.equal(result.recovered, 1);
    assert.equal(b.pool[0].rotationStatus, "active");
    assert.equal(b.pool[1].rotationStatus, "flagged");
  });
  it("rejects invalid caps, booleans and state changes; preserves nullable cap inheritance", async () => {
    const b = build([member("ny", "+12125550101")]);
    for (const cap of [-1, 1.5, NaN, Infinity, 2147483648, "10"]) {
      await assert.rejects(
        b.service.updateSettings(ctx, { defaultDailyCap: cap as number }),
      );
      await assert.rejects(
        b.service.updatePoolMember(ctx, "ny", { dailyCap: cap as number }),
      );
    }
    await assert.rejects(
      b.service.updateSettings(ctx, { enabled: "false" as never }),
    );
    await assert.rejects(
      b.service.updatePoolMember(ctx, "ny", { status: "flagged" as never }),
    );
    await b.service.updatePoolMember(ctx, "ny", { dailyCap: null });
    assert.equal(b.pool[0].dailyCap, null);
    await assert.rejects(
      b.service.updatePoolMember(
        { userId: "user-2", organizationId: null },
        "ny",
        { participating: false },
      ),
    );
  });
});
