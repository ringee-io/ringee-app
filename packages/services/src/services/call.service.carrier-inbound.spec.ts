import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Logger } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { CallStatus, InboundDestinationType } from "@ringee/database";
import {
  CarrierConnectionError,
  signCallCorrelation,
  type TelephonyEvent,
} from "@ringee/platform";
import { CallService } from "./call.service";
import type { CarrierInboundCall } from "./external-carrier/external-carrier.service";
import { DeskPhoneCallService } from "./sip-device/desk-phone-call.service";
import { InboundCallRouterService } from "./inbound-routing/inbound-call-router.service";
import { DeskPhoneDestinationHandler } from "./inbound-routing/destinations/desk-phone.destination";
import { IvrDestinationHandler } from "./inbound-routing/destinations/unsupported.destination";
import { AiReceptionistDestinationHandler } from "./inbound-routing/destinations/ai-receptionist.destination";
import type { InboundRouteResolution } from "./inbound-routing/inbound-routing.types";

process.env.SDK_SIGNING_SECRET ||= "carrier-inbound-spec-secret";
(
  apiConfiguration as unknown as Record<string, unknown>
).TELNYX_CALL_CONTROL_APP_ID = "cc-app";

const IDENTIFIED: CarrierInboundCall = {
  kind: "identified",
  organizationId: "org-1",
  fromNumber: "+12125550199",
  callerId: "+12125550199",
  toNumber: "+13055550101",
  externalNumberId: "number-1",
  externalCarrierId: "carrier-1",
  externalSipEndpointId: "endpoint-1",
};

const DESK_PHONE_ROUTE: InboundRouteResolution = {
  kind: "routed",
  ctx: { userId: "user-a", organizationId: "org-1" },
  number: { kind: "external", id: "number-1" },
  phoneNumber: "+13055550101",
  routeId: null,
  source: "default",
  destination: {
    type: "desk_phone",
    sipDeviceId: "device-1",
    sipUsername: "rgdesk201",
    ownerUserId: "user-a",
  },
};

type Row = Record<string, any>;

