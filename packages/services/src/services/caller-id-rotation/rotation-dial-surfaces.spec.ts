/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CallSessionService } from "../call-session/call-session.service";
import { DialerOrchestrationService } from "../outbound/dialer-orchestration.service";
import { VoicemailDropService } from "../outbound/voicemail-drop.service";
import { SdkCallerIdResolver } from "../sdk/sdk-caller-id-resolver.service";

const ctx = { userId: "user-1", organizationId: "org-1" };
const refusal = {
  phoneNumber: null,
  numberId: null,
  rotated: false,
  reason: "all_over_cap",
};
const selected = {
  phoneNumber: "+12125550101",
  numberId: "number-1",
  rotated: true,
  reason: "rotated",
};

describe("rotation across dial surfaces", () => {
  it("keeps a refused session item pending and releases the owner's dial reservation", async () => {
    const mutations: string[] = [];
    const service: CallSessionService = Object.assign(
      Object.create(CallSessionService.prototype),
      {
        tokenService: {
          validateToken: async () => ({
            session: { id: "session", status: "ready", ...ctx },
          }),
        },
        repo: {
          findItemById: async () => ({
            id: "item",
            callSessionId: "session",
            status: "pending",
            phoneNumber: "+12125550123",
          }),
          findActiveCallingItem: async () => null,
          updateItem: async () => {
            mutations.push("item");
          },
          update: async () => {
            mutations.push("session");
          },
        },
        userService: { getCachedUserById: async () => ({ canCall: true }) },
        creditService: { getBalance: async () => 100 },
        numberRepo: { findByOwner: async () => [] },
        concurrentCallGuard: {
          requestDial: async () => ({ allowed: true }),
          releasePending: async (user: string, device: string) => {
            mutations.push(`${user}/${device}`);
          },
        },
        callerIdRotationService: { selectForDial: async () => refusal },
      },
    );
    await assert.rejects(
      service.startCallForItem("token", "session", "item", {}),
      /cap/,
    );
    assert.deepEqual(mutations, ["user-1/session:session"]);
  });
  it("voicemail drops do not replace a refusal or selector failure with the fixed number", async () => {
    const service = Object.assign(
      Object.create(VoicemailDropService.prototype),
      {
        numberRepo: {
          findOne: async () => ({ id: "fixed", phoneNumber: "+14155550101" }),
        },
        callerIdRotationService: { selectForDial: async () => refusal },
      },
    ) as {
      resolveCallerId: (
        ctx: object,
        org: string,
        destination: string,
      ) => Promise<string | null>;
    };
    assert.equal(
      await service.resolveCallerId(ctx, ctx.organizationId, "+12125550123"),
      null,
    );
    Object.assign(service, {
      callerIdRotationService: {
        selectForDial: async () => {
          throw new Error("selector unavailable");
        },
      },
    });
    await assert.rejects(
      service.resolveCallerId(ctx, ctx.organizationId, "+12125550123"),
      /selector unavailable/,
    );
  });
  it("SDK automatic selection preserves the actual number ID and honors refusal", async () => {
    const rotation = {
      selectForDial: async () => selected as typeof selected | typeof refusal,
    };
    const service = new SdkCallerIdResolver(
      { findByOwner: async () => [] } as never,
      { getCallerIds: async () => [] } as never,
      rotation as never,
      {} as never,
    );
    assert.deepEqual(
      await service.resolveForDial(ctx, ctx.userId, "+12125550123"),
      { phoneNumber: selected.phoneNumber, callerIdId: selected.numberId },
    );
    rotation.selectForDial = async () => refusal;
    await assert.rejects(
      service.resolveForDial(ctx, ctx.userId, "+12125550123"),
      /No caller ID/,
    );
  });
  it("preview campaigns use the same rotation, caps and reservation gates as progressive campaigns", async () => {
    const events: string[] = [];
    const states: string[] = [];
    let allow = true;
    let selection: typeof selected | typeof refusal = refusal;
    const service: DialerOrchestrationService = Object.assign(
      Object.create(DialerOrchestrationService.prototype),
      {
        logger: { warn() {}, log() {} },
        agentSessionService: {
          getById: async () => ({
            id: "session",
            status: "reserved",
            currentLeadId: "lead",
            campaignId: "campaign",
            ...ctx,
          }),
          transitionTo: async (_id: string, state: string) => {
            states.push(state);
          },
        },
        campaignRepo: {
          findById: async () => ({
            id: "campaign",
            organizationId: ctx.organizationId,
            callerIdId: null,
            numberPurchasedId: null,
            rotationNumberIds: ["number-1"],
          }),
        },
        numberPurchasedRepo: { findOne: async () => null },
        leadQueueService: {
          getLeadById: async () => ({
            id: "lead",
            campaignId: "campaign",
            contact: { phoneNumber: "+12125550123" },
          }),
          releaseLead: async () => {},
        },
        callAttemptService: {
          getAttemptHistory: async () => [{ id: "attempt" }],
        },
        callerIdRotationService: {
          selectForDial: async (
            _ctx: unknown,
            _destination: string,
            _fallback: unknown,
            opts: { restrictToNumberIds: string[] },
          ) => {
            assert.deepEqual(opts.restrictToNumberIds, ["number-1"]);
            return selection;
          },
        },
        concurrentCallGuard: {
          requestDial: async () => ({ allowed: allow }),
          releasePending: async () => {
            events.push("released");
          },
        },
        sseBridge: {
          emit: (_key: string, type: string) => {
            events.push(type);
          },
        },
      },
    );
    await service.manualDial("session", "campaign");
    assert.deepEqual(events, ["released", "call.blocked", "session.state"]);
    assert.deepEqual(states, ["ready"]);
    events.length = 0;
    states.length = 0;
    selection = selected;
    await service.manualDial("session", "campaign");
    assert.deepEqual(events, ["call.initiate"]);
    assert.deepEqual(states, ["dialing"]);
    events.length = 0;
    allow = false;
    await service.manualDial("session", "campaign");
    assert.ok(!events.includes("call.initiate"));
    await assert.rejects(
      service.manualDial("session", "different-campaign"),
      /does not match/,
    );
  });
});
