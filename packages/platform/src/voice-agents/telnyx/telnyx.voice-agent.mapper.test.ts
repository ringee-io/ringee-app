import { describe, expect, it } from "vitest";
import type { VoiceAgentConfig } from "../interfaces/voice-agent.provider";
import {
  toAssistantPayload,
  toCallingAppPatch,
  toInsightDelivery,
  toInsightGroupPayload,
  toTranscriptTurns,
  toVoiceAgentAssistant,
  type TelnyxTexmlApplication,
} from "./telnyx.voice-agent.mapper";

const config = (over: Partial<VoiceAgentConfig> = {}): VoiceAgentConfig => ({
  name: "Sofia",
  instructions: "Book a meeting.",
  greeting: "Hi, this is Sofia.",
  modelId: "moonshotai/Kimi-K2.6",
  tools: [],
  ...over,
});

describe("toAssistantPayload", () => {
  it("sends only telephony features and the configured model", () => {
    const payload = toAssistantPayload(config(), {
      unauthenticatedWebCalls: false,
    });
    expect(payload.model).toBe("moonshotai/Kimi-K2.6");
    expect(payload.enabled_features).toEqual(["telephony"]);
    expect(payload.telephony_settings.supports_unauthenticated_web_calls).toBe(
      false,
    );
  });

  it("omits the key reference entirely when the model needs no credential", () => {
    const payload = toAssistantPayload(config(), {
      unauthenticatedWebCalls: false,
    });
    expect("llm_api_key_ref" in payload).toBe(false);
  });

  it("references a bring-your-own key by its stored reference", () => {
    const payload = toAssistantPayload(
      config({ llmApiKeyRef: "agent-7-key" }),
      {
        unauthenticatedWebCalls: false,
      },
    );
    expect(payload.llm_api_key_ref).toBe("agent-7-key");
  });

  it("passes a tool secret by reference so it is never sent in plaintext", () => {
    const payload = toAssistantPayload(
      config({
        tools: [
          {
            kind: "webhook",
            name: "book_appointment",
            description: "Books the appointment.",
            url: "https://api.ringee.io/api/ai-voice-agents/tools/1/book",
            method: "POST",
            headers: [{ name: "X-Ringee-Tool-Secret", secretRef: "agent-1" }],
            parameters: {
              type: "object",
              properties: { start: { type: "string" } },
              required: ["start"],
            },
          },
        ],
      }),
      { unauthenticatedWebCalls: false },
    );

    const [tool] = payload.tools as Array<{
      type: string;
      webhook: {
        headers: Array<{ name: string; value: string }>;
        body_parameters: unknown;
      };
    }>;
    expect(tool?.type).toBe("webhook");
    expect(tool?.webhook.headers[0]).toEqual({
      name: "X-Ringee-Tool-Secret",
      value: "{{#integration_secret}}agent-1{{/integration_secret}}",
    });
    expect(tool?.webhook.body_parameters).toEqual({
      type: "object",
      properties: { start: { type: "string" } },
      required: ["start"],
    });
  });

  it("maps the hangup and retrieval tools onto their provider shapes", () => {
    const payload = toAssistantPayload(
      config({
        tools: [
          { kind: "hangup", description: "End the call." },
          { kind: "retrieval", bucketIds: ["agent-1-knowledge"] },
        ],
      }),
      { unauthenticatedWebCalls: false },
    );
    expect(payload.tools).toEqual([
      { type: "hangup", hangup: { description: "End the call." } },
      { type: "retrieval", retrieval: { bucket_ids: ["agent-1-knowledge"] } },
    ]);
  });

  it("transcribes in the language the agent speaks, not the provider default", () => {
    const payload = toAssistantPayload(config({ language: "es" }), {
      unauthenticatedWebCalls: false,
    });
    expect(payload.transcription).toEqual({
      model: "deepgram/flux",
      language: "es",
    });
  });

  it("reads a locale as its base language", () => {
    const payload = toAssistantPayload(config({ language: "pt-BR" }), {
      unauthenticatedWebCalls: false,
    });
    expect(payload.transcription?.language).toBe("pt");
  });

  it("uses multilingual detection when the agent has no language yet", () => {
    const payload = toAssistantPayload(config({ language: undefined }), {
      unauthenticatedWebCalls: false,
    });
    expect(payload.transcription).toEqual({
      model: "deepgram/flux",
      language: "multi",
    });
  });

  it("uses Telnyx's broader multilingual model outside Flux languages", () => {
    const payload = toAssistantPayload(config({ language: "sv-SE" }), {
      unauthenticatedWebCalls: false,
    });
    expect(payload.transcription).toEqual({
      model: "deepgram/nova-3",
      language: "sv",
    });
  });

  it("maps each product greeting mode to Telnyx's string convention", () => {
    expect(
      toAssistantPayload(config({ greetingMode: "assistant_speaks_first" }), {
        unauthenticatedWebCalls: false,
      }).greeting,
    ).toBe("Hi, this is Sofia.");
    expect(
      toAssistantPayload(
        config({ greetingMode: "assistant_generates_greeting" }),
        { unauthenticatedWebCalls: false },
      ).greeting,
    ).toBe("<assistant-speaks-first-with-model-generated-message>");
    expect(
      toAssistantPayload(config({ greetingMode: "assistant_waits_for_user" }), {
        unauthenticatedWebCalls: false,
      }).greeting,
    ).toBe("");
  });

  it("enables Telnyx's post-conversation turn when requested", () => {
    const enabled = toAssistantPayload(
      config({ postConversationEnabled: true }),
      { unauthenticatedWebCalls: false },
    );
    expect(enabled.post_conversation_settings).toEqual({ enabled: true });

    const disabled = toAssistantPayload(
      config({ postConversationEnabled: false }),
      { unauthenticatedWebCalls: false },
    );
    expect(disabled.post_conversation_settings).toEqual({ enabled: false });

    const omitted = toAssistantPayload(config(), {
      unauthenticatedWebCalls: false,
    });
    expect(omitted.post_conversation_settings).toBeUndefined();
  });

  it("caps call length and enables recording when asked", () => {
    const payload = toAssistantPayload(
      config({ maxCallSeconds: 900, recordCalls: true }),
      { unauthenticatedWebCalls: true },
    );
    expect(payload.telephony_settings.time_limit_secs).toBe(900);
    expect(payload.telephony_settings.recording_settings).toEqual({
      enabled: true,
      channels: "dual",
      format: "mp3",
    });
    expect(payload.telephony_settings.supports_unauthenticated_web_calls).toBe(
      true,
    );
  });
});

