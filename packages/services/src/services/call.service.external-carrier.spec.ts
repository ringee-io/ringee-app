import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import {
  ForbiddenException,
  HttpException,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { CallStatus } from "@ringee/database";
import {
  carrierOutboundLeg,
  carrierOutboundLegState,
  signCallCorrelation,
  signCarrierCallKey,
  verifyCallCorrelation,
  type TelephonyEvent,
} from "@ringee/platform";
import { CallService } from "./call.service";
import { parseSipTarget } from "./external-carrier/sip-target";

process.env.SDK_SIGNING_SECRET ||= "external-carrier-spec-secret";

const APP = "call-control-app";
const config = apiConfiguration as unknown as Record<string, unknown>;
config.TELNYX_CALL_CONTROL_APP_ID = APP;
/** A correlation's call id when it is one a key can name, else a stranger's. */
const uuidOr = (id: string | null) =>
  id && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : randomUUID();
/** Where the browser is sent: Ringee's application, addressed with the key. */
const entryFor = (callId: string) =>
  `sip:${signCarrierCallKey(callId)}@ringee.sip.telnyx.com`;

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
  callSessionId?: string | null;
  externalSipEndpointId: string | null;
  answeredAt?: Date | null;
  endedAt?: Date | null;
  errorMessage?: string;
  createdAt: Date;
};

