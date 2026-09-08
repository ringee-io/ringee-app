/// <reference types="node" />

// The platform barrel carries decorated DTOs, and Nest only installs the
// metadata polyfill when an application bootstraps. A plain unit test has no
// bootstrap, so it installs it itself before touching the barrel.
import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CallStatus } from "@ringee/database";
import { voiceAgentInsightsToken } from "@ringee/platform";
import { VoiceAgentResultService } from "./voice-agent-result.service";

const AGENT_ID = "agent-1";
const TOKEN = voiceAgentInsightsToken(AGENT_ID);

const AGENT_CALL = {
  id: "call-1",
  agentId: AGENT_ID,
  userId: "user-1",
  organizationId: "org-1",
  callId: "telephony-1",
  providerConversationId: "conv-1",
  outcome: null,
};

/** The analysis the agent was configured with, mapped to provider ids. */
const ANALYSIS = {
  summary: true,
  outcome: true,
  sentiment: true,
  insightIds: {
    summary: "insight-summary",
    outcome: "insight-outcome",
    extraction: "insight-extraction",
  },
};

function build(
  over: {
    agentCall?: Record<string, unknown> | null;
    /** The row the control id on a provider-read conversation leads to. */
    byControlId?: Record<string, unknown> | null;
    /** What the provider knows about the conversation, when asked directly. */
    conversation?: Record<string, unknown> | null;
    conversationError?: Error;
    call?: Record<string, unknown> | null;
    turns?: Array<{ role: string; text: string; at: Date | null }>;
    transcriptError?: Error;
    alreadyTranscribed?: boolean;
    completedCall?: Record<string, unknown> | null;
    insightOutcome?: string;
  } = {},
) {
  const updates: Array<Record<string, unknown>> = [];
  const transcripts: Array<Record<string, unknown>> = [];
  const attached: Array<Record<string, unknown>> = [];
  const terminalEvents: Array<Record<string, unknown>> = [];
  const outcomeEvents: Array<Record<string, unknown>> = [];
  const callOutcomes: Array<Record<string, unknown>> = [];
  const completions: Array<Record<string, unknown>> = [];
  let currentOutcome =
    over.agentCall && "outcome" in over.agentCall
      ? over.agentCall.outcome
      : AGENT_CALL.outcome;
  let outcomeRevision = 0;

  const service = new VoiceAgentResultService(
    {
      findByConversationId: async () =>
        over.agentCall === undefined ? AGENT_CALL : over.agentCall,
      findByCallControlId: async () => over.byControlId ?? null,
      update: async (_id: string, data: Record<string, unknown>) => {
        updates.push(data);
        return {
          ...AGENT_CALL,
          ...data,
          metadata: { external_id: "customer-42" },
          updatedAt: new Date("2026-09-07T14:05:00.000Z"),
        };
      },
      updateOutcomeIfChanged: async (_id: string, outcome: string) => {
        if (currentOutcome === outcome) return null;
        currentOutcome = outcome;
        updates.push({ outcome });
        const updatedAt = new Date(
          new Date("2026-09-07T14:05:00.000Z").getTime() +
            outcomeRevision * 1_000,
        );
        outcomeRevision += 1;
        return {
          ...AGENT_CALL,
          outcome,
          metadata: { external_id: "customer-42" },
          updatedAt,
        };
      },
    } as never,
    {
      findByIdForOwner: async () => ({ id: AGENT_ID, voiceLanguage: "es" }),
    } as never,
    { readAnalysis: () => ANALYSIS } as never,
    {
      findById: async () =>
        over.call === undefined
          ? {
              id: "telephony-1",
              userId: "user-1",
              callControlId: "cc-1",
              answeredAt: new Date("2026-09-07T14:01:00.000Z"),
            }
          : over.call,
      attachTelephony: async (id: string, data: Record<string, unknown>) => {
        attached.push({ id, ...data });
        return { id };
      },
      updateOutcome: async (id: string, outcome: string) => {
        callOutcomes.push({ id, outcome });
        return { id, outcome };
      },
      completeCall: async (
        callControlId: string,
        startedAt: string | undefined,
        endedAt: string,
        hangupCause: string | undefined,
        terminalStatus: CallStatus,
      ) => {
        completions.push({
          callControlId,
          startedAt,
          endedAt,
          hangupCause,
          terminalStatus,
        });
        return over.completedCall === undefined
          ? {
              id: "telephony-1",
              userId: "user-1",
              organizationId: "org-1",
              status: terminalStatus,
              endedAt: new Date("2026-09-07T14:00:00.000Z"),
            }
          : over.completedCall;
      },
    } as never,
    {
      // The real adapter's parser, in miniature: the domain never sees the
      // provider's own shape.
      parseInsightWebhook: (body: { conversation_id?: string }) =>
        body?.conversation_id
          ? {
              conversationId: body.conversation_id,
              insightGroupId: null,
              insights: [
                { insightId: "insight-summary", result: "Booked a demo." },
                {
                  insightId: "insight-outcome",
                  result: JSON.stringify({
                    outcome: over.insightOutcome ?? "not_interested",
                  }),
                },
              ],
            }
          : null,
      fetchConversation: async () => {
        if (over.conversationError) throw over.conversationError;
        return over.conversation ?? null;
      },
      fetchTranscript: async () => {
        if (over.transcriptError) throw over.transcriptError;
        return (
          over.turns ?? [
            { role: "agent", text: "Hola, soy Sofia.", at: null },
            { role: "customer", text: "Dime.", at: null },
            { role: "tool", text: "{}", at: null },
          ]
        );
      },
    } as never,
    {
      hasTranscript: async () => over.alreadyTranscribed ?? false,
      saveProviderTranscript: async (
        _call: unknown,
        input: Record<string, unknown>,
      ) => {
        transcripts.push(input);
        return null;
      },
    } as never,
    {
      enqueueCallTerminal: async (call: Record<string, unknown>) => {
        terminalEvents.push(call);
      },
      enqueue: async (event: Record<string, unknown>) => {
        outcomeEvents.push(event);
      },
    } as never,
  );

  return {
    service,
    updates,
    transcripts,
    attached,
    terminalEvents,
    outcomeEvents,
    callOutcomes,
    completions,
  };
}

