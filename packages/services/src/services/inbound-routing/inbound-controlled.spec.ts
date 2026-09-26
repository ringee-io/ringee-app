import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HttpException } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { signCallCorrelation, type TelephonyEvent } from "@ringee/platform";
import { InboundRingService } from "./inbound-ring.service";

process.env.SDK_SIGNING_SECRET ||= "inbound-controlled-test-secret";
const configuration = apiConfiguration as unknown as Record<string, unknown>;
configuration.TELNYX_CALL_CONTROL_APP_ID = "routing-app";

type Row = Record<string, any>;
function setup(sameUser = false) {
  const call: Row = {
    id: "call",
    callControlId: "caller",
    userId: "owner",
    organizationId: "org",
    direction: "inbound",
    fromNumber: "+12125550199",
    toNumber: "+13055550101",
    answeredAt: new Date(),
    endedAt: null,
    answeredByUserId: null,
    answeredByRingAttemptId: null,
    inboundDestinationType: "ai_receptionist",
    inboundTransferState: "ringing",
  };
  const attempts: Row[] = [
    {
      id: "browser",
      callId: call.id,
      userId: "user-a",
      endpointKey: "browser:one",
      providerCallControlId: "browser-leg",
      recipientConnectionId: "browser-connection",
      status: "ringing",
      chargedCredits: null,
    },
    {
      id: "desk",
      callId: call.id,
      userId: sameUser ? "user-a" : "user-b",
      endpointKey: "desk:one",
      providerCallControlId: "desk-leg",
      recipientConnectionId: "desk-connection",
      status: "ringing",
      chargedCredits: null,
    },
  ];
  const bridges: string[] = [],
    ended: string[] = [],
    cancelled: string[] = [],
    order: string[] = [];
  const debits = new Map<string, number>();
  let member = true;
  let controlled = true;
  const service = Object.assign(Object.create(InboundRingService.prototype), {
    attempts: {
      findByControlId: async (id: string) => {
        const row = attempts.find(
          (a) =>
            a.providerCallControlId === id || a.recipientCallControlId === id,
        );
        return row ? { ...row, call: { ...call } } : null;
      },
      findById: async (id: string) => {
        const row = attempts.find((a) => a.id === id);
        return row ? { ...row, call: { ...call } } : null;
      },
      listByCall: async () => attempts.map((a) => ({ ...a })),
      update: async (id: string, data: Row) =>
        Object.assign(attempts.find((a) => a.id === id)!, data),
      bindRecipient: async (id: string, controlId: string) => {
        attempts.find((a) => a.id === id)!.recipientCallControlId = controlId;
        return { count: 1 };
      },
      endRinging: async (_id: string, params: Row) => {
        const rows = attempts.filter((a) => a.status === "ringing");
        for (const row of rows) row.status = params.status;
        return rows;
      },
    },
    callRepository: {
      findByControlId: async () => ({ ...call }),
      claimInboundEndpoint: async (
        _id: string,
        attemptId: string,
        userId: string,
      ) => {
        if (!call.answeredByRingAttemptId && !call.endedAt)
          Object.assign(call, {
            answeredByRingAttemptId: attemptId,
            answeredByUserId: userId,
          });
        return {
          won: call.answeredByRingAttemptId === attemptId,
          call: { ...call },
        };
      },
      updateControlState: async (_id: string, data: Row) =>
        Object.assign(call, data),
    },
    organizations: { isMember: async () => member },
    telephony: {
      bridgeCalls: async (_caller: string, endpoint: string) => {
        order.push(`bridge:${endpoint}`);
        if (!bridges.includes(endpoint)) bridges.push(endpoint);
      },
      hangupCall: async (id: string) => {
        ended.push(id);
      },
      createTelephonyCredential: async () => ({
        sipUsername: "member-credential",
        sipPassword: "secret",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    },
    voiceAgents: {
      stopInboundAssistant: async (id: string, commandId: string) => {
        order.push(`stop:${id}:${commandId}`);
      },
    },
    routes: { hasControlledRoutes: async () => controlled },
    redis: { hashSet: async () => {} },
    realtime: {
      inboundCallCancelled: async (userId: string) => {
        cancelled.push(userId);
      },
    },
    credits: {
      consumeCredits: async (
        _ctx: unknown,
        amount: number,
        ref: { idempotencyKey: string },
      ) => {
        if (!debits.has(ref.idempotencyKey))
          debits.set(ref.idempotencyKey, amount);
      },
    },
    logger: { warn: () => {}, log: () => {} },
  }) as InboundRingService;
  const event = (id: string, type = "call.answered", overrides: Row = {}) =>
    ({
      type,
      direction: "inbound",
      connectionId: "routing-app",
      callControlId: id,
      callLegId: id,
      callSessionId: "session",
      ...overrides,
    }) as TelephonyEvent;
  return {
    service,
    call,
    attempts,
    bridges,
    ended,
    cancelled,
    debits,
    event,
    order,
    removeMember: () => {
      member = false;
    },
    setControlled: (value: boolean) => {
      controlled = value;
    },
  };
}

describe("Controlled inbound routing", () => {
  for (const sameUser of [false, true])
    it(`elects one endpoint and cancels the loser (${sameUser ? "same" : "different"} member)`, async () => {
      const s = setup(sameUser);
      await Promise.all([
        s.service.handleControlledEvent(s.event("browser-leg")),
        s.service.handleControlledEvent(s.event("desk-leg")),
      ]);
      assert.deepEqual(s.bridges, ["browser-leg"]);
      assert.ok(s.ended.includes("desk-leg"));
      assert.equal(s.call.answeredByUserId, "user-a");
      assert.equal(s.call.inboundTransferState, "connected");
      assert.equal(s.call.callControlId, "caller");
      assert.ok(!s.ended.includes("caller"));
      // The winner's own other endpoint stops, but they are not told their
      // call was cancelled.
      assert.deepEqual(s.cancelled, sameUser ? [] : ["user-b"]);
    });
  it("replays the winner safely without creating or billing another call", async () => {
    const s = setup();
    await s.service.handleControlledEvent(s.event("browser-leg"));
    await s.service.handleControlledEvent(s.event("browser-leg"));
    assert.deepEqual(s.bridges, ["browser-leg"]);
    assert.equal(s.debits.size, 0);
  });
  it("does not connect an endpoint after the caller left or its member was removed", async () => {
    for (const ended of [false, true]) {
      const s = setup();
      if (ended) s.call.endedAt = new Date();
      else s.removeMember();
      await s.service.handleControlledEvent(s.event("browser-leg"));
      assert.deepEqual(s.bridges, []);
      assert.ok(s.ended.includes("browser-leg"));
    }
  });
  it("keeps a receiving browser/handset leg on the original call only with valid correlation and connection", async () => {
    const s = setup();
    const correlated = s.event("receiving-leg", "call.initiated", {
      connectionId: "browser-connection",
      inboundRingAttempt: signCallCorrelation("browser"),
    });
    assert.equal(
      await s.service.handleControlledEvent({
        ...correlated,
        connectionId: "foreign-connection",
      }),
      false,
    );
    assert.equal(
      await s.service.handleControlledEvent({
        ...correlated,
        inboundRingAttempt: "forged",
      }),
      false,
    );
    assert.equal(
      await s.service.handleControlledEvent({
        ...correlated,
        direction: "outbound",
      }),
      false,
    );
    assert.equal(await s.service.handleControlledEvent(correlated), true);
    assert.equal(s.attempts[0].recipientCallControlId, "receiving-leg");
    assert.deepEqual(s.bridges, []);
  });
  it("settles each actual endpoint cost once under an attempt-specific ledger key", async () => {
    const s = setup();
    const event = s.event("browser-leg", "call.cost", {
      cost: { total: "0.1", parts: [] },
    });
    await Promise.all([
      s.service.handleControlledEvent(event),
      s.service.handleControlledEvent(event),
    ]);
    await s.service.handleControlledEvent(event);
    assert.deepEqual([...s.debits.keys()], ["inbound-leg-cost:browser"]);
    assert.equal(s.attempts[0].chargedCredits, [...s.debits.values()][0]);
  });
  it("ends the original caller when the winning human hangs up", async () => {
    const s = setup();
    await s.service.handleControlledEvent(s.event("browser-leg"));
    await s.service.handleControlledEvent(
      s.event("browser-leg", "call.hangup"),
    );
    assert.ok(s.ended.includes("caller"));
  });
  it("retries cleanup of abandoned transfers without touching a connected call", async () => {
    const s = setup();
    let eligible = true;
    Object.assign((s.service as any).callRepository, {
      findStalledInboundTransfers: async () => [{ ...s.call }],
      failStalledInboundTransfer: async () => eligible,
    });
    await s.service.expireStalledTransfers(new Date(), 100);
    assert.ok(s.ended.includes("caller"));
    assert.ok(s.ended.includes("browser-leg"));
    s.ended.length = 0;
    eligible = false;
    await s.service.expireStalledTransfers(new Date(), 100);
    assert.deepEqual(s.ended, []);
  });

  for (const [status, redelivered] of [
    [422, false],
    [502, true],
  ] as const)
    it(`ends the caller after the winner leaves (provider ${status})`, async () => {
      const s = setup();
      await s.service.handleControlledEvent(s.event("browser-leg"));
      // 422: the caller is already gone, which is the outcome wanted. 502: the
      // outcome is unknown, so the webhook must be redelivered.
      (s.service as any).telephony.hangupCall = async () => {
        throw new HttpException("provider", status);
      };
      const handled = s.service.handleControlledEvent(
        s.event("browser-leg", "call.hangup"),
      );
      if (redelivered) await assert.rejects(handled, HttpException);
      else assert.equal(await handled, true);
    });
  it("stops the assistant before a person is bridged to the caller", async () => {
    const s = setup();
    await s.service.handleControlledEvent(s.event("browser-leg"));
    assert.deepEqual(s.order, [
      "stop:caller:receptionist-stop-call",
      "bridge:browser-leg",
    ]);
  });
  it("records an unanswered handoff before ending the caller", async () => {
    const s = setup();
    await s.service.handleControlledEvent(
      s.event("browser-leg", "call.hangup"),
    );
    assert.ok(!s.ended.includes("caller"));
    await s.service.handleControlledEvent(s.event("desk-leg", "call.hangup"));
    assert.ok(s.ended.includes("caller"));
    assert.equal(s.call.inboundTransferState, "failed");
    assert.equal(s.call.errorMessage, "Nobody answered the transfer.");
  });
  it("finishes ending the caller when the last leg's hangup is redelivered", async () => {
    const s = setup();
    await s.service.handleControlledEvent(
      s.event("browser-leg", "call.hangup"),
    );
    const telephony = (s.service as any).telephony;
    const hangup = telephony.hangupCall;
    telephony.hangupCall = async () => {
      throw new HttpException("provider", 502);
    };
    await assert.rejects(
      s.service.handleControlledEvent(s.event("desk-leg", "call.hangup")),
      HttpException,
    );
    const endedAt = s.attempts[1].endedAt;
    assert.ok(endedAt);
    telephony.hangupCall = hangup;
    await s.service.handleControlledEvent(
      s.event("desk-leg", "call.hangup", { occurredAt: new Date(0) }),
    );
    assert.ok(s.ended.includes("caller"));
    assert.equal(s.attempts[1].endedAt, endedAt);
  });
  it("never ends a caller handed back to the assistant when an old leg hangs up", async () => {
    const s = setup();
    s.call.inboundTransferState = null;
    for (const [i, status] of ["cancelled", "failed"].entries())
      Object.assign(s.attempts[i], { status, endedAt: new Date() });
    await s.service.handleControlledEvent(
      s.event("browser-leg", "call.hangup"),
    );
    await s.service.handleControlledEvent(s.event("desk-leg", "call.hangup"));
    assert.deepEqual(s.ended, []);
  });
  it("rings an endpoint again on a new handoff after an earlier one failed", async () => {
    const s = setup();
    const requestedAt = new Date();
    Object.assign(s.call, { inboundTransferRequestedAt: requestedAt });
    // Left by the first handoff: it never got a leg.
    s.attempts.splice(0, s.attempts.length, {
      id: "earlier",
      callId: s.call.id,
      userId: "user-a",
      endpointKey: "browser:one",
      providerCallControlId: null,
      status: "failed",
      endedAt: new Date(requestedAt.getTime() - 1000),
    });
    const dialed: string[] = [];
    Object.assign((s.service as any).attempts, {
      retireEndedBefore: async (_callId: string, before: Date) => {
        for (const a of s.attempts)
          if (a.endedAt && a.endedAt < before && !a.endpointKey.includes("#"))
            a.endpointKey = `${a.endpointKey}#${a.id}`;
      },
      startMany: async (_callId: string, targets: Row[]) => {
        const fresh = targets
          .filter(
            (t) => !s.attempts.some((a) => a.endpointKey === t.endpointKey),
          )
          .map((t) => ({
            ...t,
            id: "retry",
            callId: s.call.id,
            status: "ringing",
            providerCallControlId: null,
          }));
        s.attempts.push(...fresh);
        return fresh;
      },
      bindProvider: async (id: string, controlId: string) => {
        s.attempts.find((a) => a.id === id)!.providerCallControlId = controlId;
        return { count: 1 };
      },
    });
    Object.assign(s.service as any, {
      controlledTargets: async () => [
        {
          userId: "user-a",
          endpointKey: "browser:one",
          sipUsername: "member-credential",
          sipDeviceId: null,
          recipientConnectionId: "browser-connection",
        },
      ],
      ensureInternalCalling: async () => {},
      offerToMember: async () => ({ userId: "user-a", sockets: 1, devices: 0 }),
      callRepository: {
        ...(s.service as any).callRepository,
        findById: async () => ({ ...s.call }),
      },
    });
    (s.service as any).telephony.dialInboundEndpoint = async (params: Row) => {
      dialed.push(params.commandId);
      return {
        callControlId: "retry-leg",
        callLegId: null,
        callSessionId: null,
      };
    };
    const result = await s.service.offerControlled(
      {
        call: { ...s.call },
        ctx: { userId: "owner", organizationId: "org" },
        destination: { type: "user", userId: "user-a" },
        callerName: null,
        origin: { transport: "call_control" },
      } as never,
      ["user-a"],
      45,
    );
    assert.deepEqual(result, { status: "ringing", targets: 1 });
    assert.deepEqual(dialed, ["inbound-endpoint-retry"]);
    assert.equal(s.attempts[0].endpointKey, "browser:one#earlier");
  });
  it("routes an inbound call carrying a copied correlation as an ordinary call", async () => {
    const s = setup();
    const handled = await s.service.handleControlledEvent(
      s.event("carrier-leg", "call.initiated", {
        inboundRingAttempt: signCallCorrelation("browser"),
      }),
    );
    assert.equal(handled, false);
    assert.deepEqual(s.ended, []);
    assert.equal(s.attempts[0].providerCallControlId, "browser-leg");
  });
  it("issues a per-member endpoint only where calls are delivered through one", async () => {
    const s = setup();
    const member = { userId: "user-a", organizationId: "org" };
    assert.deepEqual(
      await s.service.createBrowserEndpoint({
        userId: "user-a",
        organizationId: null,
      }),
      { enabled: false },
    );
    s.setControlled(false);
    assert.deepEqual(await s.service.createBrowserEndpoint(member), {
      enabled: false,
    });
    s.setControlled(true);
    const endpoint = await s.service.createBrowserEndpoint(member);
    assert.equal(endpoint.enabled, true);
  });

  it("does not permit a human claim during an AI-only conversation", async () => {
    const s = setup();
    s.call.inboundTransferState = null;
    assert.equal((await s.service.claim("caller", "owner")).status, "gone");
  });
});