function setup() {
  const rows = new Map<string, Row>();
  const log: string[] = [];
  const transfers: Array<Record<string, unknown>> = [];
  const state = {
    carrier: IDENTIFIED as CarrierInboundCall,
    resolution: DESK_PHONE_ROUTE as InboundRouteResolution,
    transferError: null as Error | null,
    parkedHangup: false,
  };
  const byControl = (id: string) =>
    [...rows.values()].find((row) => row.callControlId === id) ?? null;
  const callRepository = {
    createInboundOnce: async (ctx: Row, data: Row) => {
      const existing = byControl(data.callControlId);
      if (existing) return { call: existing, created: false };
      const row = {
        id: `call-${rows.size + 1}`,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        answeredAt: null,
        endedAt: null,
        sipDeviceId: data.sipDevice?.connect?.id,
        ...data,
      };
      rows.set(row.id, row);
      return { call: row, created: true };
    },
    findById: async (id: string) => rows.get(id) ?? null,
    findByControlId: async (id: string) => byControl(id),
    updateControlState: async (id: string, data: Row) => {
      Object.assign(byControl(id)!, data);
    },
    // The ordinary lifecycle: a leg with no row of its own is parked.
    completeCall: async (id: string) => byControl(id),
    markAnsweredOnce: async (id: string, answeredByUserId?: string | null) => {
      const row = byControl(id);
      if (!row || row.answeredAt || row.endedAt) return null;
      Object.assign(row, {
        status: CallStatus.answered,
        answeredAt: new Date(),
        ...(answeredByUserId ? { answeredByUserId } : {}),
      });
      return row;
    },
  };
  const telephonyService: Row = {
    hangupCall: async (id: string, commandId?: string) => {
      log.push(`hangup:${id}${commandId ? `:${commandId}` : ""}`);
    },
    connectInboundToDeskPhone: async (id: string, params: Row) => {
      if (state.transferError) throw state.transferError;
      transfers.push({ id, ...params });
    },
    startRecording: async (id: string) => {
      log.push(`record:${id}`);
    },
  };
  const attempts = {
    startMany: async () => [],
    listByCall: async () => [],
    markAnswered: async () => true,
    endRinging: async () => [],
  };
  // The real router and the real desk-phone handler: the point of this spec is
  // that the provider command a carrier call produces has not changed.
  const inboundRouter = new InboundCallRouterService(
    {
      type: InboundDestinationType.user,
      transports: ["ringee_webrtc"],
    } as never,
    {
      type: InboundDestinationType.ring_group,
      transports: ["ringee_webrtc"],
    } as never,
    new DeskPhoneDestinationHandler(
      telephonyService as never,
      attempts as never,
    ),
    new IvrDestinationHandler(),
    new AiReceptionistDestinationHandler({
      startInbound: async () => {},
    } as never),
  );
  const deps = {
    logger: Object.assign(new Logger("spec"), {
      log: () => {},
      debug: () => {},
      warn: () => {},
      error: () => {},
    }),
    lowBalanceHangupTimers: new Map(),
    callRepository,
    contactService: { findByPhone: async () => null },
    inboxTimelineService: { ensureThreadForCall: async () => {} },
    redis: {
      get: async () =>
        state.parkedHangup ? JSON.stringify([{ type: "parked" }]) : undefined,
      del: async () => {},
      set: async (key: string) => {
        log.push(`parked:${key.split(":").at(-1)}`);
      },
    },
    telephonyService,
    recordingSettingsService: {
      resolve: async () => ({
        recordAllCalls: true,
        transcribeRealtime: false,
      }),
    },
    voicemailDropService: {
      parseClientState: () => null,
      isPlaybackState: () => false,
    },
    voiceAgentResults: { handleTelephonyEvent: async () => false },
    externalCarriers: { identifyInbound: async () => state.carrier },
    inboundRoutes: {
      resolve: async (origin: Row) => {
        if (origin.transport === "ringee_webrtc")
          log.push(`ringee-number:${origin.toNumber}`);
        return state.resolution;
      },
    },
    inboundRouter,
    inboundRing: {
      handleControlledEvent: async () => false,
      recordAnswer: async () => {},
      cancelRinging: async () => 0,
      cancelForEndedCall: async () => {},
    },
  };
  const service = Object.assign(
    Object.create(CallService.prototype),
    deps,
  ) as CallService;
  // A replayed hangup that overtook call.initiated closes the row.
  (service as unknown as Row).handleTelephonyEvent = new Proxy(
    CallService.prototype.handleTelephonyEvent,
    {
      apply: (target, self, [event]) => {
        if (event.type === "parked") {
          const row = [...rows.values()].at(-1)!;
          row.endedAt = new Date();
          state.parkedHangup = false;
          return Promise.resolve();
        }
        return Reflect.apply(target, self, [event]);
      },
    },
  );
  const event = (overrides: Partial<TelephonyEvent> = {}): TelephonyEvent => ({
    type: "call.initiated",
    provider: "telnyx",
    providerEventType: "call.initiated",
    callControlId: "leg-a",
    connectionId: "cc-app",
    callSessionId: "session-1",
    callLegId: "leg-id",
    clientState: null,
    direction: "inbound",
    from: "sip:+12125550199@pbx.example.com",
    to: "sip:rcr0@ringee.sip.telnyx.com",
    occurredAt: new Date(),
    startedAt: new Date("2026-09-17T12:00:00Z"),
    customHeaders: [],
    conversation: null,
    payload: {},
    ...overrides,
  });
  const legState = (callId: string) =>
    Buffer.from(
      JSON.stringify({
        action: "carrier_inbound_desk_phone",
        call: signCallCorrelation(callId),
      }),
    ).toString("base64");
  return { service, rows, log, transfers, state, event, legState };
}