describe("toVoiceAgentAssistant", () => {
  it("reads the provider's calling app and web-call flag", () => {
    expect(
      toVoiceAgentAssistant({
        id: "assistant-1",
        telephony_settings: {
          default_texml_app_id: "3035069911979263363",
          supports_unauthenticated_web_calls: true,
        },
      }),
    ).toEqual({
      assistantId: "assistant-1",
      callingAppId: "3035069911979263363",
      unauthenticatedWebCallsEnabled: true,
      toolWebhookUrls: [],
    });
  });

  it("reports a not-yet-provisioned calling app as unknown, not as unsupported", () => {
    const assistant = toVoiceAgentAssistant({ id: "assistant-2" });
    expect(assistant.callingAppId).toBeNull();
    expect(assistant.unauthenticatedWebCallsEnabled).toBe(false);
  });

  // Where the assistant currently calls Ringee back. The dial path compares
  // these against the configured base so an agent whose tools were written
  // against an old address is re-synced before it dials, instead of holding a
  // whole conversation and then failing to book.
  it("reports the webhook tools' urls and ignores the other tool kinds", () => {
    const assistant = toVoiceAgentAssistant({
      id: "assistant-3",
      tools: [
        {
          type: "webhook",
          webhook: { url: "https://api.ringee.io/api/x/available-slots" },
        },
        { type: "hangup" },
        { type: "retrieval" },
        { type: "webhook", webhook: { url: null } },
      ],
    });
    expect(assistant.toolWebhookUrls).toEqual([
      "https://api.ringee.io/api/x/available-slots",
    ]);
  });
});

describe("toCallingAppPatch", () => {
  const settings = {
    eventWebhookUrl: "https://api.ringee.io/api/call/webhook",
    callCostEvents: true,
    outboundProfileId: "2806422605668",
  };

  /** What Telnyx provisions for a new assistant, before Ringee touches it. */
  const provisioned = (
    over: Partial<TelnyxTexmlApplication> = {},
  ): TelnyxTexmlApplication => ({
    id: "3039016314468304279",
    friendly_name: "ai-assistant-5ba661d4",
    voice_url:
      "https://api.telnyx.com/v2/ai/assistants/assistant-5ba661d4/texml",
    status_callback: null,
    status_callback_method: "post",
    call_cost_in_webhooks: false,
    outbound: { channel_limit: null, outbound_voice_profile_id: null },
    ...over,
  });

  it("asks for cost events, the event webhook and the outbound profile", () => {
    const patch = toCallingAppPatch(provisioned(), settings);

    expect(patch).toEqual({
      friendly_name: "ai-assistant-5ba661d4",
      voice_url:
        "https://api.telnyx.com/v2/ai/assistants/assistant-5ba661d4/texml",
      call_cost_in_webhooks: true,
      status_callback: "https://api.ringee.io/api/call/webhook",
      status_callback_method: "post",
      outbound: { outbound_voice_profile_id: "2806422605668" },
    });
  });

  it("writes nothing when the application already matches", () => {
    const current = provisioned({
      call_cost_in_webhooks: true,
      status_callback: settings.eventWebhookUrl,
      outbound: { outbound_voice_profile_id: "2806422605668" },
    });

    expect(toCallingAppPatch(current, settings)).toBeNull();
  });

  it("still fixes the webhook when only the outbound profile is in place", () => {
    const current = provisioned({
      outbound: { outbound_voice_profile_id: "2806422605668" },
    });

    const patch = toCallingAppPatch(current, settings);
    expect(patch?.call_cost_in_webhooks).toBe(true);
    expect(patch?.status_callback).toBe(settings.eventWebhookUrl);
  });

  it("keeps a channel limit that was set on the application", () => {
    const current = provisioned({
      outbound: { channel_limit: 4, outbound_voice_profile_id: null },
    });

    expect(toCallingAppPatch(current, settings)?.outbound).toEqual({
      channel_limit: 4,
      outbound_voice_profile_id: "2806422605668",
    });
  });

  it("leaves the outbound route alone when none is configured", () => {
    const patch = toCallingAppPatch(provisioned(), {
      ...settings,
      outboundProfileId: null,
    });

    expect(patch?.outbound).toBeUndefined();
    expect(patch?.call_cost_in_webhooks).toBe(true);
  });

  it("refuses to update an application Telnyx has not finished writing", () => {
    // `friendly_name` and `voice_url` are required on the update, and inventing
    // either would rewrite the document the assistant answers its calls with.
    expect(
      toCallingAppPatch(provisioned({ voice_url: null }), settings),
    ).toBeNull();
  });
});

