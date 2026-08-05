/// <reference types="node" />

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { JourneyRepository, JourneyMetricsOptions } from "./journey.repository";

/**
 * Inbound metrics, against a real PostgreSQL.
 *
 * These are raw-SQL metrics, so an in-memory Prisma double would assert nothing
 * about the thing that can actually be wrong — the query. Everything here runs
 * against the local database, seeds its own rows under a unique owner, and
 * removes them again.
 *
 * The properties worth pinning:
 *
 * - answered vs missed is decided by `answeredAt`, not by status alone;
 * - inbound desk-phone calls are counted from `sipDeviceId` on *inbound* legs,
 *   never from the generic outbound `sipDeviceCalls` metric;
 * - a callback redeems a missed call only inside 48 hours;
 * - one callback redeems at most one missed call, and each missed call is
 *   redeemed at most once — the property that stops one return call from
 *   clearing an afternoon of missed ones.
 */

const prisma = new PrismaClient();
const repository = new JourneyRepository(prisma as never);

const HOUR = 60 * 60 * 1000;
const BASE = new Date("2026-06-01T09:00:00.000Z");

const options: JourneyMetricsOptions = {
  start: new Date("2026-05-01T00:00:00.000Z"),
  end: new Date("2026-07-01T00:00:00.000Z"),
  timeZone: "UTC",
  minConnectedSeconds: 20,
  meaningfulSeconds: 60,
  campaignMinCalls: 10,
  testDestinations: ["+15550001111"],
};

let userId: string;
let ctx: { userId: string; organizationId: null };
let sipDeviceId: string | null = null;
let databaseAvailable = true;

/** Minutes after BASE, as a Date. */
const at = (hours: number) => new Date(BASE.getTime() + hours * HOUR);

let sequence = 0;
async function call(row: {
  direction: "inbound" | "outbound";
  fromNumber: string;
  toNumber: string;
  startedAt: Date;
  answeredAt?: Date | null;
  endedAt?: Date | null;
  status?: "completed" | "failed" | "pending" | "answered";
  durationSeconds?: number;
  providerCallId?: string | null;
  sipDeviceId?: string | null;
  outcome?: "no_answer" | "voicemail" | "wrong_number" | null;
}) {
  sequence += 1;
  return prisma.call.create({
    data: {
      userId,
      organizationId: null,
      direction: row.direction,
      fromNumber: row.fromNumber,
      toNumber: row.toNumber,
      startedAt: row.startedAt,
      answeredAt: row.answeredAt ?? null,
      endedAt: row.endedAt ?? null,
      status: row.status ?? "completed",
      durationSeconds: row.durationSeconds ?? 120,
      providerCallId:
        row.providerCallId === null
          ? null
          : (row.providerCallId ?? `journey-inbound-spec-${userId}-${sequence}`),
      sipDeviceId: row.sipDeviceId ?? null,
      outcome: row.outcome ?? null,
    },
  });
}

before(async () => {
  try {
    await prisma.$connect();
  } catch {
    databaseAvailable = false;
    return;
  }

  const user = await prisma.user.create({
    data: {
      timezone: "UTC",
      phoneVerified: true,
      // Unique per run so parallel runs never collide.
      clerkId: `journey-inbound-spec-${Date.now()}-${Math.random()}`,
    },
  });
  userId = user.id;
  ctx = { userId, organizationId: null };

  // One owned DID. Inbound calls arrive here; self-dialled inbound is excluded.
  await prisma.numberPurchased.create({
    data: {
      userId,
      phoneNumber: "+15551230000",
      kind: "purchased",
      isoCountry: "US",
    },
  });
});

after(async () => {
  if (!databaseAvailable || !userId) {
    await prisma.$disconnect().catch(() => undefined);
    return;
  }
  await prisma.call.deleteMany({ where: { userId } });
  await prisma.numberPurchased.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  await prisma.$disconnect();
});

/** Clears seeded calls between cases so each one starts from zero. */
async function reset() {
  await prisma.call.deleteMany({ where: { userId } });
}

