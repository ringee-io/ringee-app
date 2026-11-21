import { describe, expect, it } from "vitest";
import { RealtimeBusService } from "./realtime-bus.service";

function fixture() {
  const listeners = new Map<string, (message: string) => void>();
  let connectFailures = 0;
  let subscribeFailures = 0;
  let subscribeCount = 0;
  let unsubscribeCount = 0;
  let gate: Promise<void> = Promise.resolve();
  const subscriber = {
    on: () => undefined,
    connect: async () => {
      await gate;
      if (connectFailures-- > 0) throw new Error("connection unavailable");
    },
    subscribe: async (channel: string, listener: (message: string) => void) => {
      subscribeCount++;
      if (subscribeFailures-- > 0) throw new Error("subscription unavailable");
      listeners.set(channel, listener);
    },
    unsubscribe: async (channel: string) => {
      unsubscribeCount++;
      listeners.delete(channel);
    },
    quit: async () => {
      listeners.clear();
    },
  };
  const bus = new RealtimeBusService({
    duplicate: () => subscriber,
    publish: async (channel: string, message: string) => {
      listeners.get(channel)?.(message);
      return listeners.has(channel) ? 1 : 0;
    },
  } as never);
  return {
    bus,
    failConnect: () => {
      connectFailures++;
    },
    failSubscribe: () => {
      subscribeFailures++;
    },
    blockConnect: (value: Promise<void>) => {
      gate = value;
    },
    subscribeCount: () => subscribeCount,
    unsubscribeCount: () => unsubscribeCount,
  };
}

describe("realtime relay initialization", () => {
  it("retries a failed connection without retaining a phantom channel or its handlers", async () => {
    const f = fixture();
    const received: unknown[] = [];
    f.failConnect();
    await expect(
      f.bus.subscribe("dialer", () => received.push("failed")),
    ).rejects.toThrow("connection unavailable");
    const stop = await f.bus.subscribe("dialer", (value) =>
      received.push(value),
    );
    await f.bus.publish("dialer", { attemptId: "attempt" });
    expect(received).toEqual([{ attemptId: "attempt" }]);
    expect(f.subscribeCount()).toBe(1);
    stop();
    await f.bus.onModuleDestroy();
  });

  it("can retry a refused SUBSCRIBE on an established connection", async () => {
    const f = fixture();
    f.failSubscribe();
    await expect(f.bus.subscribe("dialer", () => undefined)).rejects.toThrow(
      "subscription unavailable",
    );
    const received: unknown[] = [];
    const stop = await f.bus.subscribe("dialer", (value) =>
      received.push(value),
    );
    await f.bus.publish("dialer", "connected");
    expect(received).toEqual(["connected"]);
    expect(f.subscribeCount()).toBe(2);
    stop();
    await f.bus.onModuleDestroy();
  });

  it("makes concurrent subscribers wait for the same real subscription", async () => {
    const f = fixture();
    let release!: () => void;
    f.blockConnect(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const received: unknown[] = [];
    let ready = 0;
    const attach = () =>
      f.bus
        .subscribe("dialer", (value) => received.push(value))
        .then((stop) => {
          ready++;
          return stop;
        });
    const first = attach();
    const second = attach();
    await Promise.resolve();
    expect(ready).toBe(0);
    release();
    const [stopFirst, stopSecond] = await Promise.all([first, second]);
    expect(f.subscribeCount()).toBe(1);
    await f.bus.publish("dialer", "call.initiate");
    expect(received).toEqual(["call.initiate", "call.initiate"]);
    stopFirst();
    expect(f.unsubscribeCount()).toBe(0);
    stopSecond();
    expect(f.unsubscribeCount()).toBe(1);
    await f.bus.onModuleDestroy();
  });
});