describe("CallService carrier inbound calls", () => {
  it("records the call on the Call model and rings the routed desk phone", async () => {
    const s = setup();
    await s.service.handleTelephonyEvent(s.event());
    const [row] = [...s.rows.values()];
    assert.equal(row.direction, "inbound");
    assert.equal(row.fromNumber, "+12125550199");
    assert.equal(row.toNumber, "+13055550101");
    assert.equal(row.status, CallStatus.ringing);
    assert.equal(row.source, "sip_device");
    assert.deepEqual(row.sipDevice, { connect: { id: "device-1" } });
    assert.equal(row.externalCarrierId, "carrier-1");
    assert.equal(row.externalSipEndpointId, "endpoint-1");
    assert.equal(row.connectionId, "cc-app");
    // The routing decision is written down with the call.
    assert.equal(row.inboundDestinationType, InboundDestinationType.desk_phone);
    assert.equal(row.inboundDestinationId, "device-1");
    assert.equal(s.transfers.length, 1);
    assert.equal(s.transfers[0].sipUsername, "rgdesk201");
    assert.equal(s.transfers[0].from, "+12125550199");
    assert.equal(s.transfers[0].commandId, `carrier-inbound-${row.id}`);
    // Ringee's own number lookup never ran for a carrier call.
    assert.deepEqual(s.log, []);
  });

  it("is safe to redeliver: one row, and the same idempotent transfer", async () => {
    const s = setup();
    await s.service.handleTelephonyEvent(s.event());
    await s.service.handleTelephonyEvent(s.event());
    assert.equal(s.rows.size, 1);
    assert.equal(s.transfers.length, 2);
    assert.equal(s.transfers[0].commandId, s.transfers[1].commandId);
  });

  it("leaves an answered call alone when its number is disabled before a redelivery", async () => {
    const s = setup();
    await s.service.handleTelephonyEvent(s.event());
    const [row] = [...s.rows.values()];
    row.answeredAt = new Date();
    s.state.carrier = { kind: "refused", reason: "number disabled" };
    await s.service.handleTelephonyEvent(s.event());
    assert.equal(s.transfers.length, 1);
    assert.deepEqual(s.log, []);
  });

  it("leaves a ringing call alone when its number is disabled before a redelivery", async () => {
    const s = setup();
    await s.service.handleTelephonyEvent(s.event());
    s.state.carrier = { kind: "refused", reason: "number disabled" };
    await s.service.handleTelephonyEvent(s.event());
    assert.equal(s.transfers.length, 1);
    assert.deepEqual(s.log, []);
  });

  it("never transfers a retried call to a newly assigned recipient", async () => {
    const s = setup();
    await s.service.handleTelephonyEvent(s.event());
    s.state.resolution = {
      ...DESK_PHONE_ROUTE,
      destination: {
        type: "desk_phone",
        sipDeviceId: "other-phone",
        sipUsername: "other",
        ownerUserId: "user-a",
      },
    } as InboundRouteResolution;
    await s.service.handleTelephonyEvent(s.event());
    assert.equal(s.transfers.length, 1);
    assert.deepEqual(s.log, ["hangup:leg-a"]);
  });

  it("presents the called number when the caller has no E.164 number", async () => {
    const s = setup();
    s.state.carrier = {
      ...IDENTIFIED,
      fromNumber: "anonymous",
      callerId: null,
    } as CarrierInboundCall;
    await s.service.handleTelephonyEvent(s.event());
    assert.equal(s.transfers[0].from, "+13055550101");
    assert.equal(s.transfers[0].fromDisplayName, "anonymous");
  });

  it("hangs up a refused carrier call without creating history", async () => {
    const s = setup();
    s.state.carrier = { kind: "refused", reason: "ambiguous" };
    await s.service.handleTelephonyEvent(s.event());
    assert.equal(s.rows.size, 0);
    assert.deepEqual(s.log, ["hangup:leg-a"]);
  });

  it("hangs up a call whose destination cannot be routed, with no history", async () => {
    const s = setup();
    s.state.resolution = {
      kind: "unroutable",
      reason: "destination_deleted",
      detail: "desk phone device-1 is gone",
    };
    await s.service.handleTelephonyEvent(s.event());
    assert.equal(s.rows.size, 0);
    assert.deepEqual(s.log, ["hangup:leg-a"]);
  });

  it("does not ring the phone for a call whose hangup arrived first", async () => {
    const s = setup();
    s.state.parkedHangup = true;
    await s.service.handleTelephonyEvent(s.event());
    assert.equal(s.transfers.length, 0);
    assert.deepEqual(s.log, []);
  });

  it("ends the call with a sanitized error when the phone cannot be reached", async () => {
    const s = setup();
    s.state.transferError = new CarrierConnectionError(false);
    await s.service.handleTelephonyEvent(s.event());
    const [row] = [...s.rows.values()];
    assert.equal(row.errorMessage, "The desk phone could not be reached.");
    assert.deepEqual(s.log, ["hangup:leg-a"]);
  });

  it("sends Ringee numbers to the routing layer as their own transport", async () => {
    const s = setup();
    s.state.carrier = { kind: "none" };
    s.state.resolution = { kind: "unknown_number", detail: "not ours" };
    await s.service.handleTelephonyEvent(
      s.event({ connectionId: "credential", to: "+13055550199" }),
    );
    assert.deepEqual(s.log, ["ringee-number:+13055550199"]);
    assert.equal(s.transfers.length, 0);
    assert.equal(s.rows.size, 0);
  });

  it("answers once, whichever leg reports it, and runs answer automation once", async () => {
    const s = setup();
    await s.service.handleTelephonyEvent(s.event());
    const [row] = [...s.rows.values()];
    await s.service.handleTelephonyEvent(
      s.event({
        type: "call.answered",
        callControlId: "leg-b",
        clientState: s.legState(row.id),
        direction: "outbound",
      }),
    );
    await s.service.handleTelephonyEvent(
      s.event({ type: "call.answered", callControlId: "leg-a" }),
    );
    assert.equal(row.status, CallStatus.answered);
    // The phone's owner is recorded as the member who took the call.
    assert.equal(row.answeredByUserId, "user-a");
    assert.deepEqual(
      s.log.filter((entry) => entry.startsWith("record:")),
      ["record:leg-a"],
    );
  });

  it("ends the caller's leg when the phone does not answer, noting why", async () => {
    const s = setup();
    await s.service.handleTelephonyEvent(s.event());
    const [row] = [...s.rows.values()];
    await s.service.handleTelephonyEvent(
      s.event({
        type: "call.hangup",
        callControlId: "leg-b",
        clientState: s.legState(row.id),
        payload: { hangup_cause: "timeout" },
      }),
    );
    assert.equal(row.errorMessage, "The desk phone did not answer (timeout).");
    assert.deepEqual(s.log, [`hangup:leg-a:carrier-inbound-end-${row.id}`]);
    // Once the caller's leg has ended, the phone's hangup changes nothing.
    row.endedAt = new Date();
    await s.service.handleTelephonyEvent(
      s.event({
        type: "call.hangup",
        callControlId: "leg-b",
        clientState: s.legState(row.id),
      }),
    );
    assert.equal(s.log.length, 1);
  });

  it("ignores carrier state a browser attaches to its own leg", async () => {
    const s = setup();
    await s.service.handleTelephonyEvent(s.event());
    const [row] = [...s.rows.values()];
    s.state.carrier = { kind: "none" };
    await s.service.handleTelephonyEvent(
      s.event({
        type: "call.hangup",
        callControlId: "browser-leg",
        connectionId: "credential-connection",
        clientState: s.legState(row.id),
        direction: "outbound",
      }),
    );
    // Not treated as the phone's leg: the caller's call is left alone and the
    // browser leg goes through the ordinary lifecycle.
    assert.deepEqual(s.log, ["parked:browser-leg"]);
    assert.equal(row.errorMessage, undefined);
  });

  it("never lets a leg claiming carrier state become a call of its own", async () => {
    const s = setup();
    await s.service.handleTelephonyEvent(
      s.event({
        callControlId: "leg-x",
        direction: "outbound",
        clientState: s.legState("no-such-call"),
      }),
    );
    assert.deepEqual(s.log, ["hangup:leg-x"]);
    assert.equal(s.rows.size, 0);
  });
});

