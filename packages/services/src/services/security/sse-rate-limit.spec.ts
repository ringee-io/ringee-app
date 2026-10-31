import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HttpException } from "@nestjs/common";
import { SseRateLimitGuard } from "../../../../../apps/backend/src/api/guards/sse-rate-limit.guard";

function setup() {
  const counts = new Map<string, number>();
  const redis = {
    down: false,
    incrementWithExpiry: async (key: string, ttl: number) => {
      if (redis.down) throw new Error("connection refused");
      assert.equal(ttl, 60);
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return count;
    },
  };
  const guard = new SseRateLimitGuard(redis as never);
  const responseHeaders: Record<string, string> = {};
  const request = {
    ip: "192.0.2.1",
    headers: {} as Record<string, string>,
    socket: { remoteAddress: "192.0.2.1" },
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({
        setHeader: (name: string, value: string) => {
          responseHeaders[name] = value;
        },
      }),
    }),
  } as never;
  return { guard, redis, request, context, responseHeaders };
}

async function refused(promise: Promise<boolean>) {
  await assert.rejects(
    promise,
    (error: unknown) =>
      error instanceof HttpException && error.getStatus() === 429,
  );
}

function withRailway<T>(value: string | undefined, run: () => Promise<T>) {
  const previous = process.env.RAILWAY_ENVIRONMENT_ID;
  if (value === undefined) delete process.env.RAILWAY_ENVIRONMENT_ID;
  else process.env.RAILWAY_ENVIRONMENT_ID = value;
  return run().finally(() => {
    if (previous === undefined) delete process.env.RAILWAY_ENVIRONMENT_ID;
    else process.env.RAILWAY_ENVIRONMENT_ID = previous;
  });
}

describe("public stream rate limit", () => {
  it("limits the trusted source IP across streams, ignoring spoofed forwarded headers", () =>
    withRailway(undefined, async () => {
      const { guard, request, context, responseHeaders } = setup();
      request.headers["x-forwarded-for"] = "fake";
      request.headers["x-real-ip"] = "198.51.100.7";
      for (let i = 0; i < 600; i++)
        assert.equal(await guard.canActivate(context), true);
      request.headers["x-forwarded-for"] = "different-fake";
      request.headers["x-real-ip"] = "198.51.100.8";
      await refused(guard.canActivate(context));
      assert.equal(responseHeaders["Retry-After"], "60");
      request.ip = "192.0.2.2";
      assert.equal(await guard.canActivate(context), true);
    }));

  it("tells apart clients that reach the API through Railway's edge", () =>
    withRailway("env-1", async () => {
      // Every request arrives from the proxy; the edge names the client.
      const { guard, request, context } = setup();
      request.headers["x-real-ip"] = "198.51.100.7";
      for (let i = 0; i < 600; i++)
        assert.equal(await guard.canActivate(context), true);
      await refused(guard.canActivate(context));
      request.headers["x-real-ip"] = "198.51.100.8";
      assert.equal(await guard.canActivate(context), true);
    }));

  it("lets streams open while the limiter's store is unavailable", async () => {
    const { guard, redis, context } = setup();
    redis.down = true;
    assert.equal(await guard.canActivate(context), true);
  });
});
