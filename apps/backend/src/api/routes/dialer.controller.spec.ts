/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import { SSEBridgeService } from "@ringee/services";
import { DialerController } from "./dialer.controller";

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise(setImmediate);
};
const startedAt = new Date("2026-11-21T10:00:00Z");

function fixture() {
  let relayAvailable = true;
  const handlers = new Set<(value: unknown) => void>();
  const bridge = new SSEBridgeService({
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
    getById: async () => ({ ...session }),
    getByIdForOrg: async () => ({ ...session }),
    activateAfterEvents: async () => {
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
    {} as never,
    {} as never,
    {} as never,
    bridge,
    {} as never,
  );
  const stream = (version = startedAt) =>
    (
      controller as unknown as {
        sessionEvents(
          id: string,
          version: Date,
        ): ReturnType<SSEBridgeService["subscribe"]>;
      }
    ).sessionEvents("session", version);
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
  it("filters a delayed takeover event and identifies snapshots overtaken by live events", async () => {
    const f = fixture();
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
  it("attaches delivery before activation and never replays a dial on reconnect", async () => {
    const f = fixture();
    const received: string[] = [];
    const first = f.stream().subscribe((event) => received.push(event.type!));
    await settle();
    assert.deepEqual(received, [
      "session.connected",
      "lead.assigned",
      "call.initiate",
    ]);
    first.unsubscribe();
    const next = f.stream().subscribe((event) => received.push(event.type!));
    await settle();
    assert.equal(f.activations(), 1);
    assert.equal(
      received.filter((event) => event === "call.initiate").length,
      1,
    );
    next.unsubscribe();
    f.bridge.onModuleDestroy();
  });

  it("does not activate a disconnected stream or a stream for an old incarnation", async () => {
    const f = fixture();
    const subscription = f.stream().subscribe();
    subscription.unsubscribe();
    await settle();
    assert.equal(f.activations(), 0);
    let error: unknown;
    const old = f.stream(new Date(startedAt.getTime() - 1)).subscribe({
      error: (value) => {
        error = value;
      },
    });
    await settle();
    assert.ok(error instanceof UnauthorizedException);
    assert.equal(f.activations(), 0);
    old.unsubscribe();
    f.bridge.onModuleDestroy();
  });

  it("surfaces relay failure and leaves the pending session out of the dialer queue", async () => {
    const f = fixture();
    f.failRelay();
    let error: unknown;
    const subscription = f.stream().subscribe({
      error: (value) => {
        error = value;
      },
    });
    await settle();
    assert.ok(error);
    assert.equal(f.activations(), 0);
    assert.equal(f.session.status, "offline");
    subscription.unsubscribe();
    f.bridge.onModuleDestroy();
  });

  it("refuses to mint an event ticket for a replaced incarnation", async () => {
    const f = fixture();
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
});
