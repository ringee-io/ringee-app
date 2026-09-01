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

/** What `findOrCreateByPhone` was asked to leave behind in the workspace. */
interface ResolvedContact {
  phoneNumber: string;
  hint?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    source?: string;
  };
}

/** Builds the service with every gate open, so only caller-ID logic is left. */
function build(options: {
  /** The agent's own assignment, if it has one. */
  callerNumberId?: string | null;
  /** What the workspace can call from. */
  usable: Array<{ id: string; phoneNumber: string }>;
  /** The agent type's dynamic variables, when a test supplies any. */
  variables?: Array<{ key: string; required: boolean }>;
  /** What the tool re-sync throws, for the test that it is best-effort. */
  toolSyncError?: Error;
}) {
  const placed: Array<{ from: string }> = [];
  const contacts: ResolvedContact[] = [];
  const agent = {
    id: "agent-1",
    name: "Sofia",
    type: "reminders_notifications",
    providerAssistantId: "assistant-1",
    providerTexmlAppId: "app-1",
    callerNumberId: options.callerNumberId ?? null,
  };

  const configured: string[] = [];
  const analysisEnsured: string[] = [];
  const toolsEnsured: string[] = [];
  const service = new VoiceAgentCallService(
    {
      require: async () => agent,
      assertReadyForCalls: () => {},
      ensureCallingApp: async (_agent: unknown, callingAppId: string) => {
        configured.push(callingAppId);
      },
      ensureInsightGroup: async (target: { id: string }) => {
        analysisEnsured.push(target.id);
      },
      ensureToolEndpoints: async (_ctx: unknown, target: { id: string }) => {
        if (options.toolSyncError) throw options.toolSyncError;
        toolsEnsured.push(target.id);
      },
    } as never,
    { require: () => ({ variables: options.variables ?? [] }) } as never,
    {
      create: async () => ({ id: "agent-call-1" }),
      update: async (id: string, data: Record<string, unknown>) => ({
        id,
        status: data.status,
      }),
    } as never,
    {
      createCall: async () => ({ id: "call-1" }),
      attachTelephony: async () => ({ id: "call-1" }),
      markForciblyEnded: async () => ({ id: "call-1" }),
    } as never,
    {
      startCall: async (input: { from: string }) => {
        placed.push({ from: input.from });
        return { providerCallId: "prov-1", callControlId: "cc-1" };
      },
    } as never,
    {
      findOrCreateByPhone: async (
        _ctx: unknown,
        phoneNumber: string,
        hint?: ResolvedContact["hint"],
      ) => {
        contacts.push({ phoneNumber, hint });
        return { id: "contact-1" };
      },
    } as never,
    { findOnDNC: async () => null } as never,
    { getBalance: async () => 100 } as never,
    { listOutboundCallerIds: async () => options.usable } as never,
    {
      getCachedUserById: async () => ({ canCall: true, freeCallTrial: false }),
    } as never,
  );

  return {
    service,
    placed,
    contacts,
    configured,
    analysisEnsured,
    toolsEnsured,
  };
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

/**
 * Everyone an agent dials is kept in Ringee.
 *
 * The person's name only ever exists as a per-call variable, so if it is not
 * written onto the contact here it is lost: the workspace ends up with a
 * nameless row it cannot follow up on, which is indistinguishable from the
 * agent never having called.
 */
describe("VoiceAgentCallService contacts", () => {
  const NAMED = [
    { key: "first_name", required: true },
    { key: "last_name", required: false },
    { key: "email", required: false },
  ];

  it("saves the person as a named contact in the workspace", async () => {
    const { service, contacts } = build({
      usable: [NUMBERS.miami],
      variables: NAMED,
    });

    await service.startCall(CTX as never, "agent-1", {
      to: TO,
      variables: {
        first_name: "Ana",
        last_name: "Torres",
        email: "ana@example.com",
      },
    });

    assert.equal(contacts.length, 1);
    assert.equal(contacts[0]!.phoneNumber, TO);
    assert.deepEqual(contacts[0]!.hint, {
      firstName: "Ana",
      lastName: "Torres",
      email: "ana@example.com",
      source: "ai-voice-agent",
    });
  });

  it("still saves the contact when the agent type carries no identity", async () => {
    const { service, contacts } = build({ usable: [NUMBERS.miami] });

    await service.startCall(CTX as never, "agent-1", { to: TO });

    assert.equal(contacts.length, 1);
    assert.equal(contacts[0]!.phoneNumber, TO);
    assert.equal(contacts[0]!.hint?.source, "ai-voice-agent");
  });
});

/**
 * The calling application is what decides the outbound route an agent call
 * bills through and whether the provider reports what it cost — so it is
 * brought in line on every dial, not only when the agent is saved. An agent
 * created before Ringee configured these at all would otherwise never get one.
 */
describe("VoiceAgentCallService calling application", () => {
  it("configures the calling application before placing the call", async () => {
    const { service, configured } = build({ usable: [NUMBERS.miami] });

    await service.startCall(CTX as never, "agent-1", { to: TO });

    assert.deepEqual(configured, ["app-1"]);
  });

  it("points the analysis group at Ringee before placing the call", async () => {
    // An agent whose group predates the callback analyses every call and
    // delivers the results nowhere. Waiting for the user to save the agent
    // again is not a repair (AGENT-009).
    const { service, analysisEnsured } = build({ usable: [NUMBERS.miami] });

    await service.startCall(CTX as never, "agent-1", { to: TO });

    assert.deepEqual(analysisEnsured, ["agent-1"]);
  });

  it("points the agent's tools at Ringee before placing the call", async () => {
    // Tool URLs are written when the agent is saved and never revisited, so
    // they outlive the address they were built from. An agent still calling
    // the old one does not book the meeting — it tells the person it is
    // having a technical problem, on a call the workspace paid for.
    const { service, toolsEnsured } = build({ usable: [NUMBERS.miami] });

    await service.startCall(CTX as never, "agent-1", { to: TO });

    assert.deepEqual(toolsEnsured, ["agent-1"]);
  });

  it("places the call even when the tool check itself fails", async () => {
    // Best-effort, like the two beside it: a re-sync Ringee could not run is
    // worth a call with stale tools, never worth refusing the call.
    const { service, placed } = build({
      usable: [NUMBERS.miami],
      toolSyncError: new Error("provider unavailable"),
    });

    await service.startCall(CTX as never, "agent-1", { to: TO });

    assert.deepEqual(placed, [{ from: NUMBERS.miami.phoneNumber }]);
  });
});