const skipIfNoDatabase = () => {
  if (!databaseAvailable) {
    // A missing local database must not silently report a pass.
    throw new Error(
      "PostgreSQL is not reachable; inbound metric SQL was not verified.",
    );
  }
};

describe("JourneyRepository — inboundCallsAnswered", () => {
  it("counts an answered inbound call from an external number", async () => {
    skipIfNoDatabase();
    await reset();
    await call({
      direction: "inbound",
      fromNumber: "+14155550001",
      toNumber: "+15551230000",
      startedAt: at(0),
      answeredAt: at(0),
      endedAt: at(0.1),
      durationSeconds: 120,
    });

    const metrics = await repository.getMetrics(ctx, options);
    assert.equal(metrics.inboundCallsAnswered, 1);
  });

  it("does not count a missed inbound call", async () => {
    skipIfNoDatabase();
    await reset();
    await call({
      direction: "inbound",
      fromNumber: "+14155550002",
      toNumber: "+15551230000",
      startedAt: at(0),
      answeredAt: null,
      endedAt: at(0.01),
      durationSeconds: 0,
    });

    const metrics = await repository.getMetrics(ctx, options);
    assert.equal(metrics.inboundCallsAnswered, 0);
  });

  it("does not count an inbound call below the duration floor", async () => {
    skipIfNoDatabase();
    await reset();
    await call({
      direction: "inbound",
      fromNumber: "+14155550003",
      toNumber: "+15551230000",
      startedAt: at(0),
      answeredAt: at(0),
      endedAt: at(0.001),
      durationSeconds: 5,
    });

    const metrics = await repository.getMetrics(ctx, options);
    assert.equal(metrics.inboundCallsAnswered, 0);
  });

  it("does not count an inbound call with no provider corroboration", async () => {
    skipIfNoDatabase();
    await reset();
    await call({
      direction: "inbound",
      fromNumber: "+14155550004",
      toNumber: "+15551230000",
      startedAt: at(0),
      answeredAt: at(0),
      endedAt: at(0.1),
      providerCallId: null,
    });

    const metrics = await repository.getMetrics(ctx, options);
    assert.equal(metrics.inboundCallsAnswered, 0);
  });

  it("does not count an inbound call labelled voicemail", async () => {
    skipIfNoDatabase();
    await reset();
    await call({
      direction: "inbound",
      fromNumber: "+14155550005",
      toNumber: "+15551230000",
      startedAt: at(0),
      answeredAt: at(0),
      endedAt: at(0.1),
      outcome: "voicemail",
    });

    const metrics = await repository.getMetrics(ctx, options);
    assert.equal(metrics.inboundCallsAnswered, 0);
  });

  it("excludes a configured QA number", async () => {
    skipIfNoDatabase();
    await reset();
    await call({
      direction: "inbound",
      fromNumber: "+15550001111",
      toNumber: "+15551230000",
      startedAt: at(0),
      answeredAt: at(0),
      endedAt: at(0.1),
    });

    const metrics = await repository.getMetrics(ctx, options);
    assert.equal(metrics.inboundCallsAnswered, 0);
  });

  it("excludes a call from one of the workspace's own numbers", async () => {
    skipIfNoDatabase();
    await reset();
    await call({
      direction: "inbound",
      fromNumber: "+15551230000",
      toNumber: "+15551230000",
      startedAt: at(0),
      answeredAt: at(0),
      endedAt: at(0.1),
    });

    const metrics = await repository.getMetrics(ctx, options);
    assert.equal(metrics.inboundCallsAnswered, 0);
  });

  it("never counts an outbound call", async () => {
    skipIfNoDatabase();
    await reset();
    await call({
      direction: "outbound",
      fromNumber: "+15551230000",
      toNumber: "+14155550006",
      startedAt: at(0),
      answeredAt: at(0),
      endedAt: at(0.1),
    });

    const metrics = await repository.getMetrics(ctx, options);
    assert.equal(metrics.inboundCallsAnswered, 0);
    assert.equal(metrics.connectedCalls, 1);
  });
});