describe("VoiceAgentResultService analysis callback", () => {
  it("writes the analysis onto the call it belongs to", async () => {
    const { service, updates, outcomeEvents, callOutcomes } = build();

    const accepted = await service.applyInsightCallback(AGENT_ID, TOKEN, {
      conversation_id: "conv-1",
    });

    assert.equal(accepted, true);
    assert.deepEqual(updates, [
      { summary: "Booked a demo." },
      { outcome: "not_interested" },
    ]);
    assert.deepEqual(callOutcomes, [
      { id: "telephony-1", outcome: "not_interested" },
    ]);
    assert.deepEqual(outcomeEvents, [
      {
        ctx: { userId: "user-1", organizationId: "org-1" },
        eventEnum: "call_outcome_updated",
        subjectId: "telephony-1",
        dedupeKey:
          "telephony-1:outcome:not_interested:2026-09-07T14:05:00.000Z",
        data: {
          callId: "telephony-1",
          agentCallId: "call-1",
          agentId: "agent-1",
          outcome: "not_interested",
          externalId: "customer-42",
          metadata: { external_id: "customer-42" },
          updatedAt: "2026-09-07T14:05:00.000Z",
        },
        occurredAt: new Date("2026-09-07T14:05:00.000Z"),
      },
    ]);
  });

  it("does not publish an unchanged outcome when the callback is replayed", async () => {
    const { service, updates, outcomeEvents } = build({
      insightOutcome: "no_conversation",
    });

    await service.applyInsightCallback(AGENT_ID, TOKEN, {
      conversation_id: "conv-1",
    });
    await service.applyInsightCallback(AGENT_ID, TOKEN, {
      conversation_id: "conv-1",
    });

    assert.deepEqual(updates, [
      { summary: "Booked a demo." },
      { outcome: "no_conversation" },
      { summary: "Booked a demo." },
    ]);
    assert.equal(outcomeEvents.length, 1);
  });

  it("publishes each genuine outcome transition with a distinct revision key", async () => {
    const state = { insightOutcome: "no_conversation" };
    const { service, outcomeEvents } = build(state);

    await service.applyInsightCallback(AGENT_ID, TOKEN, {
      conversation_id: "conv-1",
    });
    state.insightOutcome = "not_interested";
    await service.applyInsightCallback(AGENT_ID, TOKEN, {
      conversation_id: "conv-1",
    });

    assert.deepEqual(
      outcomeEvents.map((event) => ({
        outcome: (event.data as Record<string, unknown>).outcome,
        dedupeKey: event.dedupeKey,
      })),
      [
        {
          outcome: "no_conversation",
          dedupeKey:
            "telephony-1:outcome:no_conversation:2026-09-07T14:05:00.000Z",
        },
        {
          outcome: "not_interested",
          dedupeKey:
            "telephony-1:outcome:not_interested:2026-09-07T14:05:01.000Z",
        },
      ],
    );
  });

  it("still refreshes other analysis fields when the outcome is unchanged", async () => {
    const { service, updates, outcomeEvents } = build({
      agentCall: {
        ...AGENT_CALL,
        outcome: "callback_scheduled",
      },
      insightOutcome: "callback_scheduled",
    });

    await service.applyInsightCallback(AGENT_ID, TOKEN, {
      conversation_id: "conv-1",
    });

    assert.deepEqual(updates, [{ summary: "Booked a demo." }]);
    assert.deepEqual(outcomeEvents, []);
  });

  it("does not turn a carrier no-answer into no_conversation", async () => {
    const { service, updates, outcomeEvents } = build({
      agentCall: { ...AGENT_CALL, outcome: "no_answer" },
      insightOutcome: "no_conversation",
    });

    await service.applyInsightCallback(AGENT_ID, TOKEN, {
      conversation_id: "conv-1",
    });

    assert.deepEqual(updates, [{ summary: "Booked a demo." }]);
    assert.deepEqual(outcomeEvents, []);
  });

  it("uses no_answer when analysis says no_conversation but no one answered", async () => {
    const { service, updates, outcomeEvents } = build({
      insightOutcome: "no_conversation",
      call: {
        id: "telephony-1",
        userId: "user-1",
        callControlId: "cc-1",
        answeredAt: null,
      },
    });

    await service.applyInsightCallback(AGENT_ID, TOKEN, {
      conversation_id: "conv-1",
    });

    assert.deepEqual(updates, [
      { summary: "Booked a demo." },
      { outcome: "no_answer" },
    ]);
    assert.equal(
      (outcomeEvents[0]!.data as Record<string, unknown>).outcome,
      "no_answer",
    );
  });

  it("publishes canonical tool-confirmed meeting and callback outcomes", async () => {
    const { service, outcomeEvents } = build();

    await service.applyKnownOutcome(
      AGENT_CALL as never,
      "meeting_booked" as never,
    );
    await service.applyKnownOutcome(
      AGENT_CALL as never,
      "callback_scheduled" as never,
    );

    assert.deepEqual(
      outcomeEvents.map((event) => ({
        outcome: (event.data as Record<string, unknown>).outcome,
        externalId: (event.data as Record<string, unknown>).externalId,
        dedupeKey: event.dedupeKey,
      })),
      [
        {
          outcome: "meeting_booked",
          externalId: "customer-42",
          dedupeKey:
            "telephony-1:outcome:meeting_booked:2026-09-07T14:05:00.000Z",
        },
        {
          outcome: "callback_scheduled",
          externalId: "customer-42",
          dedupeKey:
            "telephony-1:outcome:callback_scheduled:2026-09-07T14:05:01.000Z",
        },
      ],
    );
  });

  it("normalizes historical outcome names when returning a call result", () => {
    const { service } = build();

    assert.equal(
      service.toResult({
        ...AGENT_CALL,
        status: "completed",
        outcome: "appointment_booked",
        summary: null,
        sentiment: null,
        extractedData: {},
        metadata: {},
      } as never).outcome,
      "meeting_booked",
    );
  });

  it("keeps agent-specific reminder states out of CallOutcome events", async () => {
    const { service, updates, outcomeEvents, callOutcomes } = build({
      insightOutcome: "confirmed",
    });

    await service.applyInsightCallback(AGENT_ID, TOKEN, {
      conversation_id: "conv-1",
    });

    assert.deepEqual(updates, [
      { summary: "Booked a demo." },
      { outcome: "confirmed" },
    ]);
    assert.deepEqual(callOutcomes, []);
    assert.deepEqual(outcomeEvents, []);
  });

  it("does not manufacture tool-backed outcomes from transcript analysis", async () => {
    for (const insightOutcome of [
      "meeting_booked",
      "callback_scheduled",
      "appointment_booked",
      "callback_requested",
    ]) {
      const { service, updates, outcomeEvents } = build({ insightOutcome });

      await service.applyInsightCallback(AGENT_ID, TOKEN, {
        conversation_id: "conv-1",
      });

      assert.deepEqual(updates, [{ summary: "Booked a demo." }]);
      assert.deepEqual(outcomeEvents, []);
    }
  });

  it("writes nothing when the token does not verify", async () => {
    // The route is public — the token is the only thing standing between a
    // stranger and a summary written onto someone else's call.
    const { service, updates } = build();

    const accepted = await service.applyInsightCallback(
      AGENT_ID,
      voiceAgentInsightsToken("another-agent"),
      { conversation_id: "conv-1" },
    );

    assert.equal(accepted, false);
    assert.deepEqual(updates, []);
  });

  it("refuses a conversation that belongs to a different agent", async () => {
    // A valid token proves which agent asked for the analysis. It does not make
    // another agent's call this agent's to write to.
    const { service, updates } = build({
      agentCall: { ...AGENT_CALL, agentId: "agent-2" },
    });

    const accepted = await service.applyInsightCallback(AGENT_ID, TOKEN, {
      conversation_id: "conv-1",
    });

    assert.equal(accepted, true);
    assert.deepEqual(updates, []);
  });

  it("accepts a delivery for a conversation Ringee did not start", async () => {
    // Another integration on the same provider account. Not an error, and not
    // ours to record.
    const { service, updates } = build({ agentCall: null });

    assert.equal(
      await service.applyInsightCallback(AGENT_ID, TOKEN, {
        conversation_id: "conv-9",
      }),
      true,
    );
    assert.deepEqual(updates, []);
  });

  it("propagates a transient conversation lookup failure for retry", async () => {
    const { service, updates } = build({
      agentCall: null,
      conversationError: new Error("provider unavailable"),
    });

    await assert.rejects(
      service.applyInsightCallback(AGENT_ID, TOKEN, {
        conversation_id: "conv-1",
      }),
      /provider unavailable/,
    );
    assert.deepEqual(updates, []);
  });

  it("finds the call when nothing ever bound the conversation to it", async () => {
    // `providerConversationId` is written by the conversation webhook — the
    // one delivery an agent call cannot count on. Dropping the analysis
    // because of that loses it for good: there is no endpoint to read a
    // finished conversation's results back (AGENT-009). So the conversation
    // is read from the provider, which knows the call it ran on.
    const { service, updates, attached } = build({
      agentCall: null,
      byControlId: { ...AGENT_CALL, providerConversationId: null },
      conversation: {
        conversationId: "conv-1",
        assistantId: "assistant-1",
        callControlId: "cc-1",
        callSessionId: "cs-1",
        callLegId: "leg-1",
      },
      call: {
        id: "telephony-1",
        userId: "user-1",
        callControlId: "cc-1",
        callSessionId: null,
      },
    });

    const accepted = await service.applyInsightCallback(AGENT_ID, TOKEN, {
      conversation_id: "conv-1",
    });

    assert.equal(accepted, true);
    // The conversation is written down on the way past, so the next read of
    // this call finds it without asking the provider again...
    assert.deepEqual(updates[0], { providerConversationId: "conv-1" });
    // ...and so is the session the recording is filed under.
    assert.equal(attached.length, 1);
    assert.equal(attached[0]!.callSessionId, "cs-1");
    // And the analysis lands on the call, which is the point of all of it.
    assert.deepEqual(updates[1], { summary: "Booked a demo." });
    assert.deepEqual(updates[2], { outcome: "not_interested" });
  });
});

