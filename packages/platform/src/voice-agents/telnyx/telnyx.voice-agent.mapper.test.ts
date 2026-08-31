import { describe, expect, it } from "vitest";
import type { VoiceAgentConfig } from "../interfaces/voice-agent.provider";
import {
  toAssistantPayload,
  toVoiceAgentAssistant,
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

  it("falls back to the multilingual mode rather than to English", () => {
    for (const language of [undefined, "sv"]) {
      const payload = toAssistantPayload(config({ language }), {
        unauthenticatedWebCalls: false,
      });
      expect(payload.transcription?.language).toBe("multi");
    }
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
    });
  });

  it("reports a not-yet-provisioned calling app as unknown, not as unsupported", () => {
    const assistant = toVoiceAgentAssistant({ id: "assistant-2" });
    expect(assistant.callingAppId).toBeNull();
    expect(assistant.unauthenticatedWebCallsEnabled).toBe(false);
  });
});
