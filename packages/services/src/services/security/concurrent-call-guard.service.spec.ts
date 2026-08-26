/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CallStatus } from "@ringee/database";
import type { Call, CallRepository } from "@ringee/database";
import type { RedisService, TelephonyService } from "@ringee/platform";
import { ConcurrentCallGuardService } from "./concurrent-call-guard.service";

const USER = "user-1";
const LEASE_KEY = `ringee:call-lease:v1:${USER}`;

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
    organizationId: null,
    clientState: Buffer.from("initiate_call").toString("base64"),
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
      LEASE_KEY,
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
      h.store.get(LEASE_KEY),
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

  it("never counts an organization's inbound call against the number's owner", async () => {
    // An inbound row names whoever BOUGHT the number, not whoever picked up —
    // at `call.initiated` nobody has. Counting it would refuse the admin's
    // dials for every call the rest of the team takes: one member blocking
    // another, which is exactly what this rule must never do.
    const started = new Date(Date.now() - 5 * 60_000);
    const h = harness({
      calls: [
        buildCall({
          direction: "inbound",
          status: CallStatus.answered,
          organizationId: "org-1",
          startedAt: started,
          answeredAt: started,
        }),
      ],
      alive: true,
    });

    assert.equal(await h.guard.findOccupyingCall(USER), null);
  });

  it("never counts a server-originated voicemail drop against its sender", async () => {
    // Nobody is on this leg: Telnyx dials it, detects the machine, plays the
    // asset and hangs up. Counting it refuses the agent's next campaign dial
    // for the 20-40 s the drop runs.
    const started = new Date(Date.now() - 30_000);
    const h = harness({
      calls: [
        buildCall({
          organizationId: "org-1",
          startedAt: started,
          createdAt: started,
          clientState: Buffer.from(
            JSON.stringify({ action: "voicemail_drop_send", assetId: "a-1" }),
          ).toString("base64"),
        }),
      ],
      alive: true,
    });

    assert.equal(await h.guard.findOccupyingCall(USER), null);
    assert.equal(
      h.aliveChecks(),
      0,
      "a drop is discarded before the provider is even asked",
    );
  });

  it("still counts a drop-sourced row that is a real call", async () => {
    // `source` is caller-controlled (the session dialer sends "session"), so
    // the client_state marker is what decides — a real leg keeps blocking.
    const started = new Date(Date.now() - 30_000);
    const h = harness({
      calls: [
        buildCall({
          source: "voicemail_drop",
          organizationId: "org-1",
          startedAt: started,
          createdAt: started,
        }),
      ],
      alive: true,
    });

    assert.equal((await h.guard.findOccupyingCall(USER))?.id, "call-1");
  });

  it("still counts a personal workspace's answered inbound call", async () => {
    // Without an organization the number's owner IS the person on the call.
    const started = new Date(Date.now() - 5 * 60_000);
    const h = harness({
      calls: [
        buildCall({
          direction: "inbound",
          status: CallStatus.answered,
          organizationId: null,
          startedAt: started,
          answeredAt: started,
        }),
      ],
      alive: true,
    });

    assert.equal((await h.guard.findOccupyingCall(USER))?.id, "call-1");
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

  it("refuses a second device only while the winning dial is still in flight", async () => {
    // The one window where the lease speaks without the database behind it:
    // another device was approved seconds ago and its leg has not reached
    // `call.initiated`, so there is no row to find yet.
    const h = harness({
      calls: [],
      lease: {
        deviceId: "device-a",
        deviceLabel: "Chrome · macOS",
        callControlId: null,
        at: new Date().toISOString(),
      },
    });

    const decision = await h.guard.requestDial(USER, {
      deviceId: "device-b",
      source: "web",
    });

    assert.equal(decision.allowed, false);
  });

  it("takes over a pre-flight that never became a call", async () => {
    // Approved, never dialed (no caller ID for the country, the browser failed
    // to place the leg, the tab was closed). Nothing is live, so nothing may
    // refuse — this is the phantom "you already have a call in progress".
    const h = harness({
      calls: [],
      lease: {
        deviceId: "device-a",
        callControlId: null,
        at: new Date(Date.now() - 30_000).toISOString(),
      },
    });

    const decision = await h.guard.requestDial(USER, {
      deviceId: "device-b",
      source: "chrome_extension",
    });

    assert.equal(decision.allowed, true);
  });

  it("takes over a bound lease whose call the provider no longer has", async () => {
    // A lost `call.hangup` leaves a lease bound to a leg that is long gone.
    // It used to hold the user for the whole grace window on age alone; now
    // the database (checked against the provider) always has the last word.
    const started = new Date(Date.now() - 20 * 60_000);
    const h = harness({
      calls: [buildCall({ startedAt: started, createdAt: started })],
      alive: false,
      lease: {
        deviceId: "device-a",
        callControlId: "leg-1",
        at: new Date().toISOString(),
      },
    });

    const decision = await h.guard.requestDial(USER, {
      deviceId: "device-b",
      source: "web",
    });

    assert.equal(decision.allowed, true);
    assert.deepEqual(h.closed, ["call-1"]);
  });
});

describe("ConcurrentCallGuardService.release", () => {
  it("frees the slot for the call the lease is bound to", async () => {
    const h = harness({
      calls: [],
      lease: { deviceId: "device-a", callControlId: "leg-1" },
    });

    await h.guard.release(USER, "leg-1");

    assert.equal(h.store.get(LEASE_KEY), undefined);
  });

  it("leaves a reservation for a dial being placed right now", async () => {
    // A late hangup from an older call — or from a voicemail drop, which never
    // took a lease at all — must not free the slot of the dial in flight.
    const h = harness({
      calls: [],
      lease: { deviceId: "device-a", callControlId: null },
    });

    await h.guard.release(USER, "leg-999");

    assert.notEqual(h.store.get(LEASE_KEY), undefined);
  });

  it("leaves the lease of the call that replaced this one", async () => {
    const h = harness({
      calls: [],
      lease: { deviceId: "device-a", callControlId: "leg-2" },
    });

    await h.guard.release(USER, "leg-1");

    assert.notEqual(h.store.get(LEASE_KEY), undefined);
  });

  it("frees unconditionally when no call is named (account termination)", async () => {
    const h = harness({
      calls: [],
      lease: { deviceId: "device-a", callControlId: "leg-1" },
    });

    await h.guard.release(USER);

    assert.equal(h.store.get(LEASE_KEY), undefined);
  });
});

describe("ConcurrentCallGuardService.releasePending", () => {
  it("gives back a reservation the same device never used", async () => {
    const h = harness({
      calls: [],
      lease: { deviceId: "device-a", callControlId: null },
    });

    await h.guard.releasePending(USER, "device-a");

    assert.equal(h.store.get(LEASE_KEY), undefined);
  });

  it("leaves a lease that is already bound to a real call", async () => {
    const h = harness({
      calls: [],
      lease: { deviceId: "device-a", callControlId: "leg-1" },
    });

    await h.guard.releasePending(USER, "device-a");

    assert.notEqual(h.store.get(LEASE_KEY), undefined);
  });

  it("leaves a lease belonging to another device", async () => {
    const h = harness({
      calls: [],
      lease: { deviceId: "device-a", callControlId: null },
    });

    await h.guard.releasePending(USER, "device-b");

    assert.notEqual(h.store.get(LEASE_KEY), undefined);
  });
});
