/// <reference types="node" />
import assert from "node:assert/strict";
import { after, before, describe, it, type TestContext } from "node:test";
import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { AgentSessionService, SSEBridgeService } from "@ringee/services";
import { DialerController } from "./dialer.controller";

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise(setImmediate);
};
const startedAt = new Date("2026-11-21T10:00:00Z");
const previousSigningSecret = process.env.SDK_SIGNING_SECRET;
before(() => {
  process.env.SDK_SIGNING_SECRET = "dialer-ticket-test-secret";
});
after(() => {
  if (previousSigningSecret === undefined)
    delete process.env.SDK_SIGNING_SECRET;
  else process.env.SDK_SIGNING_SECRET = previousSigningSecret;
});

function fixture(t: TestContext, setups = new Map<string, string>()) {
  let relayAvailable = true;
  let claimAvailable = true;
  let releaseAvailable = true;
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
    lastHeartbeat: startedAt,
    eventStreamId: null as string | null,
    reservedAt: null,
    endedAt: null,
    currentLeadId: null,
    callsAttempted: 0,
    callsConnected: 0,
    totalTalkSec: 0,
  };
  let activations = 0;
  const streamOwner = {
    sessionRepo: {
      findById: async () => ({ ...session }),
      heartbeat: async (
        _id: string,
        version: Date,
        stream?: { id: string; previousId: string | null },
      ) => {
        if (version.getTime() !== session.startedAt.getTime()) return null;
        if (stream && stream.previousId !== session.eventStreamId) return null;
        session.lastHeartbeat = new Date(session.lastHeartbeat.getTime() + 1);
        if (stream) session.eventStreamId = stream.id;
        return { ...session };
      },
    },
    getSession: async () => ({ ...session }),
    redis: {
      setIfAbsent: async (key: string, value: string) => {
        if (!claimAvailable) throw new Error("redis unavailable");
        if (setups.has(key)) return false;
        setups.set(key, value);
        return true;
      },
      renewLease: async (key: string, value: string) =>
        setups.get(key) === value,
      compareAndSwap: async (key: string, value: string) => {
        if (!releaseAvailable) throw new Error("release failed");
        if (setups.get(key) !== value) return false;
        setups.delete(key);
        return true;
      },
    },
  };
  Object.setPrototypeOf(streamOwner, AgentSessionService.prototype);
  const sessions = {
    claimEventStreamSetup: (id: string, version: Date, legacy = false) =>
      AgentSessionService.prototype.claimEventStreamSetup.call(
        streamOwner as never,
        id,
        version,
        legacy,
      ),
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
      if (!isAttached()) return null;
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
      return { ...session };
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
    { isMember: async () => true } as never,
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
    failClaim: () => {
      claimAvailable = false;
    },
    failRelease: () => {
      releaseAvailable = false;
    },
  };
}