describe("JourneyRepository — inboundSipDeviceCalls", () => {
  it("counts only answered inbound calls that rang a desk phone", async () => {
    skipIfNoDatabase();
    await reset();

    const unique = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const device = await prisma.sipDevice.create({
      data: {
        userId,
        publicRef: `journey-spec-${unique}`,
        label: "Journey inbound spec",
        telnyxConnectionId: `journey-spec-conn-${unique}`,
        telnyxConnectionName: `journey-spec-conn-${unique}`,
        sipUsername: `journey_spec_${unique}`,
        sipPasswordEncrypted: "not-a-real-secret",
      },
    });
    sipDeviceId = device.id;

    await call({
      direction: "inbound",
      fromNumber: "+14155550010",
      toNumber: "+15551230000",
      startedAt: at(0),
      answeredAt: at(0),
      endedAt: at(0.1),
      sipDeviceId: device.id,
    });
    // Answered inbound on the web dialer — counts as inbound, not as SIP.
    await call({
      direction: "inbound",
      fromNumber: "+14155550011",
      toNumber: "+15551230000",
      startedAt: at(1),
      answeredAt: at(1),
      endedAt: at(1.1),
    });
    // Outbound from the desk phone — must NOT leak into the inbound metric.
    await call({
      direction: "outbound",
      fromNumber: "+15551230000",
      toNumber: "+14155550012",
      startedAt: at(2),
      answeredAt: at(2),
      endedAt: at(2.1),
      sipDeviceId: device.id,
    });

    const metrics = await repository.getMetrics(ctx, options);
    assert.equal(metrics.inboundCallsAnswered, 2);
    assert.equal(metrics.inboundSipDeviceCalls, 1);

    await prisma.call.deleteMany({ where: { userId } });
    await prisma.sipDevice.delete({ where: { id: device.id } });
    sipDeviceId = null;
  });
});

