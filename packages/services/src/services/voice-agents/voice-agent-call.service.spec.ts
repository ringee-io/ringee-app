/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VoiceAgentCallService } from "./voice-agent-call.service";

/**
 * Which number an agent call goes out from.
 *
 * This is the one decision the whole feature makes on the user's behalf about
 * the identity a stranger sees, so it is pinned here: a number chosen for the
 * call wins, then the agent's own, then — only when there is no choice to make
 * — the single number the workspace has. Anything else is refused rather than
 * guessed.
 */

const CTX = { userId: "user-1", organizationId: "org-1" };

const NUMBERS = {
  miami: { id: "num-miami", phoneNumber: "+13055550001" },
  madrid: { id: "num-madrid", phoneNumber: "+34910000002" },
};

/** Builds the service with every gate open, so only caller-ID logic is left. */
function build(options: {
  /** The agent's own assignment, if it has one. */
  callerNumberId?: string | null;
  /** What the workspace can call from. */
  usable: Array<{ id: string; phoneNumber: string }>;
}) {
  const placed: Array<{ from: string }> = [];
  const agent = {
    id: "agent-1",
    name: "Sofia",
    type: "reminders_notifications",
    providerAssistantId: "assistant-1",
    providerTexmlAppId: "app-1",
    callerNumberId: options.callerNumberId ?? null,
  };

  const service = new VoiceAgentCallService(
    { require: async () => agent, assertReadyForCalls: () => {} } as never,
    { require: () => ({ variables: [] }) } as never,
    {
      create: async () => ({ id: "agent-call-1" }),
      update: async (id: string, data: Record<string, unknown>) => ({
        id,
        status: data.status,
      }),
    } as never,
    { createCall: async () => ({ id: "call-1" }) } as never,
    {
      startCall: async (input: { from: string }) => {
        placed.push({ from: input.from });
        return { providerCallId: "prov-1", callControlId: "cc-1" };
      },
    } as never,
    { findOrCreateByPhone: async () => ({ id: "contact-1" }) } as never,
    { findOnDNC: async () => null } as never,
    { getBalance: async () => 100 } as never,
    { listOutboundCallerIds: async () => options.usable } as never,
    {
      getCachedUserById: async () => ({ canCall: true, freeCallTrial: false }),
    } as never,
  );

  return { service, placed };
}

const TO = "+13055559999";

describe("VoiceAgentCallService caller ID", () => {
  it("presents the number assigned to the agent", async () => {
    const { service, placed } = build({
      callerNumberId: NUMBERS.madrid.id,
      usable: [NUMBERS.miami, NUMBERS.madrid],
    });

    await service.startCall(CTX as never, "agent-1", { to: TO });

    assert.deepEqual(placed, [{ from: NUMBERS.madrid.phoneNumber }]);
  });

  it("lets the caller override the agent's number for one call", async () => {
    const { service, placed } = build({
      callerNumberId: NUMBERS.madrid.id,
      usable: [NUMBERS.miami, NUMBERS.madrid],
    });

    await service.startCall(CTX as never, "agent-1", {
      to: TO,
      fromNumberId: NUMBERS.miami.id,
    });

    assert.deepEqual(placed, [{ from: NUMBERS.miami.phoneNumber }]);
  });

  it("uses the only number there is when the agent has none", async () => {
    const { service, placed } = build({ usable: [NUMBERS.miami] });

    await service.startCall(CTX as never, "agent-1", { to: TO });

    assert.deepEqual(placed, [{ from: NUMBERS.miami.phoneNumber }]);
  });

  it("refuses to pick for an unassigned agent when there is a choice", async () => {
    const { service, placed } = build({
      usable: [NUMBERS.miami, NUMBERS.madrid],
    });

    await assert.rejects(
      service.startCall(CTX as never, "agent-1", { to: TO }),
      /no number assigned/i,
    );
    assert.deepEqual(placed, []);
  });

  it("refuses when the agent's assigned number is no longer usable", async () => {
    const { service, placed } = build({
      callerNumberId: "num-released",
      usable: [NUMBERS.miami, NUMBERS.madrid],
    });

    await assert.rejects(
      service.startCall(CTX as never, "agent-1", { to: TO }),
      /no longer available/i,
    );
    assert.deepEqual(placed, []);
  });

  it("never trusts a number id the caller does not own", async () => {
    const { service, placed } = build({ usable: [NUMBERS.miami] });

    await assert.rejects(
      service.startCall(CTX as never, "agent-1", {
        to: TO,
        fromNumberId: "num-somebody-elses",
      }),
      /not available/i,
    );
    assert.deepEqual(placed, []);
  });

  it("refuses when the workspace has no number for agent calls", async () => {
    const { service, placed } = build({ usable: [] });

    await assert.rejects(
      service.startCall(CTX as never, "agent-1", { to: TO }),
      /No number in this workspace/i,
    );
    assert.deepEqual(placed, []);
  });
});
