import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createClient } from "@keyv/redis";
import { RedisService } from "../../redis/redis.service";
import { baselineSettings } from "./dispatch-settings";
import { ProviderDispatchDeferredError } from "./dispatch.types";
import { RingeeManagedAccountResolver } from "./provider-account";
import {
  DispatchRuntime,
  ProviderDispatchService,
} from "./provider-dispatch.service";

vi.mock("@ringee/configuration", () => ({ apiConfiguration: {} }));

// Explicit opt-in. This test controls ONLY a disposable container created for
// this suite, never the application Redis or an arbitrary container name.
const container = process.env.RINGEE_CPS_RESTART_CONTAINER;
const url = process.env.RINGEE_CPS_RESTART_REDIS_URL;
const suite = container && url ? describe : describe.skip;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

suite("provider dispatch across an actual Redis restart", () => {
  it("fails closed during outage and warms a lost budget before new sends", async () => {
    expect(container).toMatch(/^ringee-cps-failover-[a-z0-9-]+$/);
    expect(["127.0.0.1", "localhost"]).toContain(new URL(url!).hostname);
    const docker = (...args: string[]) => {
      const result = spawnSync("docker", [...args, container!], {
        encoding: "utf8",
        timeout: 15_000,
      });
      expect(result.status, result.stderr).toBe(0);
    };
    const client = createClient({
      url,
      disableOfflineQueue: true,
      socket: { connectTimeout: 1_000 },
    });
    client.on("error", () => undefined);
    await client.connect();
    const redis = new RedisService(client as never);
    const options = {
      baseline: baselineSettings({
        mode: "enforce",
        ceilingCps: 5,
        safetyMargin: 0.2,
        orgAutomationCps: 2,
        queueEnabled: true,
        orgConcurrency: 25,
        queueMaxPerWorkspace: 1000,
        queueMaxTotal: 5000,
        queueMaxWaitMinutes: 120,
        surchargeBudgetUsd: 0,
      }),
      resolver: new RingeeManagedAccountResolver(`restart-${randomUUID()}`),
    };
    const dispatch = new ProviderDispatchService(
      redis,
      new DispatchRuntime(),
      options,
    );
    let stopped = false;
    try {
      await dispatch.runInScope({ source: "web_dial" }, () =>
        dispatch.beginEgress("POST", "/calls"),
      );
      docker("stop", "-t", "1");
      stopped = true;
      const automation = await dispatch.admit({
        source: "agent_api",
        maxWaitMs: 0,
      });
      expect(automation).toMatchObject({
        granted: false,
        reason: "coordination_unavailable",
      });
      await expect(
        dispatch.runInScope({ source: "web_dial" }, () =>
          dispatch.beginEgress("POST", "/calls"),
        ),
      ).rejects.toBeInstanceOf(ProviderDispatchDeferredError);
      expect(
        await dispatch.beginEgress("POST", "/calls/existing/actions/answer"),
      ).toBeNull();
      expect(
        await dispatch.beginEgress("POST", "/calls/existing/actions/hangup"),
      ).toBeNull();
      docker("start");
      stopped = false;
      const deadline = Date.now() + 10_000;
      while (!client.isReady && Date.now() < deadline) await sleep(50);
      expect(client.isReady).toBe(true);
      // A process restart also drops the breaker/cache; the account clocks
      // remain shared. This Redis deliberately has persistence disabled.
      const replacement = new ProviderDispatchService(
        redis,
        new DispatchRuntime(),
        options,
      );
      const began = Date.now();
      await replacement.runInScope({ source: "call_transfer" }, () =>
        replacement.beginEgress("POST", "/calls/existing/actions/transfer"),
      );
      expect(Date.now() - began).toBeGreaterThanOrEqual(990);
      const sent: number[] = [];
      const replicas = Array.from(
        { length: 3 },
        () =>
          new ProviderDispatchService(redis, new DispatchRuntime(), options),
      );
      await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          replicas[i % 3].runInScope({ source: "call_transfer" }, async () => {
            await replicas[i % 3].beginEgress(
              "POST",
              "/calls/existing/actions/transfer",
            );
            sent.push(Date.now());
          }),
        ),
      );
      for (const start of sent)
        expect(
          sent.filter((at) => at >= start && at < start + 1000).length,
        ).toBeLessThanOrEqual(5);
    } finally {
      if (stopped) docker("start");
      client.destroy();
    }
  }, 45_000);
});
