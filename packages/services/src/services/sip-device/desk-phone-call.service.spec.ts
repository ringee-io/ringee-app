import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HttpException } from "@nestjs/common";
import { ProviderDispatchDeferredError } from "@ringee/platform";
import { DeskPhoneCallService } from "./desk-phone-call.service";

const DEVICE = {
  id: "device-1",
  userId: "user-1",
  organizationId: "org-1",
  status: "registered",
  deletedAt: null,
  allowOutbound: true,
  label: "Front desk",
  publicRef: "dp_1",
  callerId: "+12125550100",
  telnyxConnectionId: "conn-1",
};

/**
 * A desk phone dialing out: the device parks the call, and Ringee bridges it to
 * the PSTN once every gate passed. Everything around the bridge is a stand-in;
 * what is checked is what happens when the bridge itself cannot go out.
 */
function setup(bridge: () => Promise<void>) {
  const log: string[] = [];
  const blocked: Array<Record<string, unknown>> = [];
  const service = new DeskPhoneCallService(
    { findByConnectionId: async () => DEVICE } as never,
    { markRegistered: async () => undefined } as never,
    {
      record: async (entry: Record<string, unknown>) => {
        blocked.push(entry);
      },
    } as never,
    {
      findByControlId: async () => null,
      createCall: async () => {
        log.push("call-row");
        return { id: "call-1" };
      },
    } as never,
    {
      findByPhoneNumber: async () => ({
        id: "num-1",
        organizationId: "org-1",
        userId: "user-1",
        deletedAt: null,
      }),
    } as never,
    { listOutboundCallerIds: async () => [{ id: "num-1" }] } as never,
    { getBalance: async () => 10 } as never,
    {
      getCachedUserById: async () => ({ canCall: true, freeCallTrial: false }),
    } as never,
    { findOrCreateByPhone: async () => null } as never,
    { findOnDNC: async () => null } as never,
    {
      connectParkedCall: async () => {
        log.push("bridge");
        await bridge();
      },
      hangupCall: async (id: string) => {
        log.push(`hangup:${id}`);
      },
    } as never,
    {
      requestDial: async () => ({ allowed: true }),
      releasePending: async (_userId: string, lease: string) => {
        log.push(`release:${lease}`);
      },
      appliesTo: async () => false,
      bindToCall: async () => undefined,
    } as never,
    {} as never,
  );
  const dial = () =>
    service.handleEvent({
      id: "event-1",
      event_type: "call.initiated",
      payload: {
        call_control_id: "leg-1",
        connection_id: "conn-1",
        direction: "outbound",
        to: "+18095551234",
      },
    });
  return { dial, log, blocked };
}

describe("desk phone: a bridge the pacing layer would not send", () => {
  it("ends the parked leg, hands back the slot and records why, like any refused dial", async () => {
    const { dial, log, blocked } = setup(async () => {
      throw new ProviderDispatchDeferredError(
        "coordination_unavailable",
        1_000,
      );
    });

    await dial();

    assert.ok(log.includes("release:sip:device-1:leg-1"), "slot handed back");
    assert.ok(log.includes("hangup:leg-1"), "parked leg ended");
    assert.equal(blocked.length, 1);
    assert.equal(blocked[0].reason, "DISPATCH_DEFERRED");
    assert.equal(blocked[0].detail, "coordination_unavailable");
    assert.equal(blocked[0].providerCallId, "leg-1");
    assert.ok(!log.includes("call-row"), "no call is recorded as placed");
  });

  it("lets any other failure go up: the request may have left", async () => {
    const failure = new HttpException("Bad Gateway", 502);
    const { dial, log, blocked } = setup(async () => {
      throw failure;
    });

    await assert.rejects(dial(), (error: unknown) => error === failure);
    assert.deepEqual(blocked, []);
    assert.ok(!log.some((entry) => entry.startsWith("hangup:")));
  });

  it("records the call once the bridge went out", async () => {
    const { dial, log, blocked } = setup(async () => undefined);
    await dial();
    assert.deepEqual(blocked, []);
    assert.ok(log.includes("call-row"));
  });
});