describe("JourneyRepository — inboundMissedFollowedUp", () => {
  /** A missed inbound call from `from`, then an outbound connect `hours` later. */
  async function missedThenCallback(
    from: string,
    missedAtHours: number,
    callbackAtHours: number | null,
  ) {
    await call({
      direction: "inbound",
      fromNumber: from,
      toNumber: "+15551230000",
      startedAt: at(missedAtHours),
      answeredAt: null,
      endedAt: at(missedAtHours + 0.01),
      durationSeconds: 0,
    });
    if (callbackAtHours !== null) {
      await call({
        direction: "outbound",
        fromNumber: "+15551230000",
        toNumber: from,
        startedAt: at(callbackAtHours),
        answeredAt: at(callbackAtHours),
        endedAt: at(callbackAtHours + 0.1),
        durationSeconds: 120,
      });
    }
  }

  it("counts a missed call that was returned within 48 hours", async () => {
    skipIfNoDatabase();
    await reset();
    await missedThenCallback("+14155551001", 0, 4);

    const metrics = await repository.getMetrics(ctx, options);
    assert.equal(metrics.inboundMissedFollowedUp, 1);
  });

  it("counts a callback just inside the 48-hour boundary", async () => {
    skipIfNoDatabase();
    await reset();
    await missedThenCallback("+14155551002", 0, 47.5);

    const metrics = await repository.getMetrics(ctx, options);
    assert.equal(metrics.inboundMissedFollowedUp, 1);
  });

  it("does not count a callback after 48 hours", async () => {
    skipIfNoDatabase();
    await reset();
    await missedThenCallback("+14155551003", 0, 49);

    const metrics = await repository.getMetrics(ctx, options);
    assert.equal(metrics.inboundMissedFollowedUp, 0);
  });

  it("does not count a missed call that was never returned", async () => {
    skipIfNoDatabase();
    await reset();
    await missedThenCallback("+14155551004", 0, null);

    const metrics = await repository.getMetrics(ctx, options);
    assert.equal(metrics.inboundMissedFollowedUp, 0);
  });

  it("does not count a callback that did not connect", async () => {
    skipIfNoDatabase();
    await reset();
    await call({
      direction: "inbound",
      fromNumber: "+14155551005",
      toNumber: "+15551230000",
      startedAt: at(0),
      answeredAt: null,
      endedAt: at(0.01),
      durationSeconds: 0,
    });
    await call({
      direction: "outbound",
      fromNumber: "+15551230000",
      toNumber: "+14155551005",
      startedAt: at(1),
      answeredAt: null,
      endedAt: at(1.01),
      status: "failed",
      durationSeconds: 0,
    });

    const metrics = await repository.getMetrics(ctx, options);
    assert.equal(metrics.inboundMissedFollowedUp, 0);
  });

  it("does not count a call placed BEFORE the missed call", async () => {
    skipIfNoDatabase();
    await reset();
    await call({
      direction: "outbound",
      fromNumber: "+15551230000",
      toNumber: "+14155551006",
      startedAt: at(0),
      answeredAt: at(0),
      endedAt: at(0.1),
    });
    await call({
      direction: "inbound",
      fromNumber: "+14155551006",
      toNumber: "+15551230000",
      startedAt: at(5),
      answeredAt: null,
      endedAt: at(5.01),
      durationSeconds: 0,
    });

    const metrics = await repository.getMetrics(ctx, options);
    assert.equal(metrics.inboundMissedFollowedUp, 0);
  });

  it("lets one callback redeem only ONE of several missed calls", async () => {
    skipIfNoDatabase();
    await reset();
    // Three missed calls from the same person, then a single return call.
    for (const hour of [0, 1, 2]) {
      await call({
        direction: "inbound",
        fromNumber: "+14155551007",
        toNumber: "+15551230000",
        startedAt: at(hour),
        answeredAt: null,
        endedAt: at(hour + 0.01),
        durationSeconds: 0,
      });
    }
    await call({
      direction: "outbound",
      fromNumber: "+15551230000",
      toNumber: "+14155551007",
      startedAt: at(6),
      answeredAt: at(6),
      endedAt: at(6.1),
    });

    const metrics = await repository.getMetrics(ctx, options);
    assert.equal(metrics.inboundMissedFollowedUp, 1);
  });

  it("counts several missed calls when each got its own callback", async () => {
    skipIfNoDatabase();
    await reset();
    await missedThenCallback("+14155551008", 0, 2);
    await missedThenCallback("+14155551009", 10, 12);
    await missedThenCallback("+14155551010", 20, 22);

    const metrics = await repository.getMetrics(ctx, options);
    assert.equal(metrics.inboundMissedFollowedUp, 3);
  });

  it("counts a missed call once even with several callbacks", async () => {
    skipIfNoDatabase();
    await reset();
    await call({
      direction: "inbound",
      fromNumber: "+14155551011",
      toNumber: "+15551230000",
      startedAt: at(0),
      answeredAt: null,
      endedAt: at(0.01),
      durationSeconds: 0,
    });
    for (const hour of [2, 4, 6]) {
      await call({
        direction: "outbound",
        fromNumber: "+15551230000",
        toNumber: "+14155551011",
        startedAt: at(hour),
        answeredAt: at(hour),
        endedAt: at(hour + 0.1),
      });
    }

    const metrics = await repository.getMetrics(ctx, options);
    assert.equal(metrics.inboundMissedFollowedUp, 1);
  });

  it("excludes a QA number from the recovery metric", async () => {
    skipIfNoDatabase();
    await reset();
    await missedThenCallback("+15550001111", 0, 2);

    const metrics = await repository.getMetrics(ctx, options);
    assert.equal(metrics.inboundMissedFollowedUp, 0);
  });

  it("excludes a self-dialled missed call", async () => {
    skipIfNoDatabase();
    await reset();
    await missedThenCallback("+15551230000", 0, 2);

    const metrics = await repository.getMetrics(ctx, options);
    assert.equal(metrics.inboundMissedFollowedUp, 0);
  });
});
