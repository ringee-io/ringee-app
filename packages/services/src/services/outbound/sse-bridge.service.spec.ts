import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SSEBridgeService, type SSEMessageEvent } from "./sse-bridge.service";

type Handler = (payload: unknown) => void;

/** One Redis shared by every bus: a publish reaches every subscriber, as JSON. */
class FakeRedis {
  readonly subscribers = new Set<{ channel: string; handler: Handler }>();
  acceptPublishes = true;
  refuseSubscribe = false;

  bus() {
    return {
      subscribe: async (channel: string, handler: Handler) => {
        if (this.refuseSubscribe) throw new Error("redis down");
        const entry = { channel, handler };
        this.subscribers.add(entry);
        return () => this.subscribers.delete(entry);
      },
      tryPublish: async (channel: string, payload: unknown) => {
        if (!this.acceptPublishes) return false;
        const wire = JSON.stringify(payload);
        for (const entry of this.subscribers) {
          if (entry.channel !== channel) continue;
          setImmediate(() => entry.handler(JSON.parse(wire)));
        }
        return true;
      },
    };
  }
}

function bridgeOn(redis: FakeRedis): SSEBridgeService {
  return new SSEBridgeService(redis.bus() as never);
}

function collect(bridge: SSEBridgeService, channel: string) {
  const received: Array<{ type?: string; data: Record<string, unknown> }> = [];
  bridge.subscribe(channel).subscribe((event: SSEMessageEvent) => {
    received.push({
      type: event.type,
      data: JSON.parse(event.data as string) as Record<string, unknown>,
    });
  });
  return received;
}

const settle = async () => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r));
};

describe("SSEBridgeService", () => {
  it("reaches a stream held by another API instance", async () => {
    const redis = new FakeRedis();
    const emitter = bridgeOn(redis);
    const holder = bridgeOn(redis);
    await Promise.all([emitter.listen(), holder.listen()]);

    const received = collect(holder, "agent:s1");
    emitter.emit("agent:s1", "lead.assigned", { leadId: "lead-1" });
    await settle();

    assert.deepEqual(received, [
      {
        type: "lead.assigned",
        data: { leadId: "lead-1", _event: "lead.assigned" },
      },
    ]);
  });

  it("hands an event to its own streams once while the relay listens", async () => {
    const redis = new FakeRedis();
    const bridge = bridgeOn(redis);
    await bridge.listen();

    const received = collect(bridge, "agent:s1");
    bridge.emit("agent:s1", "call.initiate", { leadId: "lead-1" });
    await settle();

    assert.equal(received.length, 1);
  });

  it("delivers locally before the relay listens and skips its own echo", async () => {
    const redis = new FakeRedis();
    const bridge = bridgeOn(redis);

    // subscribe() starts the relay, but the event goes out before it is up.
    const received = collect(bridge, "agent:s1");
    bridge.emit("agent:s1", "call.initiate", { leadId: "lead-1" });
    assert.equal(received.length, 1);

    await settle();
    assert.equal(received.length, 1);
  });

  it("still reaches its own streams when Redis refuses the event", async () => {
    const redis = new FakeRedis();
    const bridge = bridgeOn(redis);
    await bridge.listen();
    redis.acceptPublishes = false;

    const received = collect(bridge, "agent:s1");
    bridge.emit("agent:s1", "session.state", { status: "ready" });
    await settle();

    assert.equal(received.length, 1);
  });

  it("works on its own when the relay cannot subscribe", async () => {
    const redis = new FakeRedis();
    redis.refuseSubscribe = true;
    const bridge = bridgeOn(redis);
    await bridge.listen();

    const received = collect(bridge, "agent:s1");
    bridge.emit("agent:s1", "session.state", { status: "ready" });
    await settle();

    assert.equal(received.length, 1);
  });

  it("keeps each stream to its own channel", async () => {
    const redis = new FakeRedis();
    const bridge = bridgeOn(redis);
    await bridge.listen();

    const received = collect(bridge, "agent:s1");
    bridge.emit("agent:s2", "lead.assigned", { leadId: "lead-9" });
    await settle();

    assert.equal(received.length, 0);
  });
});
