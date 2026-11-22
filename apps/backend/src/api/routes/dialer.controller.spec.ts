/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";
import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { SSEBridgeService } from "@ringee/services";
import { DialerController } from "./dialer.controller";

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise(setImmediate);
};
const startedAt = new Date("2026-11-21T10:00:00Z");

function fixture(t: TestContext) {
  let relayAvailable = true;
  const handlers = new Set<(value: unknown) => void>();
  const bridge = new SSEBridgeService({
    isSubscriptionReady: () => relayAvailable,
    subscribe: async (_channel: string, handler: (value: unknown) => void) => {
      if (!relayAvailable) throw new Error("relay unavailable");
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    tryPublish: async (_channel: string, value: unknown) => {
      for (const handler of handlers) queueMicrotask(() => handler(value));
      return relayAvailable;
    },
  } as never);
  t.after(() => bridge.onModuleDestroy());
  const session = {
    id: "session",
    campaignId: "campaign",
    status: "offline",
    startedAt,
    endedAt: null,
    currentLeadId: null,
    callsAttempted: 0,
    callsConnected: 0,
    totalTalkSec: 0,
  };
  let activations = 0;
  const sessions = {
    startSession: async (data: { waitForEvents?: boolean }) => ({
      ...session,
      awaitingEvents: data.waitForEvents === true,
    }),
    getById: async () => ({ ...session }),
    getByIdForOrg: async () => ({ ...session }),
    activateAfterEvents: async (
      _id: string,
      _version: Date,
      isAttached: () => boolean = () => true,
    ) => {
      if (!isAttached()) return;
      activations++;
      session.status = "ready";
      // Dispatch immediately on activation, before the activation request even
      // returns. The already-attached subscriber must receive both events.
      bridge.emit("agent:session", "lead.assigned", {
        attemptId: "attempt",
        sessionStartedAt: startedAt.toISOString(),
      });
      bridge.emit("agent:session", "call.initiate", {
        attemptId: "attempt",
        sessionStartedAt: startedAt.toISOString(),
      });
    },
  };
  const controller = new DialerController(
    sessions as never,
    {} as never,
    {} as never,
    {} as never,
    {
      assertDialableCampaign: async () => ({ dialerMode: "progressive" }),
    } as never,
    {} as never,
    {} as never,
    bridge,
    {} as never,
  );
  const stream = (version = startedAt, versionedTicket = true) =>
    (
      controller as unknown as {
        sessionEvents(
          id: string,
          version: Date,
          activationVersion?: Date,
        ): ReturnType<SSEBridgeService["subscribe"]>;
      }
    ).sessionEvents("session", version, versionedTicket ? version : undefined);
  return {
    controller,
    session,
    sessions,
    stream,
    bridge,
    activations: () => activations,
    failRelay: () => {
      relayAvailable = false;
    },
  };
}

describe("dialer stream activation", () => {
  it("passes the stream lifecycle through an in-flight activation", async (t) => {
    const f = fixture(t);
    let began!: () => void;
    let release!: () => void;
    const starting = new Promise<void>((resolve) => {
      began = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let attachedAtCompletion = true;
    f.sessions.activateAfterEvents = async (
      _id,
      _version,
      isAttached = () => true,
    ) => {
      began();
      await gate;
      attachedAtCompletion = isAttached();
    };
    const subscription = f.stream().subscribe();
    t.after(() => {
      release();
      subscription.unsubscribe();
    });
    await starting;
    subscription.unsubscribe();
    release();
    await settle();
    assert.equal(attachedAtCompletion, false);
  });
  it("filters a delayed takeover event and identifies snapshots overtaken by live events", async (t) => {
    const f = fixture(t);
    f.session.status = "ready";
    f.sessions.getById = async () => {
      const snapshot = { ...f.session };
      f.bridge.emit("agent:session", "session.state", {
        status: "dialing",
        sessionStartedAt: startedAt.toISOString(),
      });
      return snapshot;
    };
    const received: Array<{ type?: string; data: string | object }> = [];
    const subscription = f.stream().subscribe((event) => received.push(event));
    t.after(() => subscription.unsubscribe());
    f.bridge.emit("agent:session", "session.state", {
      status: "offline",
      sessionStartedAt: new Date(startedAt.getTime() - 1).toISOString(),
    });
    await settle();
    assert.equal(
      received.filter((event) => event.type === "session.state").length,
      1,
    );
    const snapshot = JSON.parse(
      received.find((event) => event.type === "session.connected")!
        .data as string,
    );
    assert.equal(snapshot.snapshotStale, true);
    subscription.unsubscribe();
    f.bridge.onModuleDestroy();
  });
  it("attaches delivery before activation and never replays a dial on reconnect", async (t) => {
    const f = fixture(t);
    const received: string[] = [];
    const first = f.stream().subscribe((event) => received.push(event.type!));
    t.after(() => first.unsubscribe());
    await settle();
    assert.deepEqual(received, [
      "session.connected",
      "lead.assigned",
      "call.initiate",
    ]);
    first.unsubscribe();
    const next = f.stream().subscribe((event) => received.push(event.type!));
    t.after(() => next.unsubscribe());
    await settle();
    assert.equal(f.activations(), 1);
    assert.equal(
      received.filter((event) => event === "call.initiate").length,
      1,
    );
    next.unsubscribe();
    f.bridge.onModuleDestroy();
  });

  it("does not activate a disconnected stream or a stream for an old incarnation", async (t) => {
    const f = fixture(t);
    const subscription = f.stream().subscribe();
    t.after(() => subscription.unsubscribe());
    subscription.unsubscribe();
    await settle();
    assert.equal(f.activations(), 0);
    let error: unknown;
    const old = f.stream(new Date(startedAt.getTime() - 1)).subscribe({
      error: (value) => {
        error = value;
      },
    });
    t.after(() => old.unsubscribe());
    await settle();
    assert.ok(error instanceof UnauthorizedException);
    assert.equal(f.activations(), 0);
    old.unsubscribe();
    f.bridge.onModuleDestroy();
  });

  it("surfaces relay failure and leaves the pending session out of the dialer queue", async (t) => {
    const f = fixture(t);
    f.failRelay();
    let error: unknown;
    const subscription = f.stream().subscribe({
      error: (value) => {
        error = value;
      },
    });
    t.after(() => subscription.unsubscribe());
    await settle();
    assert.ok(error);
    assert.equal(f.activations(), 0);
    assert.equal(f.session.status, "offline");
    subscription.unsubscribe();
    f.bridge.onModuleDestroy();
  });

  it("refuses to mint an event ticket for a replaced incarnation", async (t) => {
    const f = fixture(t);
    await assert.rejects(
      f.controller.eventsTicket(
        "session",
        { startedAt: new Date(startedAt.getTime() - 1).toISOString() },
        { id: "user", activeOrgId: "org" },
      ),
      UnauthorizedException,
    );
    f.bridge.onModuleDestroy();
  });

  it("keeps a running legacy session delivering locally when Redis is unavailable", async (t) => {
    const f = fixture(t);
    f.session.status = "ready";
    f.failRelay();
    const received: string[] = [];
    const subscription = f
      .stream(startedAt, false)
      .subscribe((event) => received.push(event.type!));
    t.after(() => subscription.unsubscribe());
    await settle();
    f.bridge.emit("agent:session", "lead.assigned", {
      sessionStartedAt: startedAt.toISOString(),
    });
    assert.deepEqual(received, ["session.connected", "lead.assigned"]);
  });

  it("requires matching versions for session events and forwards transport heartbeats separately", async (t) => {
    const f = fixture(t);
    f.session.status = "ready";
    const received: string[] = [];
    const subscription = f
      .stream()
      .subscribe((event) => received.push(event.type!));
    t.after(() => subscription.unsubscribe());
    await settle();
    f.bridge.emit("agent:session", "session.state", { status: "reserved" });
    f.bridge.emit("agent:session", "heartbeat", {});
    await settle();
    assert.deepEqual(received, ["session.connected", "heartbeat"]);
  });

  it("cannot activate a pending incarnation with a legacy ticket or consume its replacement", async (t) => {
    const f = fixture(t);
    let error: unknown;
    const subscription = f.stream(startedAt, false).subscribe({
      error: (value) => {
        error = value;
      },
    });
    t.after(() => subscription.unsubscribe());
    await settle();
    assert.ok(error instanceof UnauthorizedException);
    assert.equal(f.activations(), 0);

    f.session.status = "ready";
    const received: string[] = [];
    const legacy = f
      .stream(startedAt, false)
      .subscribe((event) => received.push(event.type!));
    t.after(() => legacy.unsubscribe());
    await settle();
    f.session.startedAt = new Date(startedAt.getTime() + 1);
    f.session.status = "offline";
    f.bridge.emit("agent:session", "call.initiate", {
      sessionStartedAt: f.session.startedAt.toISOString(),
    });
    await settle();
    assert.deepEqual(received, ["session.connected"]);
    assert.equal(f.activations(), 0);
  });

  it("waits for relay readiness and refuses activation if it has been lost", async (t) => {
    const f = fixture(t);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = f.bridge.isRelayReady.bind(f.bridge);
    f.bridge.isRelayReady = async () => {
      await gate;
      return ready();
    };
    let error: unknown;
    const subscription = f.stream().subscribe({
      error: (value) => {
        error = value;
      },
    });
    t.after(() => {
      release();
      subscription.unsubscribe();
    });
    await settle();
    assert.equal(f.activations(), 0);
    f.failRelay();
    release();
    await settle();
    assert.ok(error instanceof ServiceUnavailableException);
    assert.equal(f.activations(), 0);
  });

  it("replaces unexpected lookup errors with a fixed client-safe error", async (t) => {
    const f = fixture(t);
    f.sessions.getById = async () => {
      throw new Error("provider-secret");
    };
    let error: unknown;
    const subscription = f.stream().subscribe({
      error: (value) => {
        error = value;
      },
    });
    t.after(() => subscription.unsubscribe());
    await settle();
    assert.ok(error instanceof ServiceUnavailableException);
    assert.equal(error.message, "The dialer event stream could not be opened.");
  });

  it("refuses a replacement that arrives while the stream is waiting for the relay", async (t) => {
    const f = fixture(t);
    f.bridge.isRelayReady = async () => {
      f.session.startedAt = new Date(startedAt.getTime() + 1);
      return true;
    };
    let error: unknown;
    const received: string[] = [];
    const subscription = f.stream().subscribe({
      next: (event) => received.push(event.type!),
      error: (value) => {
        error = value;
      },
    });
    t.after(() => subscription.unsubscribe());
    await settle();
    assert.ok(error instanceof UnauthorizedException);
    assert.deepEqual(received, []);
    assert.equal(f.activations(), 0);
  });

  it("accepts only boolean or omitted waitForEvents at the request boundary", async (t) => {
    const f = fixture(t);
    for (const value of ["true", "false", 1, null, [], {}])
      await assert.rejects(
        f.controller.startSession(
          { campaignId: "campaign", waitForEvents: value } as never,
          { id: "user", activeOrgId: "org" },
        ),
        BadRequestException,
      );
    for (const value of [undefined, false, true]) {
      const result = await f.controller.startSession(
        { campaignId: "campaign", waitForEvents: value },
        { id: "user", activeOrgId: "org" },
      );
      assert.equal(result.awaitingEvents, value === true);
    }
  });
});