function setup() {
  const rows = new Map<string, Row>();
  const hangups: string[] = [];
  const failed: string[] = [];
  const claims: Array<{ id: string; data: Record<string, unknown> }> = [];
  const hostLookups: string[] = [];
  const transfers: Array<{ leg: string; params: Record<string, unknown> }> = [];
  const refusals: string[] = [];
  const claimsHeld = new Map<string, string>();
  const state = {
    canCall: true,
    freeCallTrial: false,
    balance: 5,
    routeHost: HOST as string | null,
    carrierHosts: [HOST],
    busy: false,
    entryDown: false,
    redisDown: false,
    transferFails: false,
  };
  const callRepository = {
    createCall: async (owner: typeof ctx, data: Record<string, unknown>) => {
      const row = {
        id: randomUUID(),
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
    updateControlState: async (
      callControlId: string,
      data: Record<string, unknown>,
    ) => {
      const row = [...rows.values()].find(
        (row) => row.callControlId === callControlId,
      );
      if (row) Object.assign(row, data);
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
      connectOutboundToCarrier: async (
        leg: string,
        params: Record<string, unknown>,
      ) => {
        if (state.transferFails) throw new Error("provider down");
        transfers.push({ leg, params });
      },
      refuseCarrierOutbound: async (leg: string) => {
        refusals.push(leg);
      },
    },
    concurrentCallGuard: {
      appliesTo: async () => false,
      findOccupyingCall: async () => (state.busy ? { id: "other" } : null),
      bindToCall: async () => {},
    },
    redis: {
      get: async () => undefined,
      del: async () => {},
      setIfAbsent: async (key: string, value: string) => {
        if (state.redisDown) throw new Error("redis down");
        if (claimsHeld.has(key)) return false;
        claimsHeld.set(key, value);
        return true;
      },
      getRaw: async (key: string) => {
        if (state.redisDown) throw new Error("redis down");
        return claimsHeld.get(key) ?? null;
      },
    },
    inboxTimelineService: { ensureThreadForCall: async () => {} },
    voicemailDropService: {
      parseClientState: () => null,
      isPlaybackState: () => false,
    },
    voiceAgentResults: { handleTelephonyEvent: async () => false },
    // What the inbound path answers for a leg that is not a carrier's.
    inboundRoutes: { resolve: async () => ({ kind: "unknown_number" }) },
    externalCarriers: {
      identifyInbound: async () => ({ kind: "none" }),
      resolveOutbound: async () => route,
      outboundEntry: async (callId: string) => {
        if (state.entryDown) throw new ServiceUnavailableException();
        return entryFor(callId);
      },
      outboundCarrierDestination: async (
        _ctx: unknown,
        target: { toNumber: string },
      ) =>
        state.routeHost ? `sip:${target.toNumber}@${state.routeHost}` : null,
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
  /** The browser's leg, sent to its own entry unless told otherwise. */
  const withToken = (token: string, overrides: Partial<TelephonyEvent> = {}) =>
    leg({
      customHeaders: [{ name: "x-ringee-byoc-call-id", value: token }],
      to: entryFor(uuidOr(verifyCallCorrelation(token))),
      ...overrides,
    });
  /**
   * The browser's call as it arrives on the Call Control application — the
   * only leg Telnyx reports for it — carrying the pre-dial token as a header.
   */
  const entryLeg = (
    token: string,
    overrides: Partial<TelephonyEvent> = {},
  ): TelephonyEvent =>
    leg({
      callControlId: "entry-1",
      connectionId: APP,
      direction: "inbound",
      to: entryFor(verifyCallCorrelation(token)!),
      customHeaders: [{ name: "X-Ringee-Byoc-Call-Id", value: token }],
      ...overrides,
    });
  return {
    service,
    rows,
    hangups,
    failed,
    claims,
    hostLookups,
    transfers,
    refusals,
    state,
    leg,
    withToken,
    entryLeg,
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
    const row = s.rows.get(verifyCallCorrelation(result.callToken)!)!;
    // The browser is sent to Ringee's application, never to the carrier.
    assert.equal(result.destinationUri, entryFor(row.id));
    assert.ok(!result.destinationUri.includes(HOST));
    assert.doesNotMatch(result.destinationUri, /12125550199/);
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

  it("adopts a leg whose destination is reported with or without the application host", async () => {
    for (const shape of [
      (key: string) => key,
      (key: string) => key.toUpperCase(),
      (key: string) => `<sip:${key}@ringee.sip.telnyx.com;transport=udp>`,
    ]) {
      const s = setup();
      const { callToken } = await s.service.prepareExternalOutbound(
        ctx,
        "number-1",
        "+12125550199",
      );
      const key = signCarrierCallKey(verifyCallCorrelation(callToken)!);
      await s.service.handleTelephonyEvent(
        s.withToken(callToken, { to: shape(key) }),
      );
      assert.deepEqual(s.hangups, []);
      assert.equal(s.claims.length, 1);
    }
  });

  it("fails the pre-dial when Ringee's application cannot be reached", async () => {
    const s = setup();
    s.state.entryDown = true;
    await assert.rejects(
      s.service.prepareExternalOutbound(ctx, "number-1", "+12125550199"),
      ServiceUnavailableException,
    );
    assert.equal(s.failed.length, 1);
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

  it("never lets a valid token carry another call, a number or a carrier host", async () => {
    for (const to of [
      entryFor(randomUUID()),
      `sip:+12125550199@${HOST}`,
      "sip:+12125550199@other-workspace.example.net",
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

describe("CallService external carrier outbound bridge", () => {
  const predial = (s: ReturnType<typeof setup>) =>
    s.service.prepareExternalOutbound(ctx, "number-1", "+12125550199");
  const carrierLeg = (
    s: ReturnType<typeof setup>,
    id: string,
    overrides: Partial<TelephonyEvent> = {},
  ) =>
    s.leg({
      callControlId: "carrier-1",
      connectionId: APP,
      clientState: carrierOutboundLegState({
        leg: "carrier",
        call: signCallCorrelation(id),
      }),
      ...overrides,
    });

  it("binds the row to the browser's call on the application and sends it on, exactly once", async () => {
    const s = setup();
    const { callToken } = await predial(s);
    const id = verifyCallCorrelation(callToken)!;
    await s.service.handleTelephonyEvent(s.entryLeg(callToken));
    // The entry leg is the call: adopted like any browser-placed leg.
    assert.equal(s.claims.length, 1);
    assert.equal(s.rows.get(id)!.callControlId, "entry-1");
    assert.equal(s.rows.get(id)!.status, CallStatus.ringing);
    assert.equal(s.transfers.length, 1);
    const [{ leg, params }] = s.transfers;
    assert.equal(leg, "entry-1");
    assert.equal(params.destinationUri, `sip:+12125550199@${HOST}`);
    assert.equal(params.from, route.fromNumber);
    assert.equal(verifyCallCorrelation(params.correlation as string), id);
    assert.equal(params.commandId, `carrier-outbound-${id}`);
    assert.equal(params.markEntry, false);
    // A redelivered webhook changes nothing.
    await s.service.handleTelephonyEvent(s.entryLeg(callToken));
    assert.equal(s.transfers.length, 1);
    assert.equal(s.claims.length, 1);
    assert.deepEqual([...s.refusals, ...s.hangups], []);
    // Another call dialed with the same key and token reaches nobody.
    await s.service.handleTelephonyEvent(
      s.entryLeg(callToken, { callControlId: "entry-2" }),
    );
    assert.equal(s.transfers.length, 1);
    assert.deepEqual(s.refusals, ["entry-2"]);
  });

  it("only relays for a browser leg bound first, and only within its session", async () => {
    const s = setup();
    const { callToken } = await predial(s);
    await s.service.handleTelephonyEvent(s.withToken(callToken));
    await s.service.handleTelephonyEvent(
      s.entryLeg(callToken, { callSessionId: "other-session" }),
    );
    assert.deepEqual(s.refusals, ["entry-1"]);
    assert.equal(s.transfers.length, 0);
    const t = setup();
    const second = await predial(t);
    await t.service.handleTelephonyEvent(t.withToken(second.callToken));
    await t.service.handleTelephonyEvent(t.entryLeg(second.callToken));
    assert.equal(t.transfers.length, 1);
    assert.equal(t.transfers[0].params.markEntry, true);
  });

  it("refuses a forged, foreign, stale, finished or re-routed pre-dial before binding or sending anything", async () => {
    const cases: Array<
      (
        s: ReturnType<typeof setup>,
        id: string,
        token: string,
      ) => Partial<TelephonyEvent>
    > = [
      () => ({ to: entryFor(randomUUID()) }),
      (_s, id) => ({
        to: entryFor(id).replace(
          /rco(.)/,
          (_m, c) => `rco${c === "0" ? "1" : "0"}`,
        ),
      }),
      () => ({ customHeaders: [] }),
      () => ({
        customHeaders: [
          {
            name: "X-Ringee-Byoc-Call-Id",
            value: signCallCorrelation(randomUUID()),
          },
        ],
      }),
      (s, id) => {
        s.rows.get(id)!.createdAt = new Date(Date.now() - 10 * 60 * 1000);
        return {};
      },
      (s, id) => {
        s.rows.get(id)!.status = CallStatus.completed;
        return {};
      },
      (s, id) => {
        s.rows.get(id)!.endedAt = new Date();
        return {};
      },
      (s) => {
        s.state.routeHost = null;
        return {};
      },
    ];
    for (const [index, mutate] of cases.entries()) {
      const s = setup();
      const { callToken } = await predial(s);
      const id = verifyCallCorrelation(callToken)!;
      const overrides = mutate(s, id, callToken);
      await s.service.handleTelephonyEvent(s.entryLeg(callToken, overrides));
      assert.equal(s.transfers.length, 0, `case ${index}`);
      assert.equal(s.claims.length, 0, `case ${index}`);
      assert.deepEqual(s.refusals, ["entry-1"], `case ${index}`);
    }
  });

  it("applies the ordinary credit backstop before binding the entry leg, keeping its mark", async () => {
    const s = setup();
    const { callToken } = await predial(s);
    s.state.balance = 0;
    await s.service.handleTelephonyEvent(s.entryLeg(callToken));
    assert.equal(s.claims.length, 0);
    assert.equal(s.transfers.length, 0);
    // Ended with the entry mark, not a plain hangup that would overwrite it.
    assert.deepEqual(s.refusals, ["entry-1"]);
    assert.deepEqual(s.hangups, []);
    assert.deepEqual(s.failed, [verifyCallCorrelation(callToken)]);
  });

  it("still hangs up a browser leg the gates refuse the ordinary way", async () => {
    const s = setup();
    const { callToken } = await predial(s);
    s.state.balance = 0;
    await s.service.handleTelephonyEvent(s.withToken(callToken));
    assert.deepEqual(s.hangups, ["leg-1"]);
    assert.deepEqual(s.refusals, []);
  });

  it("only acts on the application's own legs", async () => {
    const s = setup();
    const { callToken } = await predial(s);
    // The same address from any other connection is no entry.
    await s.service.handleTelephonyEvent(
      s.entryLeg(callToken, { connectionId: "webrtc-connection" }),
    );
    assert.equal(s.transfers.length, 0);
    assert.equal(s.claims.length, 0);
  });

  it("ends the parked call when the carrier leg fails unanswered, and records why", async () => {
    const s = setup();
    const { callToken } = await predial(s);
    const id = verifyCallCorrelation(callToken)!;
    await s.service.handleTelephonyEvent(s.entryLeg(callToken));
    await s.service.handleTelephonyEvent(
      carrierLeg(s, id, {
        type: "call.hangup",
        payload: { hangup_cause: "user_busy" },
      }),
    );
    assert.deepEqual(s.hangups, ["entry-1"]);
    assert.deepEqual(s.refusals, []);
    assert.match(s.rows.get(id)!.errorMessage ?? "", /user_busy/);
  });

  it("leaves an answered call to end on its own", async () => {
    const s = setup();
    const { callToken } = await predial(s);
    const id = verifyCallCorrelation(callToken)!;
    await s.service.handleTelephonyEvent(s.entryLeg(callToken));
    s.rows.get(id)!.answeredAt = new Date();
    await s.service.handleTelephonyEvent(
      carrierLeg(s, id, {
        type: "call.hangup",
        payload: { hangup_cause: "normal_clearing" },
      }),
    );
    assert.deepEqual([...s.hangups, ...s.refusals], []);
    assert.equal(s.rows.get(id)!.errorMessage, undefined);
  });

  it("bills the browser's call once and never the carrier leg", async () => {
    const s = setup();
    const { callToken } = await predial(s);
    const id = verifyCallCorrelation(callToken)!;
    await s.service.handleTelephonyEvent(s.entryLeg(callToken));
    const balance = s.state.balance;
    for (const type of ["call.answered", "call.cost"] as const)
      await s.service.handleTelephonyEvent(
        carrierLeg(s, id, {
          type,
          payload: { total_cost: "0.05", cost_parts: [] },
        }),
      );
    assert.equal(s.state.balance, balance);
    const cost = s.leg({
      type: "call.cost",
      callControlId: "entry-1",
      connectionId: APP,
      direction: "inbound",
      payload: { total_cost: "0.01", cost_parts: [] },
    });
    await s.service.handleTelephonyEvent(cost);
    await s.service.handleTelephonyEvent(cost);
    assert.equal(s.state.balance, balance - 1);
    assert.equal(s.rows.size, 1);
  });

  it("marks a refused entry leg so its later webhooks are recognized", async () => {
    const s = setup();
    await s.service.handleTelephonyEvent(
      s.entryLeg(signCallCorrelation(randomUUID())),
    );
    assert.deepEqual(s.refusals, ["entry-1"]);
    await s.service.handleTelephonyEvent(
      s.leg({
        type: "call.cost",
        callControlId: "entry-1",
        connectionId: APP,
        clientState: carrierOutboundLegState({ leg: "entry", call: null }),
        payload: { total_cost: "0.01", cost_parts: [] },
      }),
    );
    assert.equal(
      carrierOutboundLeg(carrierOutboundLegState({ leg: "entry", call: null }))
        ?.leg,
      "entry",
    );
  });

  it("ends the call the ordinary way when its carrier leg cannot start", async () => {
    const s = setup();
    s.state.transferFails = true;
    const { callToken } = await predial(s);
    const id = verifyCallCorrelation(callToken)!;
    await s.service.handleTelephonyEvent(s.entryLeg(callToken));
    assert.deepEqual(s.hangups, ["entry-1"]);
    assert.deepEqual(s.refusals, []);
    assert.match(s.rows.get(id)!.errorMessage ?? "", /could not be reached/);
  });

  it("sends nothing on when the one-bridge claim cannot be made", async () => {
    const s = setup();
    s.state.redisDown = true;
    const { callToken } = await predial(s);
    await s.service.handleTelephonyEvent(s.entryLeg(callToken));
    assert.equal(s.transfers.length, 0);
    assert.deepEqual(s.hangups, ["entry-1"]);
  });
});