describe("dialer stream activation", () => {
  it("fails an attached stream that loses setup ownership instead of leaving it pending", async (t) => {
    const f = fixture(t);
    f.sessions.activateAfterEvents = async () => null;
    const received: string[] = [];
    let error: unknown;
    const stream = f.stream().subscribe({
      next: (event) => received.push(event.type!),
      error: (value) => {
        error = value;
      },
    });
    t.after(() => stream.unsubscribe());
    await settle();
    assert.ok(error instanceof ServiceUnavailableException);
    assert.deepEqual(received, []);
    assert.equal(stream.closed, true);
  });
  it("buffers activation events until the committed snapshot is available", async (t) => {
    const f = fixture(t);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const activate = f.sessions.activateAfterEvents;
    f.sessions.activateAfterEvents = async (...args) => {
      const committed = await activate(...args);
      await gate;
      return committed;
    };
    const received: Array<{ type?: string; data: string | object }> = [];
    const subscription = f.stream().subscribe((event) => received.push(event));
    t.after(() => {
      release();
      subscription.unsubscribe();
    });
    await settle();
    assert.equal(f.activations(), 1);
    assert.deepEqual(received, []);
    release();
    await settle();
    assert.deepEqual(
      received.map((event) => event.type),
      ["session.connected", "lead.assigned", "call.initiate"],
    );
    assert.equal(JSON.parse(received[0].data as string).status, "ready");
  });

  for (const fails of [false, true]) {
    it(`preserves ${fails ? "setup failure" : "activation success"} when lease release fails`, async (t) => {
      const f = fixture(t);
      f.failRelease();
      if (fails)
        f.sessions.activateAfterEvents = async () => {
          f.bridge.emit("agent:session", "session.state", {
            status: "ready",
            sessionStartedAt: startedAt.toISOString(),
          });
          throw new ServiceUnavailableException(
            "The dialer event relay is unavailable.",
          );
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
      if (fails) {
        assert.ok(error instanceof ServiceUnavailableException);
        assert.equal(error.message, "The dialer event relay is unavailable.");
        assert.deepEqual(received, []);
      } else {
        assert.equal(error, undefined);
        assert.deepEqual(received, [
          "session.connected",
          "lead.assigned",
          "call.initiate",
        ]);
      }
    });
  }

  it("binds tickets to the authorized incarnation even when legacy clients omit startedAt", async (t) => {
    for (const body of [{}, { startedAt: startedAt.toISOString() }]) {
      const f = fixture(t);
      f.session.status = "ready";
      const { ticket } = await f.controller.eventsTicket("session", body, {
        id: "user",
        activeOrgId: "org",
      });
      const received: string[] = [];
      const stream = f.controller
        .events("session", ticket, undefined)
        .subscribe((event) => received.push(event.type!));
      t.after(() => stream.unsubscribe());
      await settle();
      assert.deepEqual(received, ["session.connected"]);
      stream.unsubscribe();
      await settle();
      f.session.startedAt = new Date(startedAt.getTime() + 1);
      let error: unknown;
      const stale = f.controller
        .events("session", ticket, undefined)
        .subscribe({
          error: (value) => {
            error = value;
          },
        });
      t.after(() => stale.unsubscribe());
      await settle();
      assert.ok(error instanceof UnauthorizedException);
      assert.throws(
        () =>
          f.controller.events(
            "session",
            ticket,
            f.session.startedAt.toISOString(),
          ),
        UnauthorizedException,
      );
    }
  });

  it(
    "passes the stream lifecycle through an in-flight activation",
    { timeout: 2_000 },
    async (t) => {
      const f = fixture(t);
      let began!: () => void;
      let release!: () => void;
      let failed!: (error: unknown) => void;
      const starting = new Promise<void>((resolve, reject) => {
        began = resolve;
        failed = reject;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let attachedAtCompletion = true;
      const received: string[] = [];
      f.sessions.activateAfterEvents = async (
        _id,
        _version,
        isAttached = () => true,
      ) => {
        began();
        await gate;
        attachedAtCompletion = isAttached();
        f.bridge.emit("agent:session", "lead.assigned", {
          sessionStartedAt: startedAt.toISOString(),
        });
        return { ...f.session };
      };
      const events = f.stream();
      const subscription = events.subscribe({
        next: (event) => received.push(event.type!),
        error: failed,
      });
      t.after(() => {
        release();
        subscription.unsubscribe();
      });
      await starting;
      subscription.unsubscribe();
      release();
      await settle();
      assert.equal(attachedAtCompletion, false);
      assert.deepEqual(received, []);
    },
  );
  it(
    "keeps setup exclusive across API instances until disconnected activation settles",
    { timeout: 2_000 },
    async (t) => {
      const setups = new Map<string, string>();
      const first = fixture(t, setups);
      const other = fixture(t, setups);
      let began!: () => void;
      let release!: () => void;
      let failed!: (error: unknown) => void;
      const starting = new Promise<void>((resolve, reject) => {
        began = resolve;
        failed = reject;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      first.sessions.activateAfterEvents = async () => {
        first.session.status = "ready";
        began();
        await gate;
        return { ...first.session };
      };
      const stream = first.stream().subscribe({ error: failed });
      t.after(() => {
        release();
        stream.unsubscribe();
      });
      await starting;
      stream.unsubscribe();
      const received: string[] = [];
      await assert.rejects(
        new Promise((_resolve, reject) => {
          const events = other.stream();
          const overlapping = events.subscribe({
            next: (event) => received.push(event.type!),
            error: reject,
          });
          t.after(() => overlapping.unsubscribe());
        }),
        ServiceUnavailableException,
      );
      assert.deepEqual(received, []);
      release();
      await settle();
      const reconnect = other
        .stream()
        .subscribe({ next: (event) => received.push(event.type!) });
      t.after(() => reconnect.unsubscribe());
      await settle();
      assert.equal(other.activations(), 1);
      assert.ok(received.includes("call.initiate"));
    },
  );
  it("filters a delayed takeover event and sends the snapshot before live events", async (t) => {
    const f = fixture(t);
    f.session.status = "ready";
    f.sessions.getById = async () => {
      const snapshot = { ...f.session };
      f.bridge.emit("agent:session", "session.state", {
        status: "offline",
        sessionStartedAt: new Date(startedAt.getTime() - 1).toISOString(),
      });
      f.bridge.emit("agent:session", "session.state", {
        status: "dialing",
        sessionStartedAt: startedAt.toISOString(),
      });
      return snapshot;
    };
    const received: Array<{ type?: string; data: string | object }> = [];
    const subscription = f.stream().subscribe((event) => received.push(event));
    t.after(() => subscription.unsubscribe());
    await settle();
    assert.equal(
      received.filter((event) => event.type === "session.state").length,
      1,
    );
    assert.equal(
      JSON.parse(
        received.find((event) => event.type === "session.state")!
          .data as string,
      ).status,
      "dialing",
    );
    const snapshot = JSON.parse(
      received.find((event) => event.type === "session.connected")!
        .data as string,
    );
    assert.equal(snapshot.snapshotStale, false);
    assert.deepEqual(
      received.map((event) => event.type),
      ["session.connected", "session.state"],
    );
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
    f.failClaim();
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

  it(
    "refuses pending activation when Redis claim operations are unavailable",
    { timeout: 2_000 },
    async (t) => {
      const f = fixture(t);
      f.failClaim();
      const received: string[] = [];
      await assert.rejects(
        new Promise((_resolve, reject) => {
          const events = f.stream();
          const subscription = events.subscribe({
            next: (event) => received.push(event.type!),
            error: reject,
          });
          t.after(() => subscription.unsubscribe());
        }),
        ServiceUnavailableException,
      );
      assert.deepEqual(received, []);
      assert.equal(f.activations(), 0);
    },
  );

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
