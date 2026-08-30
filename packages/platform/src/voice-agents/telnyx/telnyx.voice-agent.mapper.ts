import type {
  VoiceAgentAssistant,
  VoiceAgentConfig,
  VoiceAgentTool,
  VoiceAgentToolHeader,
} from "../interfaces/voice-agent.provider";

/**
 * Where Telnyx's assistant vocabulary stops.
 *
 * Everything above this file speaks `VoiceAgentConfig`; everything below speaks
 * Telnyx. Keeping the translation in one pure module is what makes it testable
 * without a network round-trip — the mapper spec is the contract.
 */

/** A Telnyx assistant, as much of it as Ringee reads. */
export interface TelnyxAssistantResponse {
  id: string;
  name?: string;
  telephony_settings?: {
    default_texml_app_id?: string | null;
    supports_unauthenticated_web_calls?: boolean | null;
  } | null;
}

export interface TelnyxAssistantPayload {
  name: string;
  instructions: string;
  greeting: string;
  model: string;
  llm_api_key_ref?: string;
  enabled_features: string[];
  tools: Record<string, unknown>[];
  dynamic_variables?: Record<string, string>;
  voice_settings?: { voice: string };
  insight_settings?: { insight_group_id: string };
  telephony_settings: {
    supports_unauthenticated_web_calls: boolean;
    time_limit_secs?: number;
    recording_settings?: {
      enabled: boolean;
      channels: "dual";
      format: "mp3";
    };
  };
}

/**
 * Telnyx reads a secret out of a header value with mustache templating, so a
 * tool can authenticate itself without the credential ever being stored on the
 * assistant in plaintext.
 */
function mapHeader(header: VoiceAgentToolHeader): {
  name: string;
  value: string;
} {
  const value = header.secretRef
    ? `{{#integration_secret}}${header.secretRef}{{/integration_secret}}`
    : (header.value ?? "");
  return { name: header.name, value };
}

function mapTool(tool: VoiceAgentTool): Record<string, unknown> {
  switch (tool.kind) {
    case "hangup":
      return { type: "hangup", hangup: { description: tool.description } };
    case "retrieval":
      return { type: "retrieval", retrieval: { bucket_ids: tool.bucketIds } };
    case "webhook":
      return {
        type: "webhook",
        webhook: {
          name: tool.name,
          description: tool.description,
          url: tool.url,
          method: tool.method,
          headers: (tool.headers ?? []).map(mapHeader),
          ...(tool.parameters ? { body_parameters: tool.parameters } : {}),
        },
      };
  }
}

/**
 * Builds the assistant body for a create or an update.
 *
 * `unauthenticatedWebCalls` is passed in rather than read off the config
 * because it is session state, not agent configuration: Ringee opens the agent
 * to anonymous browser calls only while a test session is running.
 */
export function toAssistantPayload(
  config: VoiceAgentConfig,
  options: { unauthenticatedWebCalls: boolean },
): TelnyxAssistantPayload {
  return {
    name: config.name,
    instructions: config.instructions,
    greeting: config.greeting,
    model: config.modelId,
    ...(config.llmApiKeyRef ? { llm_api_key_ref: config.llmApiKeyRef } : {}),
    enabled_features: ["telephony"],
    tools: config.tools.map(mapTool),
    ...(config.dynamicVariables
      ? { dynamic_variables: config.dynamicVariables }
      : {}),
    ...(config.voiceId ? { voice_settings: { voice: config.voiceId } } : {}),
    ...(config.insightGroupId
      ? { insight_settings: { insight_group_id: config.insightGroupId } }
      : {}),
    telephony_settings: {
      supports_unauthenticated_web_calls: options.unauthenticatedWebCalls,
      ...(config.maxCallSeconds
        ? { time_limit_secs: config.maxCallSeconds }
        : {}),
      ...(config.recordCalls === undefined
        ? {}
        : {
            recording_settings: {
              enabled: config.recordCalls,
              channels: "dual" as const,
              format: "mp3" as const,
            },
          }),
    },
  };
}

export function toVoiceAgentAssistant(
  raw: TelnyxAssistantResponse,
): VoiceAgentAssistant {
  return {
    assistantId: raw.id,
    // Telnyx provisions a TeXML application per assistant and reports it here.
    // Null means it is not ready yet, not that calling is unsupported.
    callingAppId: raw.telephony_settings?.default_texml_app_id ?? null,
    unauthenticatedWebCallsEnabled:
      raw.telephony_settings?.supports_unauthenticated_web_calls ?? false,
  };
}
