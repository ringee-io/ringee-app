import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDispatchRedis } from "../dispatch/dispatch-test-support";
import {
  CallOriginationUncertainError,
  ProviderDispatchDeferredError,
} from "../dispatch/dispatch.types";
import { baselineSettings } from "../dispatch/dispatch-settings";
import { RingeeManagedAccountResolver } from "../dispatch/provider-account";
import {
  DispatchRuntime,
  ProviderDispatchService,
} from "../dispatch/provider-dispatch.service";

/**
 * Every request that starts a call passes through `TelnyxClient.post`, so this
 * is where "no outbound path is unpaced" is proven (CPS-001). The HTTP layer is
 * replaced: nothing here can reach a telephony provider.
 */
const sent: Array<{ url: string; at: number }> = [];
const respond = vi.fn<(url: string) => Promise<unknown>>();

vi.mock("axios", () => ({
  default: {
    create: () => ({
      post: (url: string) => {
        sent.push({ url, at: Date.now() });
        return respond(url);
      },
    }),
  },
}));
vi.mock("@ringee/configuration", () => ({
  apiConfiguration: { TELNYX_API_KEY: "test-key-not-real" },
}));

import { TelnyxClient } from "./telnyx.client";

const fake = new FakeDispatchRedis();

function build(overrides: Record<string, unknown> = {}) {
  const service = new ProviderDispatchService(
    fake as never,
    new DispatchRuntime(),
    {
      baseline: {
        ...baselineSettings({
          mode: "enforce",
          ceilingCps: 5,
          safetyMargin: 0.2,
          orgAutomationCps: 2,
          queueEnabled: false,
          orgConcurrency: 25,
          queueMaxPerWorkspace: 1000,
          queueMaxTotal: 5000,
          queueMaxWaitMinutes: 120,
          surchargeBudgetUsd: 0,
        }),
        ...overrides,
      },
      resolver: new RingeeManagedAccountResolver("client-test"),
      nowMs: () => fake.nowMs,
      sleep: fake.sleep,
      random: () => 0,
      settingsCacheMs: 0,
    },
  );
  fake.idempotency.set(
    "cps:{telnyx-client-test}:l0:egress:initialized",
    Infinity,
  );
  return { service, client: new TelnyxClient(service) };
}

beforeEach(() => {
  sent.length = 0;
  fake.nowMs = 1_800_000_000_000;
  fake.calls = 0;
  fake.failure = "none";
  fake.clocks.clear();
  fake.hours.clear();
  fake.seconds.clear();
  fake.idempotency.clear();
  fake.dedupe.clear();
  respond.mockReset();
  respond.mockResolvedValue({ data: { data: { call_control_id: "cc-1" } } });
});

