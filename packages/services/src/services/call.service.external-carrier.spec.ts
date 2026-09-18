import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ForbiddenException,
  HttpException,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { CallStatus } from "@ringee/database";
import {
  signCallCorrelation,
  verifyCallCorrelation,
  type TelephonyEvent,
} from "@ringee/platform";
import { CallService } from "./call.service";
import { parseSipTarget } from "./external-carrier/sip-target";

process.env.SDK_SIGNING_SECRET ||= "external-carrier-spec-secret";

const ctx = { userId: "user-1", organizationId: "org-1" };
const HOST = "generated.example.net";
const route = {
  fromNumber: "+13055550101",
  toNumber: "+12125550199",
  destinationUri: `sip:+12125550199@${HOST}`,
  externalCarrierId: "carrier-1",
  externalSipEndpointId: "endpoint-1",
};

type Row = {
  id: string;
  userId: string;
  organizationId: string | null;
  fromNumber: string;
  toNumber: string;
  direction: string;
  status: CallStatus;
  callControlId: string | null;
  externalSipEndpointId: string | null;
  createdAt: Date;
};

function setup() {
  const rows = new Map<string, Row>();
  const hangups: string[] = [];
  const failed: string[] = [];
  const claims: Array<{ id: string; data: Record<string, unknown> }> = [];
  const hostLookups: string[] = [];
  const state = {
    canCall: true,
    freeCallTrial: false,
    balance: 5,
    routeHost: HOST as string | null,
    carrierHosts: [HOST],
    busy: false,
  };
  const callRepository = {
    createCall: async (owner: typeof ctx, data: Record<string, unknown>) => {
      const row = {
        id: `call-${rows.size + 1}`,
        userId: owner.userId,
        organizationId: owner.organizationId,
        callControlId: null,
        createdAt: new Date(),
        ...data,
      } as unknown as Row;
      rows.set(row.id, row);
      return row;
    },
    findById: async (id: string) => rows.get(id) ?? null,
    findByControlId: async (id: string) =>
      [...rows.values()].find((row) => row.callControlId === id) ?? null,
    updateCost: async (id: string, cost: number) => {
      const row = [...rows.values()].find((row) => row.callControlId === id);
      if (row) Object.assign(row, { totalCost: cost });
    },
    failPendingExternalCall: async (_owner: unknown, id: string) => {
      const row = rows.get(id);
      if (row?.status === CallStatus.pending && !row.callControlId) {
        row.status = CallStatus.failed;
        failed.push(id);
      }
    },
    claimPendingCall: async (id: string, data: Record<string, unknown>) => {
      const row = rows.get(id);
      if (!row || row.status !== CallStatus.pending || row.callControlId)
        return false;
      Object.assign(row, data, { status: CallStatus.ringing });
      claims.push({ id, data });
      return true;
    },
  };
  const deps = {
    logger: Object.assign(new Logger("spec"), {
      log: () => {},
      debug: () => {},
      warn: () => {},
      error: () => {},
    }),
    lowBalanceHangupTimers: new Map(),
    callRepository,
    userService: {
      getCachedUserById: async () => ({
        id: ctx.userId,
        canCall: state.canCall,
        freeCallTrial: state.freeCallTrial,
      }),
    },
    creditService: {
      getBalance: async () => state.balance,
      consumeCredits: async () => {
        state.balance--;
      },
    },
    contactService: { findByPhone: async () => null },
    telephonyService: {
      hangupCall: async (id: string) => {
        hangups.push(id);
      },
    },
    concurrentCallGuard: {
      appliesTo: async () => false,
      findOccupyingCall: async () => (state.busy ? { id: "other" } : null),
      bindToCall: async () => {},
    },
    redis: { get: async () => undefined, del: async () => {} },
    inboxTimelineService: { ensureThreadForCall: async () => {} },
    voicemailDropService: {
      parseClientState: () => null,
      isPlaybackState: () => false,
    },
    voiceAgentResults: { handleTelephonyEvent: async () => false },
    externalCarriers: {
      resolveOutbound: async () => route,
      confirmOutboundRoute: async () => state.routeHost,
      isCarrierHost: async (host: string) => {
        hostLookups.push(host);
        return state.carrierHosts.includes(host.toLowerCase());
      },
    },
  };
  const service = Object.assign(
    Object.create(CallService.prototype),
    deps,
  ) as CallService;
  const leg = (overrides: Partial<TelephonyEvent> = {}): TelephonyEvent => ({
    type: "call.initiated",
    provider: "telnyx",
    providerEventType: "call.initiated",
    callControlId: "leg-1",
    connectionId: "webrtc-connection",
    callSessionId: "session-1",
    callLegId: "leg-id-1",
    clientState: null,
    direction: "outbound",
    from: "sip:gencred@sip.telnyx.com",
    to: route.destinationUri,
    occurredAt: new Date(),
    startedAt: new Date("2026-09-17T12:00:00Z"),
    customHeaders: [],
    conversation: null,
    payload: {},
    ...overrides,
  });
  const withToken = (token: string, overrides: Partial<TelephonyEvent> = {}) =>
    leg({
      customHeaders: [{ name: "x-ringee-byoc-call-id", value: token }],
      ...overrides,
    });
  return {
    service,
    rows,
    hangups,
    failed,
    claims,
    hostLookups,
    state,
    leg,
    withToken,
  };
}

