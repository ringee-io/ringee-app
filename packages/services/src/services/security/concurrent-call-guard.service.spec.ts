/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CallStatus } from "@ringee/database";
import type { Call, CallRepository } from "@ringee/database";
import type { RedisService, TelephonyService } from "@ringee/platform";
import { ConcurrentCallGuardService } from "./concurrent-call-guard.service";

const USER = "user-1";

function buildCall(overrides: Partial<Call> = {}): Call {
  const now = new Date();
  return {
    id: "call-1",
    userId: USER,
    callControlId: "leg-1",
    status: CallStatus.ringing,
    direction: "outbound",
    createdAt: now,
    startedAt: now,
    answeredAt: null,
    endedAt: null,
    source: "web",
    toNumber: "+34600000000",
    ...overrides,
  } as Call;
}

/** In-memory stand-ins — enough surface for what the guard actually touches. */
function harness(options: {
  calls?: Call[];
  alive?: boolean | null;
  lease?: Record<string, unknown> | null;
}) {
  const store = new Map<string, string>();
  if (options.lease) {
    store.set(
      `ringee:call-lease:v1:${USER}`,
      JSON.stringify({
        deviceId: "device-a",
        deviceLabel: null,
        source: "web",
        callControlId: "leg-1",
        at: new Date(Date.now() - 60 * 60_000).toISOString(),
        ...options.lease,
      }),
    );
  }

  const closed: string[] = [];
  let aliveChecks = 0;

  const redis = {
    async get<T>(key: string) {
      const raw = store.get(key);
      return (raw ? JSON.parse(raw) : undefined) as T | undefined;
    },
    async set(key: string, value: unknown) {
      store.set(key, String(value));
    },
    async del(key: string) {
      store.delete(key);
    },
    async setIfAbsent(key: string, value: string) {
      if (store.has(key)) return false;
      store.set(key, value);
      return true;
    },
  } as unknown as RedisService;

  const callRepository = {
    async findActiveByUserId() {
      return (options.calls ?? []).filter((call) => !closed.includes(call.id));
    },
    async markForciblyEnded(id: string) {
      closed.push(id);
      return buildCall({ id, status: CallStatus.completed });
    },
  } as unknown as CallRepository;

  const telephonyService = {
    async isCallAlive() {
      aliveChecks++;
      return options.alive ?? null;
    },
  } as unknown as TelephonyService;

  return {
    guard: new ConcurrentCallGuardService(
      redis,
      callRepository,
      telephonyService,
    ),
    closed,
    store,
    aliveChecks: () => aliveChecks,
  };
}

describe("ConcurrentCallGuardService.findOccupyingCall", () => {
  it("trusts a freshly started call without asking the provider", async () => {
    const h = harness({ calls: [buildCall()], alive: false });

    const busy = await h.guard.findOccupyingCall(USER);

    assert.equal(busy?.id, "call-1");
    assert.equal(h.aliveChecks(), 0);
  });

  it("keeps blocking while the provider confirms the leg is up", async () => {
    const started = new Date(Date.now() - 10 * 60_000);
    const h = harness({
      calls: [
        buildCall({
          status: CallStatus.answered,
          startedAt: started,
          answeredAt: started,
        }),
      ],
      alive: true,
    });

    const busy = await h.guard.findOccupyingCall(USER);

    assert.equal(busy?.id, "call-1");
    assert.deepEqual(h.closed, []);
  });

  it("closes the ghost call and frees the user when the leg is gone", async () => {
    const started = new Date(Date.now() - 30 * 60_000);
    const h = harness({
      calls: [buildCall({ startedAt: started, createdAt: started })],
      alive: false,
      lease: {},
    });

    const busy = await h.guard.findOccupyingCall(USER);

    assert.equal(
      busy,
      null,
      "a call the provider does not know must not block",
    );
    assert.deepEqual(h.closed, ["call-1"], "the ghost row is closed");
    assert.equal(
      h.store.get(`ringee:call-lease:v1:${USER}`),
      undefined,
      "the dial lease bound to that call is released",
    );
  });

  it("keeps believing the database while the provider is unreachable", async () => {
    const started = new Date(Date.now() - 5 * 60_000);
    const h = harness({
      calls: [buildCall({ startedAt: started, createdAt: started })],
      alive: null,
    });

    const busy = await h.guard.findOccupyingCall(USER);

    assert.equal(busy?.id, "call-1");
    assert.deepEqual(h.closed, []);
  });

  it("closes an unverifiable call once it is past any plausible duration", async () => {
    const started = new Date(Date.now() - 60 * 60_000);
    const h = harness({
      calls: [buildCall({ startedAt: started, createdAt: started })],
      alive: null,
    });

    const busy = await h.guard.findOccupyingCall(USER);

    assert.equal(busy, null);
    assert.deepEqual(h.closed, ["call-1"]);
  });

  it("ignores an inbound call that is only ringing", async () => {
    const h = harness({
      calls: [buildCall({ direction: "inbound" })],
      alive: true,
    });

    assert.equal(await h.guard.findOccupyingCall(USER), null);
  });
});

describe("ConcurrentCallGuardService.requestDial", () => {
  it("lets the same device dial again once its previous call is really over", async () => {
    const started = new Date(Date.now() - 20 * 60_000);
    const h = harness({
      calls: [buildCall({ startedAt: started, createdAt: started })],
      alive: false,
      lease: { deviceId: "device-a" },
    });

    const decision = await h.guard.requestDial(USER, {
      deviceId: "device-a",
      source: "web",
    });

    assert.equal(decision.allowed, true);
    assert.deepEqual(h.closed, ["call-1"]);
  });

  it("refuses a second device while the provider confirms a live call", async () => {
    const started = new Date(Date.now() - 20 * 60_000);
    const h = harness({
      calls: [
        buildCall({
          status: CallStatus.answered,
          startedAt: started,
          answeredAt: started,
        }),
      ],
      alive: true,
      lease: { deviceId: "device-a", deviceLabel: "Chrome · macOS" },
    });

    const decision = await h.guard.requestDial(USER, {
      deviceId: "device-b",
      source: "web",
    });

    assert.equal(decision.allowed, false);
    assert.match(
      decision.allowed === false ? decision.message : "",
      /Chrome · macOS/,
    );
  });

  it("takes over a stale lease when the database has no live call", async () => {
    const h = harness({ calls: [], lease: { deviceId: "device-a" } });

    const decision = await h.guard.requestDial(USER, {
      deviceId: "device-b",
      source: "web",
    });

    assert.equal(decision.allowed, true);
  });
});