describe("TelnyxClient and the shared pacing", () => {
  it("does nothing special for a request that does not start a call", async () => {
    const { client } = build();
    await client.post("/calls/v3:abc/actions/hangup", {});
    await client.post("/messages", {});
    expect(sent).toHaveLength(2);
    expect(fake.calls).toBe(0);
  });

  it("paces a declared person's legs one interval apart before they are sent", async () => {
    const { service, client } = build();
    const stamps: number[] = [];
    for (let i = 0; i < 4; i++) {
      await service.runInScope({ source: "inbound_ring" }, async () => {
        await client.post("/calls", { to: "sip:agent@sip.telnyx.com" });
        stamps.push(fake.nowMs);
      });
    }
    expect(sent).toHaveLength(4);
    expect(stamps[1] - stamps[0]).toBe(250);
    expect(stamps[2] - stamps[1]).toBe(250);
    expect(stamps[3] - stamps[2]).toBe(250);
  });

  it("refuses an automated call BEFORE anything is sent, as a 429", async () => {
    const { service, client } = build();
    const scope = {
      source: "agent_api" as const,
      workspace: { userId: "u", organizationId: "o" },
    };
    await service.runInScope(scope, () =>
      client.post("/texml/ai_calls/app-1", { To: "+15555550100" }),
    );
    const deferred = service.runInScope(scope, () =>
      client.post("/texml/ai_calls/app-1", { To: "+15555550101" }),
    );
    await expect(deferred).rejects.toBeInstanceOf(
      ProviderDispatchDeferredError,
    );
    await expect(deferred).rejects.toMatchObject({ status: 429 });
    // Exactly one request left the process.
    expect(sent).toHaveLength(1);
  });

  it("does not mistake a deferral for a provider failure", async () => {
    const { service, client } = build();
    const scope = {
      source: "agent_api" as const,
      workspace: { userId: "u", organizationId: "o" },
    };
    await service.runInScope(scope, () => client.post("/calls", {}));
    const error = await service
      .runInScope(scope, () => client.post("/calls", {}))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect(
      (error as ProviderDispatchDeferredError).getResponse(),
    ).toMatchObject({
      code: "dispatch_deferred",
      reason: "busy",
    });
  });

  it("rechecks an earlier permit at provider egress", async () => {
    const { service, client } = build();
    const decision = await service.admit({ source: "agent_reminder" });
    if (!decision.granted) throw new Error("expected a grant");
    const callsBefore = fake.calls;
    await service.runWithPermit(decision.permit, () =>
      client.post("/texml/ai_calls/app-1", {}),
    );
    // The request itself did not go back to Redis for a grant (it only wrote
    // its outcome, in the background).
    await vi.waitFor(() => expect(fake.hourCounters().accepted).toBe(1));
    expect(fake.calls - callsBefore).toBeGreaterThanOrEqual(2);
    expect(sent).toHaveLength(1);
  });

  it("counts an undeclared call as a bypass, and still paces it", async () => {
    const { service, client } = build();
    await client.post("/calls", {});
    await client.post("/calls", {});
    expect(service.counters.bypass).toBe(2);
    expect(sent).toHaveLength(2);
  });

  it("covers a transfer, which creates a leg, as it covers a dial", async () => {
    const { service, client } = build();
    await client.post("/calls/v3:abc/actions/transfer", {
      to: "sip:x@sip.telnyx.com",
    });
    expect(service.counters.bypass).toBe(1);
  });

  it("records an accepted call, a refusal and an ambiguous failure", async () => {
    const { service, client } = build();
    const scope = { source: "inbound_ring" as const };
    await service.runInScope(scope, () => client.post("/calls", {}));

    respond.mockRejectedValueOnce({
      response: { status: 422, data: { errors: [{ code: "10015" }] } },
    });
    await service
      .runInScope(scope, () => client.post("/calls", {}))
      .catch(() => undefined);

    respond.mockRejectedValueOnce(new Error("socket hang up"));
    await service
      .runInScope(scope, () => client.post("/calls", {}))
      .catch(() => undefined);

    await vi.waitFor(() => {
      expect(fake.hourCounters()).toMatchObject({
        accepted: 1,
        rejected: 1,
        ambiguous: 1,
      });
    });
  });

  it("surfaces a provider rate limit as the provider's own error", async () => {
    const { service, client } = build();
    respond.mockRejectedValueOnce({
      response: { status: 429, data: { errors: [{ code: "90103" }] } },
    });
    const error = await service
      .runInScope({ source: "inbound_ring" }, () => client.post("/calls", {}))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect(error).not.toBeInstanceOf(ProviderDispatchDeferredError);
    await vi.waitFor(() => expect(fake.hourCounters().dps_rejected).toBe(1));
  });

  it("does not pace anything when the limiter is off", async () => {
    const { service, client } = build({ mode: "off" });
    for (let i = 0; i < 5; i++) await client.post("/calls", {});
    expect(sent).toHaveLength(5);
    expect(fake.calls).toBe(0);
    expect(service.counters.bypass ?? 0).toBe(0);
  });

  it("refuses an originating request if dispatch was not injected", async () => {
    const client = new TelnyxClient();
    await expect(client.post("/calls", {})).rejects.toBeInstanceOf(
      ProviderDispatchDeferredError,
    );
    expect(sent).toHaveLength(0);
    await client.post("/calls/existing/actions/hangup", {});
    expect(sent).toHaveLength(1);
  });

  it("never sends a call while Redis is down and the call is automated", async () => {
    const { service, client } = build();
    fake.failure = "error";
    await expect(
      service.runInScope(
        {
          source: "agent_mcp",
          workspace: { userId: "u", organizationId: "o" },
        },
        () => client.post("/texml/ai_calls/app-1", {}),
      ),
    ).rejects.toMatchObject({
      status: 429,
      response: { reason: "coordination_unavailable" },
    });
    expect(sent).toHaveLength(0);
  });

  it("preserves existing calls but defers new legs during a Redis outage", async () => {
    const { service, client } = build();
    fake.failure = "error";
    await expect(
      service.runInScope({ source: "inbound_ring" }, () =>
        client.post("/calls", {}),
      ),
    ).rejects.toBeInstanceOf(ProviderDispatchDeferredError);
    await client.post("/calls/existing/actions/answer", {});
    expect(sent).toHaveLength(1);
  });
});

describe("a call-starting request without an answer", () => {
  const scope = { source: "voicemail_drop" as const };

  it("is uncertain, not a failed dial, when it times out or Telnyx answers 5xx", async () => {
    const { service, client } = build();
    respond.mockRejectedValueOnce(
      Object.assign(new Error("timeout of 30000ms exceeded"), {
        code: "ECONNABORTED",
      }),
    );
    const timedOut = await service
      .runInScope(scope, () => client.post("/calls", {}))
      .catch((e: unknown) => e);
    expect(timedOut).toBeInstanceOf(CallOriginationUncertainError);
    // Whatever read the status before still reads it.
    expect((timedOut as HttpException).getStatus()).toBe(502);

    respond.mockRejectedValueOnce({
      response: { status: 503, data: { errors: [{ code: "x" }] } },
    });
    const unavailable = await service
      .runInScope(scope, () => client.post("/calls", {}))
      .catch((e: unknown) => e);
    expect(unavailable).toBeInstanceOf(CallOriginationUncertainError);
    expect((unavailable as HttpException).getStatus()).toBe(503);
  });

  it("is a plain refusal when Telnyx answered 4xx: no call exists", async () => {
    const { service, client } = build();
    respond.mockRejectedValueOnce({
      response: { status: 422, data: { errors: [{ code: "10015" }] } },
    });
    const refused = await service
      .runInScope(scope, () => client.post("/calls", {}))
      .catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(HttpException);
    expect(refused).not.toBeInstanceOf(CallOriginationUncertainError);
  });

  it("leaves a request that starts no call exactly as it was", async () => {
    const { client } = build();
    respond.mockRejectedValueOnce(new Error("socket hang up"));
    const error = await client
      .post("/calls/v3:abc/actions/hangup", {})
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect(error).not.toBeInstanceOf(CallOriginationUncertainError);
  });
});