describe("parseSipTarget", () => {
  it("reduces a webhook destination to the user and host a route is compared on", () => {
    assert.deepEqual(parseSipTarget(`sip:+12125550199@${HOST}`), {
      user: "+12125550199",
      host: HOST,
    });
    assert.deepEqual(
      parseSipTarget(
        "<sips:%2B12125550199@Generated.Example.NET:5061;transport=tls>",
      ),
      { user: "+12125550199", host: HOST },
    );
    assert.equal(parseSipTarget("+12125550199"), null);
    assert.equal(parseSipTarget(""), null);
    assert.equal(parseSipTarget(null), null);
    assert.equal(parseSipTarget(`sip:+12125550199@evil.example@${HOST}`), null);
  });
});

describe("CallService external carrier outbound", () => {
  it("retries a cost delivered before adoption, then settles the adopted call once", async () => {
    const s = setup();
    const { callToken } = await s.service.prepareExternalOutbound(
      ctx,
      "number-1",
      "+12125550199",
    );
    const cost = s.leg({
      type: "call.cost",
      payload: { total_cost: "0.01", cost_parts: [] },
    });
    await assert.rejects(
      s.service.handleTelephonyEvent(cost),
      ServiceUnavailableException,
    );
    await s.service.handleTelephonyEvent(s.withToken(callToken));
    await s.service.handleTelephonyEvent(cost);
    const balance = s.state.balance;
    assert.equal(balance, 4);
    await s.service.handleTelephonyEvent(cost);
    assert.equal(s.state.balance, balance);
    assert.ok("totalCost" in s.rows.get(verifyCallCorrelation(callToken)!)!);
  });
  it("pre-creates the call on the existing Call model and signs a token for it", async () => {
    const s = setup();
    const result = await s.service.prepareExternalOutbound(
      ctx,
      "number-1",
      "+12125550199",
    );
    assert.equal(result.phoneNumber, route.fromNumber);
    assert.equal(result.destinationUri, route.destinationUri);
    const row = s.rows.get(verifyCallCorrelation(result.callToken)!)!;
    assert.equal(row.status, CallStatus.pending);
    assert.equal(row.direction, "outbound");
    assert.equal(row.fromNumber, route.fromNumber);
    assert.equal(row.toNumber, route.toNumber);
    assert.equal(row.externalSipEndpointId, "endpoint-1");
    assert.equal(
      (row as unknown as { externalCarrierId: string }).externalCarrierId,
      "carrier-1",
    );
    assert.doesNotMatch(JSON.stringify(result), /password|secret/i);
  });

  it("refuses disabled calling and an empty balance before creating anything", async () => {
    const s = setup();
    s.state.canCall = false;
    await assert.rejects(
      s.service.prepareExternalOutbound(ctx, "number-1", "+12125550199"),
      ForbiddenException,
    );
    s.state.canCall = true;
    s.state.balance = 0;
    await assert.rejects(
      s.service.prepareExternalOutbound(ctx, "number-1", "+12125550199"),
      (error: unknown) =>
        error instanceof HttpException && error.getStatus() === 402,
    );
    assert.equal(s.rows.size, 0);
  });

  it("adopts the leg into the pre-created row exactly once", async () => {
    const s = setup();
    const { callToken } = await s.service.prepareExternalOutbound(
      ctx,
      "number-1",
      "+12125550199",
    );
    await s.service.handleTelephonyEvent(s.withToken(callToken));
    // A redelivered webhook changes nothing and hangs nothing up.
    await s.service.handleTelephonyEvent(s.withToken(callToken));
    assert.deepEqual(s.hangups, []);
    assert.equal(s.claims.length, 1);
    const row = s.rows.get(verifyCallCorrelation(callToken)!)!;
    assert.equal(row.callControlId, "leg-1");
    assert.equal(row.status, CallStatus.ringing);
  });

  it("adopts a leg whose destination is reported without the plus sign", async () => {
    const s = setup();
    const { callToken } = await s.service.prepareExternalOutbound(
      ctx,
      "number-1",
      "+12125550199",
    );
    await s.service.handleTelephonyEvent(
      s.withToken(callToken, { to: `sip:12125550199@${HOST.toUpperCase()}` }),
    );
    assert.deepEqual(s.hangups, []);
    assert.equal(s.claims.length, 1);
  });

  it("hangs up a second leg that reuses a token already bound", async () => {
    const s = setup();
    const { callToken } = await s.service.prepareExternalOutbound(
      ctx,
      "number-1",
      "+12125550199",
    );
    await s.service.handleTelephonyEvent(s.withToken(callToken));
    await s.service.handleTelephonyEvent(
      s.withToken(callToken, { callControlId: "leg-2" }),
    );
    assert.deepEqual(s.hangups, ["leg-2"]);
  });

  it("never lets a valid token carry a different destination or carrier", async () => {
    for (const to of [
      `sip:+19995550100@${HOST}`,
      "sip:+12125550199@other-workspace.example.net",
      "sip:12125550199@other-workspace.example.net",
      "+12125550199",
    ]) {
      const s = setup();
      const { callToken } = await s.service.prepareExternalOutbound(
        ctx,
        "number-1",
        "+12125550199",
      );
      await s.service.handleTelephonyEvent(s.withToken(callToken, { to }));
      assert.deepEqual(s.hangups, ["leg-1"], to);
      assert.equal(s.claims.length, 0, to);
      assert.deepEqual(s.failed, [verifyCallCorrelation(callToken)], to);
    }
  });

  it("hangs up when the route no longer holds, the token is forged or stale", async () => {
    const s = setup();
    const first = await s.service.prepareExternalOutbound(
      ctx,
      "number-1",
      "+12125550199",
    );
    s.state.routeHost = null;
    await s.service.handleTelephonyEvent(s.withToken(first.callToken));
    assert.deepEqual(s.hangups, ["leg-1"]);

    s.state.routeHost = HOST;
    await s.service.handleTelephonyEvent(
      s.withToken(signCallCorrelation("not-a-call"), {
        callControlId: "leg-2",
      }),
    );
    await s.service.handleTelephonyEvent(
      s.withToken(`${first.callToken}x`, { callControlId: "leg-3" }),
    );
    const stale = await s.service.prepareExternalOutbound(
      ctx,
      "number-1",
      "+12125550199",
    );
    s.rows.get(verifyCallCorrelation(stale.callToken)!)!.createdAt = new Date(
      Date.now() - 10 * 60 * 1000,
    );
    await s.service.handleTelephonyEvent(
      s.withToken(stale.callToken, { callControlId: "leg-4" }),
    );
    assert.deepEqual(s.hangups, ["leg-1", "leg-2", "leg-3", "leg-4"]);
    assert.equal(s.claims.length, 0);
  });

  it("applies the ordinary credit and one-call backstops before binding", async () => {
    const s = setup();
    const { callToken } = await s.service.prepareExternalOutbound(
      ctx,
      "number-1",
      "+12125550199",
    );
    s.state.balance = 0;
    await s.service.handleTelephonyEvent(s.withToken(callToken));
    assert.deepEqual(s.hangups, ["leg-1"]);
    assert.equal(s.claims.length, 0);
    assert.deepEqual(s.failed, [verifyCallCorrelation(callToken)]);
  });

  it("hangs up a leg dialed straight to a carrier host without a pre-dial", async () => {
    const s = setup();
    await s.service.handleTelephonyEvent(
      s.leg({ to: "sip:+12125550199@GENERATED.example.net" }),
    );
    assert.deepEqual(s.hangups, ["leg-1"]);
    assert.deepEqual(s.hostLookups, [HOST]);
  });

  it("hangs up a leg whose SIP destination does not parse to one host", async () => {
    const s = setup();
    s.state.carrierHosts = [];
    await s.service.handleTelephonyEvent(
      s.leg({ to: `sip:+12125550199@sip.example.com@${HOST}` }),
    );
    assert.deepEqual(s.hangups, ["leg-1"]);
    assert.deepEqual(s.hostLookups, []);
  });

  it("does not look up or refuse ordinary PSTN legs", async () => {
    const s = setup();
    s.state.carrierHosts = [];
    // Without attribution headers the existing web path drops the leg, as before.
    await s.service.handleTelephonyEvent(s.leg({ to: "+12125550199" }));
    await s.service.handleTelephonyEvent(
      s.leg({ to: "sip:+12125550199@sip.example.com", callControlId: "leg-2" }),
    );
    assert.deepEqual(s.hangups, []);
    assert.deepEqual(s.hostLookups, ["sip.example.com"]);
  });

  it("closes only a verified token's pre-dial on abandon", async () => {
    const s = setup();
    const { callToken } = await s.service.prepareExternalOutbound(
      ctx,
      "number-1",
      "+12125550199",
    );
    await s.service.abandonExternalOutbound(ctx, "forged.token");
    assert.deepEqual(s.failed, []);
    await s.service.abandonExternalOutbound(ctx, callToken);
    assert.deepEqual(s.failed, [verifyCallCorrelation(callToken)]);
  });
});