describe("DeskPhoneCallService with carrier inbound calls", () => {
  function deskSetup(existing: Row | null) {
    const created: Row[] = [];
    const service = Object.assign(
      Object.create(DeskPhoneCallService.prototype),
      {
        logger: Object.assign(new Logger("spec"), { warn: () => {} }),
        callRepository: {
          findByControlId: async () => null,
          findById: async (id: string) =>
            existing?.id === id ? existing : null,
          findOneBySessionId: async (session: string) =>
            existing?.callSessionId === session ? existing : null,
          createCall: async (_ctx: Row, data: Row) => {
            created.push(data);
            return data;
          },
        },
        sipDeviceRepo: {
          findByConnectionId: async () => ({
            id: "device-1",
            userId: "user-a",
            organizationId: "org-1",
            telnyxConnectionId: "desk-connection",
          }),
        },
        sipDeviceService: { markRegistered: async () => {} },
        contactService: { findByPhone: async () => null },
      },
    ) as DeskPhoneCallService;
    const initiated = (payload: Row) =>
      service.handleEvent({
        event_type: "call.initiated",
        payload: {
          call_control_id: "desk-leg",
          connection_id: "desk-connection",
          direction: "incoming",
          from: "+12125550199",
          to: "sip:rgdesk201@sip.telnyx.com",
          ...payload,
        },
      });
    return { created, initiated };
  }
  const carrierCall = {
    id: "call-1",
    externalSipEndpointId: "endpoint-1",
    sipDeviceId: "device-1",
    callSessionId: "session-1",
  };

  it("does not record the phone's side of a carrier call a second time", async () => {
    const byHeader = deskSetup(carrierCall);
    await byHeader.initiated({
      custom_headers: [
        {
          name: "X-Ringee-Carrier-Inbound",
          value: signCallCorrelation("call-1"),
        },
      ],
    });
    assert.deepEqual(byHeader.created, []);
    const bySession = deskSetup(carrierCall);
    await bySession.initiated({ call_session_id: "session-1" });
    assert.deepEqual(bySession.created, []);
  });

  it("still records ordinary inbound calls to the phone's own number", async () => {
    const plain = deskSetup(null);
    await plain.initiated({ call_session_id: "other-session" });
    assert.equal(plain.created.length, 1);
    const forged = deskSetup({ ...carrierCall, sipDeviceId: "device-2" });
    await forged.initiated({
      custom_headers: [
        {
          name: "X-Ringee-Carrier-Inbound",
          value: signCallCorrelation("call-1"),
        },
      ],
    });
    assert.equal(forged.created.length, 1);
  });
});