describe("VoiceAgentResultService call status", () => {
  it("answers a non-terminal call when the provider reports it connected", async () => {
    const { service, attached } = build({
      call: {
        id: "telephony-1",
        callControlId: "cc-1",
        callSessionId: null,
        status: CallStatus.ringing,
      },
    });

    await service.applyStatus(AGENT_CALL as never, {
      providerStatus: "in-progress",
      callControlId: "cc-1",
      callSessionId: "session-1",
    });

    assert.equal(attached[0]!.status, CallStatus.answered);
    assert.ok(attached[0]!.answeredAt instanceof Date);
  });

  it("does not reopen terminal calls on a late connected callback", async () => {
    for (const status of [CallStatus.completed, CallStatus.failed]) {
      const { service, attached } = build({
        call: {
          id: "telephony-1",
          callControlId: "cc-1",
          callSessionId: null,
          status,
        },
      });

      await service.applyStatus(AGENT_CALL as never, {
        providerStatus: "in-progress",
        callControlId: "cc-1",
        callSessionId: "session-late",
      });

      assert.equal(attached[0]!.callSessionId, "session-late");
      assert.equal(attached[0]!.status, undefined);
      assert.equal(attached[0]!.answeredAt, undefined);
    }
  });

  it("publishes a terminal agent call to Custom Integrations", async () => {
    const { service, terminalEvents, completions } = build();

    await service.applyStatus(AGENT_CALL as never, {
      providerStatus: "completed",
      callControlId: "cc-1",
      endedAt: "2026-09-07T14:00:00.000Z",
    });

    assert.equal(terminalEvents.length, 1);
    assert.equal(terminalEvents[0]!.id, "telephony-1");
    assert.equal(terminalEvents[0]!.status, CallStatus.completed);
    assert.equal(completions[0]!.terminalStatus, CallStatus.completed);
  });

  it("retains a provider failure before publishing to Custom Integrations", async () => {
    const { service, terminalEvents, completions } = build();

    await service.applyStatus(AGENT_CALL as never, {
      providerStatus: "failed",
      callControlId: "cc-1",
      hangupCause: "normal_temporary_failure",
    });

    assert.equal(completions[0]!.terminalStatus, CallStatus.failed);
    assert.equal(terminalEvents.length, 1);
    assert.equal(terminalEvents[0]!.status, CallStatus.failed);
  });

  it("publishes no_answer when nobody answers or the call reaches voicemail", async () => {
    for (const providerStatus of ["no-answer", "voicemail"]) {
      const { service, outcomeEvents, callOutcomes } = build();

      await service.applyStatus(AGENT_CALL as never, {
        providerStatus,
        callControlId: "cc-1",
      });

      assert.equal(outcomeEvents.length, 1);
      assert.equal(
        (outcomeEvents[0]!.data as Record<string, unknown>).outcome,
        "no_answer",
      );
      assert.deepEqual(callOutcomes, [
        { id: "telephony-1", outcome: "no_answer" },
      ]);
    }
  });

  it("does not publish when the terminal callback cannot resolve its Call row", async () => {
    const { service, terminalEvents } = build({ completedCall: null });

    await service.applyStatus(AGENT_CALL as never, {
      providerStatus: "completed",
      callControlId: "cc-missing",
    });

    assert.deepEqual(terminalEvents, []);
  });
});

