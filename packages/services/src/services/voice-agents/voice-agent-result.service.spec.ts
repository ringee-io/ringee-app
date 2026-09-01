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
  } = {},
) {
  const updates: Array<Record<string, unknown>> = [];
  const transcripts: Array<Record<string, unknown>> = [];
  const attached: Array<Record<string, unknown>> = [];

  const service = new VoiceAgentResultService(
    {
      findByConversationId: async () =>
        over.agentCall === undefined ? AGENT_CALL : over.agentCall,
      findByCallControlId: async () => over.byControlId ?? null,
      update: async (_id: string, data: Record<string, unknown>) => {
        updates.push(data);
        return AGENT_CALL;
      },
    } as never,
    {
      findByIdForOwner: async () => ({ id: AGENT_ID, voiceLanguage: "es" }),
    } as never,
    { readAnalysis: () => ANALYSIS } as never,
    {
      findById: async () =>
        over.call === undefined
          ? { id: "telephony-1", userId: "user-1", callControlId: "cc-1" }
          : over.call,
      attachTelephony: async (id: string, data: Record<string, unknown>) => {
        attached.push({ id, ...data });
        return { id };
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
                  result: '{"outcome":"appointment_booked"}',
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
  );

  return { service, updates, transcripts, attached };
}

describe("VoiceAgentResultService analysis callback", () => {
  it("writes the analysis onto the call it belongs to", async () => {
    const { service, updates } = build();

    const accepted = await service.applyInsightCallback(AGENT_ID, TOKEN, {
      conversation_id: "conv-1",
    });

    assert.equal(accepted, true);
    assert.deepEqual(updates, [
      { summary: "Booked a demo.", outcome: "appointment_booked" },
    ]);
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
    assert.deepEqual(updates[1], {
      summary: "Booked a demo.",
      outcome: "appointment_booked",
    });
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
