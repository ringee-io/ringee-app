import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Logger } from "@nestjs/common";
import {
  signCallCorrelation,
  signDialAuthorization,
  type TelephonyEvent,
} from "@ringee/platform";
import { CallService } from "../call.service";

process.env.SDK_SIGNING_SECRET ||= "call-authorization-regression-secret";

function setup() {
  const hangups: string[] = [];
  const admitted: unknown[] = [];
  const state = {
    hangupFails: false,
    sdkRow: null as Record<string, unknown> | null,
  };
  const service: CallService = Object.assign(
    Object.create(CallService.prototype),
    {
      logger: new Logger("CallAuthorizationTest"),
      inboundRing: { handleControlledEvent: async () => false },
      handleDeskPhoneInboundLeg: async () => false,
      handleCarrierOutboundLeg: async () => false,
      handleVoicemailDropEvent: async () => false,
      voiceAgentResults: { handleTelephonyEvent: async () => false },
      externalCarriers: { isCarrierHost: async () => false },
      telephonyService: {
        hangupCall: async (id: string) => {
          if (state.hangupFails) throw new Error("provider unavailable");
          hangups.push(id);
        },
      },
      callRepository: { findById: async () => state.sdkRow },
      replayParkedCallEvents: async () => undefined,
      ensureCallAffordable: async (ctx: unknown) => {
        admitted.push(ctx);
        return false;
      },
      releaseRefusedCampaignLeg: async () => undefined,
    },
  );
  return { service, hangups, admitted, state };
}

function event(
  headers: Array<{ name: string; value: string }> = [],
  to = "+18095551234",
): TelephonyEvent {
  return {
    type: "call.initiated",
    provider: "telnyx",
    providerEventType: "call.initiated",
    callControlId: "leg-1",
    direction: "outbound",
    from: "+12125550100",
    to,
    customHeaders: headers,
    payload: {},
  } as TelephonyEvent;
}

describe("outbound leg authorization", () => {
  for (const headers of [
    [],
    [{ name: "X-User-Id", value: "forged-user" }],
    [{ name: "X-Ringee-Call-Id", value: "invalid" }],
  ]) {
    it(`hangs up unauthenticated headers ${JSON.stringify(headers)}`, async () => {
      const { service, hangups, admitted } = setup();
      await service.handleTelephonyEvent(event(headers));
      assert.deepEqual(hangups, ["leg-1"]);
      assert.deepEqual(admitted, []);
    });
  }
  it("retries termination when the provider is unavailable", async () => {
    const { service, state } = setup();
    state.hangupFails = true;
    await assert.rejects(
      service.handleTelephonyEvent(event()),
      /provider unavailable/,
    );
  });
  it("rejects a different country's number sharing the authorized suffix", async () => {
    const { service, hangups, admitted } = setup();
    const token = signDialAuthorization({
      userId: "user-1",
      organizationId: null,
      destination: "+18095551234",
      callerId: "+12125550100",
    });
    await service.handleTelephonyEvent(
      event([{ name: "X-Ringee-Dial-Token", value: token }], "+918095551234"),
    );
    assert.deepEqual(hangups, ["leg-1"]);
    assert.deepEqual(admitted, []);
  });
  it("attributes a matching signed leg to its owner and continues through billing gates", async () => {
    const { service, admitted } = setup();
    const token = signDialAuthorization({
      userId: "user-1",
      organizationId: "org-1",
      destination: "+1 (809) 555-1234",
      callerId: "+12125550100",
    });
    await service.handleTelephonyEvent(
      event([
        { name: "X-Ringee-Dial-Token", value: token },
        { name: "X-User-Id", value: "forged" },
      ]),
    );
    assert.deepEqual(admitted, [{ userId: "user-1", organizationId: "org-1" }]);
  });

  it("accepts an SDK webhook replay only for the leg already bound to its token", async () => {
    const { service, state, hangups } = setup();
    const id = "12345678-1234-1234-1234-123456789012";
    state.sdkRow = {
      id,
      source: "sdk",
      status: "ringing",
      callControlId: "leg-1",
      userId: "user-1",
      toNumber: "+18095551234",
      fromNumber: "+12125550100",
    };
    const headers = [
      { name: "X-Ringee-Call-Id", value: signCallCorrelation(id) },
    ];
    await service.handleTelephonyEvent(event(headers));
    assert.deepEqual(hangups, []);
    await service.handleTelephonyEvent({
      ...event(headers),
      callControlId: "leg-2",
    });
    assert.deepEqual(hangups, ["leg-2"]);
  });

  it("rejects a pending SDK call to another country sharing the authorized suffix", async () => {
    const { service, state, hangups, admitted } = setup();
    const id = "12345678-1234-1234-1234-123456789012";
    state.sdkRow = {
      id,
      source: "sdk",
      status: "pending",
      callControlId: null,
      userId: "user-1",
      toNumber: "+18095551234",
      fromNumber: "+12125550100",
    };
    await service.handleTelephonyEvent(
      event(
        [{ name: "X-Ringee-Call-Id", value: signCallCorrelation(id) }],
        "+918095551234",
      ),
    );
    assert.deepEqual(hangups, ["leg-1"]);
    assert.deepEqual(admitted, []);
  });

  it("binds only one of two simultaneous SDK legs using the same token", async () => {
    const { service, state, hangups } = setup();
    const id = "12345678-1234-1234-1234-123456789012";
    state.sdkRow = {
      id,
      source: "sdk",
      status: "pending",
      callControlId: null,
      userId: "user-1",
      toNumber: "+18095551234",
      fromNumber: "+12125550100",
    };
    let registrations = 0;
    Object.assign(service, {
      ensureCallAffordable: async () => true,
      ensureNoConcurrentCall: async () => true,
      callerIdRotationService: {
        registerOutboundCall: async () => {
          registrations++;
          return null;
        },
      },
      inboxTimelineService: { ensureThreadForCall: async () => undefined },
      callRepository: {
        findById: async () => ({ ...state.sdkRow }),
        claimPendingCall: async (
          _id: string,
          data: Record<string, unknown>,
        ) => {
          if (state.sdkRow?.callControlId) return false;
          Object.assign(state.sdkRow!, data, { status: "ringing" });
          return true;
        },
        attachTelephony: async () => state.sdkRow,
      },
    });
    const headers = [
      { name: "X-Ringee-Call-Id", value: signCallCorrelation(id) },
    ];
    await Promise.all([
      service.handleTelephonyEvent(event(headers)),
      service.handleTelephonyEvent({
        ...event(headers),
        callControlId: "leg-2",
      }),
    ]);
    assert.equal(registrations, 1);
    assert.equal(hangups.length, 1);
    assert.notEqual(hangups[0], state.sdkRow?.callControlId);
  });
});