describe("toInsightGroupPayload", () => {
  it("always names where the results are to be delivered", () => {
    // A group without this analyses every call and tells nobody: there is no
    // endpoint to read a finished conversation's results back.
    expect(
      toInsightGroupPayload({
        name: "Ringee agent 7",
        webhookUrl:
          "https://api.ringee.io/api/ai-voice-agents/webhooks/insights/7/tok",
      }),
    ).toEqual({
      name: "Ringee agent 7",
      webhook:
        "https://api.ringee.io/api/ai-voice-agents/webhooks/insights/7/tok",
    });
  });
});

describe("toInsightDelivery", () => {
  it("reads the flat body an insight group posts", () => {
    const delivery = toInsightDelivery({
      conversation_id: "conv-1",
      insight_group_id: "group-1",
      insights: [
        { insight_id: "insight-1", result: "Booked a demo." },
        { insight_id: "insight-2", result: { team_size: 12 } },
      ],
    });

    expect(delivery).toEqual({
      conversationId: "conv-1",
      insightGroupId: "group-1",
      insights: [
        { insightId: "insight-1", result: "Booked a demo." },
        { insightId: "insight-2", result: '{"team_size":12}' },
      ],
    });
  });

  it("reads the same analysis out of the call-event envelope", () => {
    // Telnyx publishes this fact twice, in two shapes. Both are the same
    // results and both are idempotent to apply, so the adapter takes either
    // rather than making the domain pick.
    const delivery = toInsightDelivery({
      data: {
        event_type: "call.conversation_insights.generated",
        payload: {
          conversation_id: "conv-2",
          insight_group_id: "group-1",
          results: [{ insight_id: "insight-1", result: "Not interested." }],
        },
      },
    });

    expect(delivery?.conversationId).toBe("conv-2");
    expect(delivery?.insights).toEqual([
      { insightId: "insight-1", result: "Not interested." },
    ]);
  });

  it("drops a result with no insight id, and a body with no conversation", () => {
    // Without an id there is no way back to the field that asked for it, and
    // without a conversation there is no call to write it onto.
    expect(
      toInsightDelivery({
        conversation_id: "conv-3",
        insights: [{ result: "orphan" }],
      })?.insights,
    ).toEqual([]);
    expect(toInsightDelivery({ insights: [] })).toBeNull();
    expect(toInsightDelivery("not a webhook")).toBeNull();
  });
});

describe("toTranscriptTurns", () => {
  it("maps provider roles onto the two sides of the call", () => {
    expect(
      toTranscriptTurns([
        {
          role: "assistant",
          text: "Hi, this is Sofia.",
          created_at: "2026-09-01T10:00:00Z",
        },
        { role: "user", text: "Hello?" },
        { role: "tool", text: "{}" },
      ]),
    ).toEqual([
      {
        role: "agent",
        text: "Hi, this is Sofia.",
        at: new Date("2026-09-01T10:00:00Z"),
      },
      { role: "customer", text: "Hello?", at: null },
      { role: "tool", text: "{}", at: null },
    ]);
  });

  it("drops the prompt and anything with nothing said in it", () => {
    // `system` is the agent's instructions — configuration, not a turn — and an
    // empty line is noise in a transcript rather than a silence worth keeping.
    expect(
      toTranscriptTurns([
        { role: "system", text: "You are Sofia." },
        { role: "assistant", text: "   " },
        { role: "assistant", text: null },
      ]),
    ).toEqual([]);
  });
});
