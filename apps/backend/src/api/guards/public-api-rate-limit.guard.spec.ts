/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from "@nestjs/common";
import {
  PUBLIC_API_MAX_REQUESTS,
  PUBLIC_API_WINDOW_SECONDS,
  PublicApiRateLimitGuard,
} from "./public-api-rate-limit.guard";

function build(options: { count?: number; redisError?: Error } = {}) {
  const buckets: Array<{ key: string; seconds: number }> = [];
  const headers: Record<string, string> = {};
  const guard = new PublicApiRateLimitGuard({
    incrementWithExpiry: async (key: string, seconds: number) => {
      buckets.push({ key, seconds });
      if (options.redisError) throw options.redisError;
      return options.count ?? 1;
    },
  } as never);
  const context = (integrationId?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          customIntegrationAuth: integrationId
            ? { integration: { id: integrationId } }
            : undefined,
        }),
        getResponse: () => ({
          setHeader: (name: string, value: string) => {
            headers[name] = value;
          },
        }),
      }),
    }) as never;
  return { guard, context, buckets, headers };
}

describe("PublicApiRateLimitGuard (HOOK-006)", () => {
  it("counts per authenticated integration", async () => {
    const { guard, context, buckets } = build();

    assert.equal(await guard.canActivate(context("integration-1")), true);

    assert.deepEqual(buckets, [
      {
        key: "ringee:public-api:rl:integration-1",
        seconds: PUBLIC_API_WINDOW_SECONDS,
      },
    ]);
  });

  it("lets the last request in the window through and refuses the next", async () => {
    const atLimit = build({ count: PUBLIC_API_MAX_REQUESTS });
    assert.equal(await atLimit.guard.canActivate(atLimit.context("i")), true);

    const over = build({ count: PUBLIC_API_MAX_REQUESTS + 1 });
    await assert.rejects(
      over.guard.canActivate(over.context("i")),
      (error: unknown) =>
        error instanceof HttpException &&
        error.getStatus() === HttpStatus.TOO_MANY_REQUESTS,
    );
    assert.equal(
      over.headers["Retry-After"],
      String(PUBLIC_API_WINDOW_SECONDS),
    );
  });

  it("paces rather than blocks when Redis is down", async () => {
    const { guard, context } = build({ redisError: new Error("down") });

    assert.equal(await guard.canActivate(context("integration-1")), true);
  });

  it("fails closed when it runs before the key guard", async () => {
    const { guard, context, buckets } = build();

    await assert.rejects(
      guard.canActivate(context(undefined)),
      UnauthorizedException,
    );
    assert.deepEqual(buckets, []);
  });
});
