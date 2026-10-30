import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { describe, it } from "node:test";
import { VoiceAgentTestSessionService } from "./voice-agent-test-session.service";

const ctx = { userId: "user-1", organizationId: "org-1" };

function setup() {
  const leases = new Map<string, { token: string; expires: number }>();
  const records = new Map<
    string,
    { agentId: string; assistantId: string; expiresAt: string }
  >();
  const state = {
    enabled: false,
    renewFails: false,
    enableFails: false,
    enableWait: Promise.resolve(),
  };
  const read = (key: string) => {
    const entry = leases.get(key);
    return entry && entry.expires > Date.now() ? entry.token : null;
  };
  const redis = {
    setIfAbsent: async (key: string, token: string, ttl: number) => {
      if (read(key)) return false;
      leases.set(key, { token, expires: Date.now() + ttl * 1000 });
      return true;
    },
    getRaw: async (key: string) => read(key),
    renewLease: async (key: string, token: string, ttl: number) => {
      if (state.renewFails || read(key) !== token) return false;
      leases.set(key, { token, expires: Date.now() + ttl * 1000 });
      return true;
    },
    compareAndSwap: async (key: string, token: string) => {
      if (read(key) !== token) return false;
      leases.delete(key);
      return true;
    },
    hashSet: async (
      _key: string,
      id: string,
      value: typeof records extends Map<string, infer V> ? V : never,
    ) => {
      records.set(id, value);
    },
    hashDeleteUnderLease: async (
      _key: string,
      id: string,
      leaseKey: string,
      token: string,
    ) => {
      if (read(leaseKey) !== token) return false;
      records.delete(id);
      return true;
    },
    hashGetAll: async () => Object.fromEntries(records),
  };
  const agents = {
    require: async () => ({
      id: "agent-1",
      providerAssistantId: "assistant-1",
      type: "test",
    }),
    resolveDefaultVariables: async () => ({}),
  };
  const provider = {
    configureTestAccess: async (_id: string, options: { enabled: boolean }) => {
      if (options.enabled) await state.enableWait;
      state.enabled = options.enabled;
      if (options.enabled && state.enableFails)
        throw new Error("uncertain provider response");
    },
  };
  const service = new VoiceAgentTestSessionService(
    agents as never,
    { require: () => ({ variables: [] }) } as never,
    provider as never,
    redis as never,
  );
  return { service, records, state };
}

describe("voice agent test-session concurrency", () => {
  it("renews the lock while enabling takes longer than its original TTL", async (t) => {
    t.mock.timers.enable({
      apis: ["Date", "setTimeout", "setInterval"],
      now: 1000,
    });
    const { service, records, state } = setup();
    let finish!: () => void;
    state.enableWait = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const start = service.start(ctx, "agent-1");
    await setImmediate();
    for (let step = 0; step < 4; step++) {
      t.mock.timers.tick(10_000);
      await setImmediate();
    }
    const stop = service.end(ctx, "agent-1");
    await setImmediate();
    assert.equal(records.size, 1);
    finish();
    await start;
    t.mock.timers.tick(200);
    await stop;
    assert.equal(state.enabled, false);
    assert.equal(records.size, 0);
  });

  it("restores recovery after a lost lease and a late enable following stop", async (t) => {
    t.mock.timers.enable({
      apis: ["Date", "setTimeout", "setInterval"],
      now: 1000,
    });
    const { service, records, state } = setup();
    let finish!: () => void;
    state.enableWait = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const start = service.start(ctx, "agent-1");
    const rejected = assert.rejects(start, /lease was lost/);
    await setImmediate();
    state.renewFails = true;
    t.mock.timers.tick(31_000);
    await setImmediate();
    await service.end(ctx, "agent-1");
    assert.equal(records.size, 0);
    finish();
    await rejected;
    assert.equal(records.size, 1);
    await service.sweepExpired();
    assert.equal(state.enabled, false);
    assert.equal(records.size, 0);
  });

  it("keeps a recovery record when the provider may have enabled access before failing", async () => {
    const { service, records, state } = setup();
    state.enableFails = true;
    await assert.rejects(service.start(ctx, "agent-1"), /uncertain provider/);
    assert.equal(state.enabled, true);
    assert.equal(records.size, 1);
    await service.sweepExpired();
    assert.equal(state.enabled, false);
    assert.equal(records.size, 0);
  });
});
