import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Logger } from "@nestjs/common";
import { signCallCorrelation } from "@ringee/platform";
import { CallService } from "../call.service";
import { VoicemailDropService } from "./voicemail-drop.service";

process.env.SDK_SIGNING_SECRET ||= "voicemail-drop-admission-test-secret";

describe("server-originated voicemail admission", () => {
  it("persists authorization before dialing and accepts an early webhook without rewinding state", async () => {
    let row: Record<string, unknown> | null = null;
    const callRepo = {
      createCall: async (ctx: object, data: object) => {
        row = { ...ctx, ...data, callControlId: null };
        return row;
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
