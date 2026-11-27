/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BadRequestException,
  ConflictException,
  HttpException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { VoiceAgentCallRefusedError } from "@ringee/platform";
import {
  VoiceAgentCallService,
  VoiceAgentCallStartError,
  VoiceAgentCallStartOutcome,
  clientIdempotencyKey,
} from "./voice-agent-call.service";

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
  /** What the provider dial throws before accepting a leg. */
  providerError?: Error;
  /** What persisting the provider handle throws after a leg exists. */
  attachError?: Error;
  /** Agent-local clock used for runtime context. */
  timezone?: string | null;
  /** The agent's type; an outbound type unless a test says otherwise. */
  type?: string;
  /** An agent call an earlier start already persisted under its key. */
  existingByKey?: Record<string, unknown> | null;
  /** What each successive key lookup answers, for a start racing another. */
  keyLookups?: Array<Record<string, unknown> | null>;
  /** Whether the destination is on the DNC list now. */
  onDnc?: boolean;
}) {
  const placed: Array<{ from: string }> = [];
  const providerVariables: Array<Record<string, string>> = [];
  const contacts: ResolvedContact[] = [];
  const agent = {
    id: "agent-1",
    name: "Sofia",
    type: options.type ?? "reminders_notifications",
    providerAssistantId: "assistant-1",
    providerTexmlAppId: "app-1",
    callerNumberId: options.callerNumberId ?? null,
    timezone: options.timezone ?? null,
  };

  const configured: string[] = [];
  const analysisEnsured: string[] = [];
  const deliveryEvents: string[] = [];
  const agentCallUpdates: Array<Record<string, unknown>> = [];
  const forciblyEnded: string[] = [];
  const createdAgentCalls: Array<Record<string, unknown>> = [];
  const keyLookupsSeen: string[] = [];
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
        await Promise.resolve();
        deliveryEvents.push(`tools:${target.id}`);
        return true;
      },
    } as never,
    { require: () => ({ variables: options.variables ?? [] }) } as never,
    {
      create: async (data: Record<string, unknown>) => {
        createdAgentCalls.push(data);
        return { id: "agent-call-1" };
      },
      findByIdempotencyKey: async (key: string) => {
        keyLookupsSeen.push(key);
        if (options.keyLookups) return options.keyLookups.shift() ?? null;
        return options.existingByKey ?? null;
      },
      update: async (id: string, data: Record<string, unknown>) => {
        agentCallUpdates.push(data);
        return { id, status: data.status };
      },
    } as never,
    {
      createCall: async () => ({ id: "call-1" }),
      attachTelephony: async () => {
        if (options.attachError) throw options.attachError;
        return { id: "call-1" };
      },
      markForciblyEnded: async (id: string) => {
        forciblyEnded.push(id);
        return { id };
      },
    } as never,
    {
      startCall: async (input: {
        from: string;
        variables: Record<string, string>;
      }) => {
        deliveryEvents.push("call:placed");
        if (options.providerError) throw options.providerError;
        placed.push({ from: input.from });
        providerVariables.push(input.variables);
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
    {
      findOnDNC: async () =>
        options.onDnc ? { reason: "asked not to be called" } : null,
    } as never,
    { getBalance: async () => 100 } as never,
    { listOutboundCallerIds: async () => options.usable } as never,
    {
      getCachedUserById: async () => ({ canCall: true, freeCallTrial: false }),
    } as never,
  );

  return {
    service,
    placed,
    createdAgentCalls,
    contacts,
    configured,
    analysisEnsured,
    deliveryEvents,
    providerVariables,
    agentCallUpdates,
    forciblyEnded,
    keyLookupsSeen,
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
  it("supplies the agent-local date and time on every dial", async () => {
    const { service, providerVariables } = build({
      usable: [NUMBERS.miami],
      timezone: "America/Santo_Domingo",
    });

    await service.startCall(CTX as never, "agent-1", { to: TO });

    assert.equal(providerVariables[0]!.agent_timezone, "America/Santo_Domingo");
    assert.match(providerVariables[0]!.current_datetime, /GMT-04:00$/);
  });

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
    const { service, deliveryEvents } = build({ usable: [NUMBERS.miami] });

    await service.startCall(CTX as never, "agent-1", { to: TO });

    assert.deepEqual(deliveryEvents, ["tools:agent-1", "call:placed"]);
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

describe("VoiceAgentCallService start outcomes", () => {
  it("exposes a terminal policy rejection", async () => {
    const { service, placed } = build({ usable: [] });

    await assert.rejects(
      service.startCall(CTX as never, "agent-1", { to: TO }),
      (error: unknown) => {
        assert.ok(error instanceof VoiceAgentCallStartError);
        assert.equal(
          error.outcome,
          VoiceAgentCallStartOutcome.terminal_rejection,
        );
        return true;
      },
    );
    assert.deepEqual(placed, []);
  });

  it("refuses to place a call with a receptionist, before writing anything", async () => {
    const { service, placed, contacts, agentCallUpdates } = build({
      type: "receptionist",
      usable: [NUMBERS.miami],
    });

    await assert.rejects(
      service.startCall(CTX as never, "agent-1", { to: TO }),
      (error: unknown) => {
        assert.ok(error instanceof VoiceAgentCallStartError);
        assert.equal(
          error.outcome,
          VoiceAgentCallStartOutcome.terminal_rejection,
        );
        return true;
      },
    );
    assert.deepEqual(placed, []);
    assert.deepEqual(contacts, []);
    assert.deepEqual(agentCallUpdates, []);
  });

  it("exposes a retryable failure when the provider refused the call", async () => {
    const { service, placed, forciblyEnded } = build({
      usable: [NUMBERS.miami],
      providerError: new VoiceAgentCallRefusedError(
        new HttpException({ errors: [{ title: "Invalid To" }] }, 422),
      ),
    });

    await assert.rejects(
      service.startCall(CTX as never, "agent-1", { to: TO }),
      (error: unknown) => {
        assert.ok(error instanceof VoiceAgentCallStartError);
        assert.equal(
          error.outcome,
          VoiceAgentCallStartOutcome.retryable_before_placement,
        );
        // REST, CLI and MCP callers still get the provider's own answer.
        assert.equal(error.getStatus(), 422);
        return true;
      },
    );
    assert.deepEqual(placed, []);
    assert.deepEqual(forciblyEnded, ["call-1"]);
  });

  it("never treats a dial the provider did not refuse as unplaced", async () => {
    // A timeout or a 5xx may come back after the provider already rang the
    // lead: retrying it would place a second leg.
    const { service, agentCallUpdates, forciblyEnded } = build({
      usable: [NUMBERS.miami],
      providerError: new Error("socket hang up"),
    });

    await assert.rejects(
      service.startCall(CTX as never, "agent-1", { to: TO }),
      (error: unknown) => {
        assert.ok(error instanceof VoiceAgentCallStartError);
        assert.equal(
          error.outcome,
          VoiceAgentCallStartOutcome.placed_pending_reconciliation,
        );
        assert.equal(error.agentCallId, "agent-call-1");
        return true;
      },
    );
    assert.deepEqual(forciblyEnded, []);
    assert.equal(
      agentCallUpdates.some((update) => update.status === "failed"),
      false,
    );
  });

  it("exposes a placed leg when later persistence needs reconciliation", async () => {
    const { service, placed, agentCallUpdates, forciblyEnded } = build({
      usable: [NUMBERS.miami],
      attachError: new Error("database unavailable"),
    });

    await assert.rejects(
      service.startCall(CTX as never, "agent-1", { to: TO }),
      (error: unknown) => {
        assert.ok(error instanceof VoiceAgentCallStartError);
        assert.equal(
          error.outcome,
          VoiceAgentCallStartOutcome.placed_pending_reconciliation,
        );
        return true;
      },
    );
    assert.equal(placed.length, 1);
    assert.equal(
      agentCallUpdates.some((update) => update.status === "initiating"),
      true,
    );
    assert.deepEqual(forciblyEnded, []);
  });
});

describe("VoiceAgentCallService durable callers (AGENT-019)", () => {
  it("persists the caller's key and member on the agent call before dialing", async () => {
    const { service, placed, createdAgentCalls } = build({
      usable: [NUMBERS.miami],
    });

    await service.startCall(CTX as never, "agent-1", {
      to: TO,
      idempotencyKey: "meeting:m1:v1:policy:p1:p1:T-1440m:a1:d1",
      responsibleUserId: "member-7",
    });

    assert.equal(placed.length, 1);
    assert.equal(
      createdAgentCalls[0]!.idempotencyKey,
      "meeting:m1:v1:policy:p1:p1:T-1440m:a1:d1",
    );
    assert.equal(createdAgentCalls[0]!.responsibleUserId, "member-7");
  });

  it("never places a second leg, or writes the contact again, under a key whose call may already exist", async () => {
    const { service, placed, contacts } = build({
      usable: [NUMBERS.miami],
      existingByKey: {
        id: "agent-call-earlier",
        status: "initiating",
        providerCallControlId: "cc-1",
      },
    });

    await assert.rejects(
      service.startCall(CTX as never, "agent-1", {
        to: TO,
        idempotencyKey: "k-1",
      }),
      (error: unknown) =>
        error instanceof VoiceAgentCallStartError &&
        error.outcome ===
          VoiceAgentCallStartOutcome.placed_pending_reconciliation &&
        error.agentCallId === "agent-call-earlier",
    );
    assert.deepEqual(placed, []);
    assert.deepEqual(contacts, []);
  });

  it("reports an earlier try that provably placed nothing as safe to follow", async () => {
    const { service, placed, contacts } = build({
      usable: [NUMBERS.miami],
      existingByKey: { id: "agent-call-earlier", status: "failed" },
    });

    await assert.rejects(
      service.startCall(CTX as never, "agent-1", {
        to: TO,
        idempotencyKey: "k-1",
      }),
      (error: unknown) =>
        error instanceof VoiceAgentCallStartError &&
        error.outcome === VoiceAgentCallStartOutcome.retryable_before_placement,
    );
    assert.deepEqual(placed, []);
    assert.deepEqual(contacts, []);
  });
});

describe("VoiceAgentCallService.startCallForClient (HOOK-008)", () => {
  const SCOPE = "integration-1";
  /** The agent call an earlier request under the key left behind. */
  const earlier = (overrides: Record<string, unknown> = {}) => ({
    id: "agent-call-earlier",
    agentId: "agent-1",
    toNumber: TO,
    status: "initiating",
    userId: CTX.userId,
    organizationId: CTX.organizationId,
    ...overrides,
  });

  it("is an ordinary start when the client sends no key", async () => {
    const { service, placed, createdAgentCalls } = build({
      usable: [NUMBERS.miami],
    });

    const result = await service.startCallForClient(
      CTX as never,
      "agent-1",
      { to: TO },
      { scope: SCOPE },
    );

    assert.equal(result.replayed, false);
    assert.equal(placed.length, 1);
    assert.equal(createdAgentCalls[0]!.idempotencyKey, null);
  });

  it("stores the key namespaced and hashed, and places the call once", async () => {
    const { service, placed, createdAgentCalls } = build({
      usable: [NUMBERS.miami],
    });

    const result = await service.startCallForClient(
      CTX as never,
      "agent-1",
      { to: TO },
      { scope: SCOPE, idempotencyKey: "crm-lead-42" },
    );

    assert.equal(result.replayed, false);
    assert.equal(placed.length, 1);
    const stored = createdAgentCalls[0]!.idempotencyKey as string;
    assert.equal(stored, clientIdempotencyKey(SCOPE, "crm-lead-42"));
    assert.match(stored, /^client:integration-1:[0-9a-f]{64}$/);
    assert.equal(stored.includes("crm-lead-42"), false);
  });

  it("keeps two integrations' identical keys apart, and apart from Ringee's own", () => {
    const a = clientIdempotencyKey("integration-1", "k");
    const b = clientIdempotencyKey("integration-2", "k");
    assert.notEqual(a, b);
    assert.equal(a.startsWith("meeting:"), false);
    assert.equal(clientIdempotencyKey("integration-1", "k"), a);
  });

  it("answers a retry with the original call and places nothing", async () => {
    const { service, placed, contacts, createdAgentCalls } = build({
      usable: [NUMBERS.miami],
      existingByKey: earlier(),
    });

    const result = await service.startCallForClient(
      CTX as never,
      "agent-1",
      { to: TO },
      { scope: SCOPE, idempotencyKey: "crm-lead-42" },
    );

    assert.deepEqual(result, {
      id: "agent-call-earlier",
      status: "initiating",
      replayed: true,
    });
    assert.deepEqual(placed, []);
    assert.deepEqual(contacts, []);
    assert.deepEqual(createdAgentCalls, []);
  });

  it("still answers a retry after the number joined the DNC list", async () => {
    const { service, placed } = build({
      usable: [NUMBERS.miami],
      existingByKey: earlier(),
      onDnc: true,
    });

    const result = await service.startCallForClient(
      CTX as never,
      "agent-1",
      { to: TO },
      { scope: SCOPE, idempotencyKey: "crm-lead-42" },
    );

    assert.equal(result.replayed, true);
    assert.deepEqual(placed, []);
  });

  it("applies every gate to the first request under a key", async () => {
    const { service, placed, createdAgentCalls } = build({
      usable: [NUMBERS.miami],
      onDnc: true,
    });

    await assert.rejects(
      service.startCallForClient(
        CTX as never,
        "agent-1",
        { to: TO },
        { scope: SCOPE, idempotencyKey: "crm-lead-43" },
      ),
      (error: unknown) =>
        error instanceof VoiceAgentCallStartError &&
        error.outcome === VoiceAgentCallStartOutcome.terminal_rejection,
    );
    assert.deepEqual(placed, []);
    assert.deepEqual(createdAgentCalls, []);
  });

  it("refuses a key that already placed a call to another number", async () => {
    const { service, placed } = build({
      usable: [NUMBERS.miami],
      existingByKey: earlier({ toNumber: "+13055550000" }),
    });

    await assert.rejects(
      service.startCallForClient(
        CTX as never,
        "agent-1",
        { to: TO },
        { scope: SCOPE, idempotencyKey: "crm-lead-42" },
      ),
      UnprocessableEntityException,
    );
    assert.deepEqual(placed, []);
  });

  it("refuses a key that already placed a call for another agent", async () => {
    const { service, placed } = build({
      usable: [NUMBERS.miami],
      existingByKey: earlier({ agentId: "agent-2" }),
    });

    await assert.rejects(
      service.startCallForClient(
        CTX as never,
        "agent-1",
        { to: TO },
        { scope: SCOPE, idempotencyKey: "crm-lead-42" },
      ),
      UnprocessableEntityException,
    );
    assert.deepEqual(placed, []);
  });

  it("compares the destination as the call stores it, not as it was typed", async () => {
    const { service } = build({
      usable: [NUMBERS.miami],
      existingByKey: earlier(),
    });

    const result = await service.startCallForClient(
      CTX as never,
      "agent-1",
      { to: "+1 (305) 555-9999" },
      { scope: SCOPE, idempotencyKey: "crm-lead-42" },
    );

    assert.equal(result.replayed, true);
  });

  it("never reveals another workspace's call under the same key", async () => {
    const { service, placed } = build({
      usable: [NUMBERS.miami],
      existingByKey: earlier({ organizationId: "org-2" }),
    });

    await assert.rejects(
      service.startCallForClient(
        CTX as never,
        "agent-1",
        { to: TO },
        { scope: SCOPE, idempotencyKey: "crm-lead-42" },
      ),
      (error: unknown) =>
        error instanceof ConflictException &&
        !JSON.stringify(error.getResponse()).includes("agent-call-earlier"),
    );
    assert.deepEqual(placed, []);
  });

  it("answers the loser of a race with the winner's call", async () => {
    const winner = earlier({ providerCallControlId: "cc-9" });
    const { service, placed, createdAgentCalls } = build({
      usable: [NUMBERS.miami],
      // The pre-check misses; `startCall` then finds the winner's row; the
      // fallback read finds it again.
      keyLookups: [null, winner, winner],
    });

    const result = await service.startCallForClient(
      CTX as never,
      "agent-1",
      { to: TO },
      { scope: SCOPE, idempotencyKey: "crm-lead-42" },
    );

    assert.equal(result.replayed, true);
    assert.equal(result.id, "agent-call-earlier");
    assert.deepEqual(placed, []);
    assert.deepEqual(createdAgentCalls, []);
  });

  it("refuses to answer a retry with an attempt that failed before any call was placed", async () => {
    // F-01: a retry (n8n's Retry On Fail, a re-sent request) carries the SAME
    // key, so answering it with a 200 "failed" call looked like success to the
    // workflow while nothing had ever been dialed.
    const { service, placed, createdAgentCalls } = build({
      usable: [NUMBERS.miami],
      existingByKey: earlier({
        status: "failed",
        providerCallControlId: null,
        lastError: "The provider could not be reached",
      }),
    });

    await assert.rejects(
      service.startCallForClient(
        CTX as never,
        "agent-1",
        { to: TO },
        { scope: SCOPE, idempotencyKey: "crm-lead-42" },
      ),
      (error: unknown) => {
        assert.ok(error instanceof ConflictException);
        const body = error.getResponse() as Record<string, unknown>;
        assert.equal(body.code, "idempotency_key_failed");
        assert.match(String(body.message), /nothing was dialed/i);
        assert.match(String(body.message), /new idempotency-key/i);
        // The stored reason is internal (a database or provider message can
        // be in it) and stays out of the answer: the message is fixed.
        assert.doesNotMatch(String(body.message), /could not be reached/);
        return true;
      },
    );
    // Never dials, never writes: refusing is the safe answer.
    assert.deepEqual(placed, []);
    assert.deepEqual(createdAgentCalls, []);
  });

  it("still answers a retry with a call that was dialed and then failed", async () => {
    // The call exists and ended badly (busy, rejected, dropped): that is the
    // truth about it, and dialing again would be a second paid call.
    for (const status of ["failed", "busy", "no_answer", "voicemail"]) {
      const { service, placed } = build({
        usable: [NUMBERS.miami],
        existingByKey: earlier({ status, providerCallControlId: "cc-9" }),
      });

      const result = await service.startCallForClient(
        CTX as never,
        "agent-1",
        { to: TO },
        { scope: SCOPE, idempotencyKey: "crm-lead-42" },
      );

      assert.deepEqual(result, {
        id: "agent-call-earlier",
        status,
        replayed: true,
      });
      assert.deepEqual(placed, []);
    }
  });

  it("refuses the loser of a race whose winner then failed before placement", async () => {
    const winner = earlier({ status: "failed", providerCallControlId: null });
    const { service, placed } = build({
      usable: [NUMBERS.miami],
      keyLookups: [null, winner, winner],
    });

    await assert.rejects(
      service.startCallForClient(
        CTX as never,
        "agent-1",
        { to: TO },
        { scope: SCOPE, idempotencyKey: "crm-lead-42" },
      ),
      ConflictException,
    );
    assert.deepEqual(placed, []);
  });
});

describe("VoiceAgentCallService final placement guard", () => {
  it("runs the guard after provider preparation and never dials when it refuses", async () => {
    const { service, placed, deliveryEvents, forciblyEnded } = build({
      usable: [NUMBERS.miami],
    });
    await assert.rejects(
      service.startCall(CTX, "agent-1", { to: TO }, async () => {
        assert(deliveryEvents.includes("tools:agent-1"));
        assert(!deliveryEvents.includes("call:placed"));
        throw new BadRequestException("meeting_changed");
      }),
      (error: unknown) =>
        error instanceof VoiceAgentCallStartError &&
        error.outcome === VoiceAgentCallStartOutcome.terminal_rejection,
    );
    assert.equal(placed.length, 0);
    assert.deepEqual(forciblyEnded, ["call-1"]);
  });

  it("never lets a durable caller dial on tools it could not verify", async () => {
    // Unlike a person's own call, a reminder or callback would run on what
    // the assistant last saved: it is not placed, and it may be retried.
    let guarded = false;
    const { service, placed } = build({
      usable: [NUMBERS.miami],
      toolSyncError: new Error("provider unavailable"),
    });
    await assert.rejects(
      service.startCall(CTX, "agent-1", { to: TO }, async () => {
        guarded = true;
      }),
      (error: unknown) =>
        error instanceof VoiceAgentCallStartError &&
        error.outcome === VoiceAgentCallStartOutcome.retryable_before_placement,
    );
    assert.equal(guarded, false);
    assert.equal(placed.length, 0);
  });
});

// ── Stage 4A: the inbound attach is bound to the whole workspace ────────────

describe("VoiceAgentCallService.startInbound workspace binding", () => {
  const config = apiConfiguration as unknown as Record<string, unknown>;
  const OWNER = "owner-1";

  function inbound() {
    const started: string[] = [];
    const service = new VoiceAgentCallService(
      {
        require: async () => ({ id: "agent-1", providerAssistantId: "a-1" }),
        inboundConfig: async () => ({}),
      } as never,
      {} as never,
      {
        findByCallId: async () => null,
        createInboundOnce: async (data: Record<string, unknown>) => ({
          id: "agent-call-1",
          ...data,
        }),
        markInboundStarted: async () => undefined,
      } as never,
      {} as never,
      {
        startInboundCall: async (input: { callControlId: string }) => {
          started.push(input.callControlId);
          return { conversationId: "conversation-1" };
        },
      } as never,
      {} as never,
      {} as never,
      { getBalance: async () => 10 } as never,
      {} as never,
      {} as never,
    );
    return { service, started };
  }

  const call = (over: Record<string, unknown>) =>
    ({
      id: "call-1",
      direction: "inbound",
      callControlId: "cc-inbound",
      endedAt: null,
      fromNumber: "+13055550100",
      toNumber: "+13055550200",
      contactId: null,
      ...over,
    }) as never;

  it("refuses another freelancer's personal call, and the owner's organization call", async () => {
    const previous = config.AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS;
    config.AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS = [OWNER];
    try {
      const { service, started } = inbound();
      const personal = { userId: OWNER, organizationId: null };
      // Both calls have a null organization; only the owner's is theirs.
      await assert.rejects(
        service.startInbound(
          personal,
          "agent-1",
          call({ userId: "stranger-1", organizationId: null }),
        ),
        /This inbound call is unavailable/,
      );
      await assert.rejects(
        service.startInbound(
          personal,
          "agent-1",
          call({ userId: OWNER, organizationId: "org-1" }),
        ),
        /This inbound call is unavailable/,
      );
      assert.deepEqual(started, []);
      await service.startInbound(
        personal,
        "agent-1",
        call({ userId: OWNER, organizationId: null }),
      );
      assert.deepEqual(started, ["cc-inbound"]);
    } finally {
      config.AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS = previous;
    }
  });

  it("keeps an organization's inbound attach working on its own calls", async () => {
    const { service, started } = inbound();
    const org = { userId: "admin-1", organizationId: "org-1" };
    // Who the organization call rang does not matter: it is the organization's.
    await service.startInbound(
      org,
      "agent-1",
      call({ userId: "member-2", organizationId: "org-1" }),
    );
    await assert.rejects(
      service.startInbound(
        org,
        "agent-1",
        call({ id: "call-2", userId: "admin-1", organizationId: "org-2" }),
      ),
      /This inbound call is unavailable/,
    );
    assert.deepEqual(started, ["cc-inbound"]);
  });
});