describe("VoiceAgentResultService transcript recovery", () => {
  it("stores the spoken turns, attributed to each side of the call", async () => {
    const { service, transcripts } = build();

    await service.recoverTranscript(AGENT_CALL as never);

    assert.deepEqual(transcripts, [
      {
        provider: "telnyx",
        language: "es",
        turns: [
          { side: "outbound", text: "Hola, soy Sofia." },
          { side: "inbound", text: "Dime." },
        ],
      },
    ]);
  });

  it("does nothing for a call with no conversation yet", async () => {
    const { service, transcripts } = build();

    await service.recoverTranscript({
      ...AGENT_CALL,
      providerConversationId: null,
    } as never);

    assert.deepEqual(transcripts, []);
  });

  it("does not ask the provider for a transcript the call already has", async () => {
    // The sweep revisits a call every few minutes until all its artifacts are
    // in. Without this each visit is a round-trip for text already stored.
    const { service, transcripts } = build({
      alreadyTranscribed: true,
      transcriptError: new Error("the provider must not be asked"),
    });

    await service.recoverTranscript(AGENT_CALL as never);

    assert.deepEqual(transcripts, []);
  });

  it("swallows a provider failure — a transcript never holds up a settlement", async () => {
    const { service, transcripts } = build({
      transcriptError: new Error("upstream is down"),
    });

    await service.recoverTranscript(AGENT_CALL as never);

    assert.deepEqual(transcripts, []);
  });
});
