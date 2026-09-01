/// <reference types="node" />

// The platform barrel carries decorated DTOs, and Nest only installs the
// metadata polyfill when an application bootstraps. A plain unit test has no
// bootstrap, so it installs it itself before touching the barrel.
import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
    turns?: Array<{ role: string; text: string; at: Date | null }>;
    transcriptError?: Error;
    alreadyTranscribed?: boolean;
  } = {},
) {
  const updates: Array<Record<string, unknown>> = [];
  const transcripts: Array<Record<string, unknown>> = [];

  const service = new VoiceAgentResultService(
    {
      findByConversationId: async () =>
        over.agentCall === undefined ? AGENT_CALL : over.agentCall,
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
      findById: async () => ({ id: "telephony-1", userId: "user-1" }),
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

  return { service, updates, transcripts };
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
