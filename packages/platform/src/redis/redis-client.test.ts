import { createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { connectRedisClient } from "./redis-client";

/**
 * Just enough of a Redis server for a client to connect: every command gets
 * `+OK`. `dropAll()` cuts the open connections the way a restart or failover
 * does.
 */
async function fakeRedis(): Promise<{
  url: string;
  dropAll: () => void;
  close: () => Promise<void>;
}> {
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("data", (chunk) => {
      const commands = chunk.toString().match(/\*\d+\r\n/g)?.length ?? 1;
      socket.write("+OK\r\n".repeat(commands));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return {
    url: `redis://127.0.0.1:${address.port}`,
    dropAll: () => sockets.forEach((socket) => socket.destroy()),
    close: () =>
      new Promise<void>((resolve) => {
        sockets.forEach((socket) => socket.destroy());
        server.close(() => resolve());
      }),
  };
}

async function waitFor(condition: () => boolean, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("connectRedisClient", () => {
  const cleanups: Array<() => Promise<void> | void> = [];
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()?.();
  });

  it("survives the server dropping the connection and reconnects", async () => {
    const redis = await fakeRedis();
    cleanups.push(redis.close);
    const errors: string[] = [];
    const client = await connectRedisClient(redis.url, {
      error: (message) => errors.push(message),
    });
    cleanups.push(() => client.destroy());

    // Without an `error` listener this drop is an uncaught exception, which
    // vitest reports and which takes a real process down.
    redis.dropAll();
    await waitFor(() => errors.length > 0);
    expect(errors[0]).toMatch(/^Redis connection error \(reconnecting\)/);

    await waitFor(() => client.isReady);
    expect(client.isReady).toBe(true);
  });
});
