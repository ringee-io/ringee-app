import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConflictException, HttpException, Logger } from "@nestjs/common";
import {
  CallOriginationUncertainError,
  ProviderDispatchDeferredError,
  signCallCorrelation,
} from "@ringee/platform";
import { CallService } from "../call.service";
import { VoicemailDropService } from "./voicemail-drop.service";

process.env.SDK_SIGNING_SECRET ||= "voicemail-drop-admission-test-secret";

describe("server-originated voicemail admission", () => {
  it("persists authorization before dialing and accepts an early webhook without rewinding state", async () => {
    let row: Record<string, unknown> | null = null;
    const callRepo = {
      createVoicemailDropUnlessUnfinished: async (
        ctx: object,
        data: object,
      ) => {
        row = { ...ctx, ...data, callControlId: null };
        return { created: row };
      },
      findById: async () => row,
      findByControlId: async (id: string) =>
        row?.callControlId === id ? row : null,
      claimPendingCall: async (_id: string, data: Record<string, unknown>) => {
        if (row?.callControlId || row?.status !== "pending") return false;
        Object.assign(row, data, { status: "ringing" });
        return true;
      },
    };
    const drop: VoicemailDropService = Object.assign(
      Object.create(VoicemailDropService.prototype),
      {
        logger: new Logger("VoicemailAdmissionTest"),
        callRepo,
        requireAsset: async () => ({ id: "asset-1", name: "Message" }),
        resolveCallerId: async () => "+12125550100",
        resolveContact: async () => null,
        appendTimelineEvent: async () => undefined,
        userService: { getCachedUserById: async () => ({ canCall: true }) },
        complianceService: { findOnDNC: async () => null },
        creditService: { getBalance: async () => 100 },
        callerIdRotationService: { registerOutboundCall: async () => null },
        telephonyService: {
          dial: async (request: {
            clientState: object;
            from: string;
            to: string;
          }) => {
            assert.ok(
              row,
              "admission must exist before the provider can emit a webhook",
            );
            const calls = Object.assign(Object.create(CallService.prototype), {
              callRepository: callRepo,
              voicemailDropService: drop,
            });
            const handled = await calls.handleVoicemailDropEvent(
              {
                type: "call.initiated",
                from: request.from,
                to: request.to,
                clientState: Buffer.from(
                  JSON.stringify(request.clientState),
                ).toString("base64"),
              },
              "leg-1",
            );
            assert.equal(handled, true);
            assert.equal(row?.callControlId, "leg-1");
            row!.status = "answered";
            return { callControlId: "leg-1" };
          },
        },
      },
    );
    const result = await drop.sendVoicemail(
      { userId: "user-1", organizationId: "org-1" },
      { assetId: "asset-1", toNumber: "+18095551234" },
    );
    assert.equal(result.callControlId, "leg-1");
    assert.equal((row as Record<string, unknown> | null)?.status, "answered");
  });

  /** A drop service whose provider dial does what `dial` says. */
  function dropWith(options: {
    unfinished?: { id: string; status: string };
    dial?: () => Promise<{ callControlId: string }>;
  }) {
    const dials: unknown[] = [];
    const failed: string[] = [];
    const service: VoicemailDropService = Object.assign(
      Object.create(VoicemailDropService.prototype),
      {
        logger: new Logger("VoicemailAdmissionTest"),
        callRepo: {
          createVoicemailDropUnlessUnfinished: async (
            ctx: object,
            data: Record<string, unknown>,
          ) =>
            options.unfinished
              ? { unfinished: options.unfinished }
              : { created: { ...ctx, ...data, callControlId: null } },
          failPendingCall: async (id: string) => {
            failed.push(id);
            return true;
          },
          claimPendingCall: async () => true,
        },
        requireAsset: async () => ({ id: "asset-1", name: "Message" }),
        resolveCallerId: async () => "+12125550100",
        resolveContact: async () => null,
        appendTimelineEvent: async () => undefined,
        userService: { getCachedUserById: async () => ({ canCall: true }) },
        complianceService: { findOnDNC: async () => null },
        creditService: { getBalance: async () => 100 },
        callerIdRotationService: { registerOutboundCall: async () => null },
        telephonyService: {
          dial: async (request: unknown) => {
            dials.push(request);
            return (
              options.dial?.() ?? Promise.resolve({ callControlId: "leg-1" })
            );
          },
        },
      },
    );
    const send = () =>
      service.sendVoicemail(
        { userId: "user-1", organizationId: "org-1" },
        { assetId: "asset-1", toNumber: "+18095551234" },
      );
    return { send, dials, failed };
  }

  it("dials no second drop while an earlier one to the number is unsettled", async () => {
    const { send, dials } = dropWith({
      unfinished: { id: "call-earlier", status: "pending" },
    });
    await assert.rejects(send(), (error: unknown) => {
      assert.ok(error instanceof ConflictException);
      const body = error.getResponse() as Record<string, unknown>;
      assert.equal(body.code, "voicemail_drop_in_progress");
      assert.equal(body.callId, "call-earlier");
      return true;
    });
    assert.deepEqual(dials, []);
  });

  it("keeps the row for its webhook when the provider did not confirm the dial", async () => {
    const { send, dials, failed } = dropWith({
      dial: async () => {
        throw new CallOriginationUncertainError(
          new HttpException("timeout of 30000ms exceeded", 502),
        );
      },
    });
    await assert.rejects(send(), (error: unknown) => {
      assert.ok(error instanceof HttpException);
      assert.equal(error.getStatus(), 502);
      assert.equal(
        (error.getResponse() as Record<string, unknown>).code,
        "voicemail_drop_outcome_unknown",
      );
      return true;
    });
    assert.equal(dials.length, 1);
    // Not closed: a leg may exist, and its webhook binds this row.
    assert.deepEqual(failed, []);
  });

  it("closes the row when the dial was refused or never sent, freeing the number", async () => {
    for (const refusal of [
      new HttpException("Invalid destination", 422),
      new ProviderDispatchDeferredError("busy", 900),
    ]) {
      const { send, failed } = dropWith({
        dial: async () => {
          throw refusal;
        },
      });
      await assert.rejects(send(), (error: unknown) => error === refusal);
      assert.equal(failed.length, 1);
    }
  });

  it("does not admit a copied drop token for a different destination", async () => {
    const id = "12345678-1234-1234-1234-123456789012";
    const state = {
      action: "voicemail_drop_send",
      assetId: "asset-1",
      dropToken: signCallCorrelation(id),
    };
    const clientState = Buffer.from(JSON.stringify(state)).toString("base64");
    let claimed = false;
    const calls = Object.assign(Object.create(CallService.prototype), {
      voicemailDropService: Object.create(VoicemailDropService.prototype),
      callRepository: {
        findByControlId: async () => null,
        findById: async () => ({
          id,
          status: "pending",
          clientState,
          toNumber: "+18095551234",
          fromNumber: "+12125550100",
        }),
        claimPendingCall: async () => {
          claimed = true;
          return true;
        },
      },
    });
    const handled = await calls.handleVoicemailDropEvent(
      {
        type: "call.initiated",
        clientState,
        to: "+918095551234",
        from: "+12125550100",
      },
      "forged-leg",
    );
    assert.equal(handled, false);
    assert.equal(claimed, false);
  });
});
