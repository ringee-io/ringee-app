import type {
  VoiceAgentAssistant,
  VoiceAgentCallingAppSettings,
  VoiceAgentConfig,
  VoiceAgentInsightDelivery,
  VoiceAgentInsightGroupSettings,
  VoiceAgentInsightResult,
  VoiceAgentTool,
  VoiceAgentToolHeader,
  VoiceAgentTranscriptTurn,
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
  tools?: Array<{
    type?: string | null;
    webhook?: { url?: string | null } | null;
  }> | null;
  telephony_settings?: {
    default_texml_app_id?: string | null;
    supports_unauthenticated_web_calls?: boolean | null;
    // Read back so a change to the web-call flag alone can be re-sent with the
    // rest of the block intact — Telnyx replaces `telephony_settings` whole.
    time_limit_secs?: number | null;
    recording_settings?: {
      enabled?: boolean;
      channels?: string;
      format?: string;
    } | null;
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
  transcription?: { model: string; language: string };
  insight_settings?: { insight_group_id: string };
  post_conversation_settings?: { enabled: boolean };
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
 * Deepgram Flux is what Telnyx already puts on a new assistant, and it is the
 * model built for turn-taking in a live conversation — so Ringee pins the one
 * it gets anyway rather than trading turn detection for something else.
 *
 * What is *not* safe to leave alone is the language beside it: Telnyx defaults
 * that to `en`, so a Spanish agent greets its caller in Spanish and is then
 * transcribed as if the reply were English. Nothing usable comes back, the
 * agent never receives a turn, and the call reads as an agent that cannot hear.
 */
const TRANSCRIPTION_MODEL = "deepgram/flux";
const BROAD_LANGUAGE_TRANSCRIPTION_MODEL = "deepgram/nova-3";

/** The languages Deepgram Flux transcribes on Telnyx. */
const TRANSCRIBED_LANGUAGES = new Set([
  "en",
  "es",
  "fr",
  "de",
  "hi",
  "ru",
  "pt",
  "ja",
  "it",
  "nl",
]);

/**
 * Flux is preferred for its conversational turn-taking in its ten supported
 * languages. A known language outside that set uses Telnyx's recommended
 * multilingual model instead of pretending Flux can transcribe it.
 */
function toTranscription(language: string | undefined): {
  model: string;
  language: string;
} {
  const base = (language ?? "").split("-")[0]!.toLowerCase();
  if (base && !TRANSCRIBED_LANGUAGES.has(base)) {
    return { model: BROAD_LANGUAGE_TRANSCRIPTION_MODEL, language: base };
  }
  return {
    model: TRANSCRIPTION_MODEL,
    language: base || "multi",
  };
}

/** Telnyx encodes the three greeting modes in one string field. */
function toGreeting(config: VoiceAgentConfig): string {
  switch (config.greetingMode) {
    case "assistant_generates_greeting":
      return "<assistant-speaks-first-with-model-generated-message>";
    case "assistant_waits_for_user":
      return "";
    case "assistant_speaks_first":
    case undefined:
      return config.greeting;
  }
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
    greeting: toGreeting(config),
    model: config.modelId,
    ...(config.llmApiKeyRef ? { llm_api_key_ref: config.llmApiKeyRef } : {}),
    enabled_features: ["telephony"],
    tools: config.tools.map(mapTool),
    ...(config.dynamicVariables
      ? { dynamic_variables: config.dynamicVariables }
      : {}),
    ...(config.voiceId ? { voice_settings: { voice: config.voiceId } } : {}),
    transcription: toTranscription(config.language),
    ...(config.insightGroupId
      ? { insight_settings: { insight_group_id: config.insightGroupId } }
      : {}),
    ...(config.postConversationEnabled === undefined
      ? {}
      : {
          post_conversation_settings: {
            enabled: config.postConversationEnabled,
          },
        }),
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
    toolWebhookUrls: (raw.tools ?? []).flatMap((tool) => {
      const url = str(tool?.webhook?.url);
      return tool?.type === "webhook" && url ? [url] : [];
    }),
  };
}

/**
 * A Telnyx TeXML application — the resource an assistant's calls are placed
 * through — as much of it as Ringee reads or writes.
 */
export interface TelnyxTexmlApplication {
  id?: string;
  friendly_name?: string | null;
  voice_url?: string | null;
  status_callback?: string | null;
  status_callback_method?: string | null;
  call_cost_in_webhooks?: boolean | null;
  outbound?: {
    channel_limit?: number | null;
    outbound_voice_profile_id?: string | null;
  } | null;
}

/** The body of a TeXML application update, as Telnyx accepts it. */
export interface TelnyxTexmlApplicationPatch {
  friendly_name: string;
  voice_url: string;
  call_cost_in_webhooks: boolean;
  status_callback: string;
  status_callback_method: "post";
  outbound?: {
    channel_limit?: number;
    outbound_voice_profile_id: string;
  };
}

/**
 * The update that brings a Telnyx-provisioned TeXML application in line with
 * what Ringee requires of it — or null when it already matches, so an ordinary
 * save does not write to the provider for nothing.
 *
 * The update is a partial one: everything left out keeps the value Telnyx put
 * there, which matters because Telnyx owns most of this application. Its
 * `voice_url` points at the assistant's own TeXML document and is fetched with
 * `voice_method: get` where the API's own default is `post` — resetting either
 * is what would leave an agent unable to answer its own calls. `friendly_name`
 * and `voice_url` are sent unchanged only because Telnyx requires them on an
 * update at all.
 */
export function toCallingAppPatch(
  current: TelnyxTexmlApplication,
  settings: VoiceAgentCallingAppSettings,
): TelnyxTexmlApplicationPatch | null {
  const friendlyName = current.friendly_name?.trim();
  const voiceUrl = current.voice_url?.trim();
  // Without these Telnyx rejects the update, and inventing them would rewrite
  // the application the provider built for the assistant.
  if (!friendlyName || !voiceUrl) return null;

  const profileId = settings.outboundProfileId?.trim() || null;
  const matchesProfile =
    !profileId || current.outbound?.outbound_voice_profile_id === profileId;
  const matchesCost =
    (current.call_cost_in_webhooks ?? false) === settings.callCostEvents;
  const matchesCallback =
    current.status_callback === settings.eventWebhookUrl &&
    (current.status_callback_method ?? "").toLowerCase() === "post";
  if (matchesProfile && matchesCost && matchesCallback) return null;

  return {
    friendly_name: friendlyName,
    voice_url: voiceUrl,
    call_cost_in_webhooks: settings.callCostEvents,
    status_callback: settings.eventWebhookUrl,
    status_callback_method: "post",
    ...(profileId
      ? {
          outbound: {
            // Telnyx replaces the whole `outbound` block, so a channel limit
            // set on the application has to be sent back with it.
            ...(current.outbound?.channel_limit != null
              ? { channel_limit: current.outbound.channel_limit }
              : {}),
            outbound_voice_profile_id: profileId,
          },
        }
      : {}),
  };
}

// ── Post-call analysis ───────────────────────────────────────

/** One message of a Telnyx conversation, as much of it as Ringee reads. */
export interface TelnyxConversationMessage {
  role?: string | null;
  text?: string | null;
  content?: string | null;
  created_at?: string | null;
  sent_at?: string | null;
}

/**
 * Telnyx speaks in OpenAI roles. `assistant` is the agent, `user` is the person
 * it called, and `system` is the prompt — which is configuration, not something
 * anyone said, so it never reaches the transcript.
 */
const TRANSCRIPT_ROLES: Record<string, VoiceAgentTranscriptTurn["role"]> = {
  assistant: "agent",
  user: "customer",
  tool: "tool",
};

function toDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Turns one page of conversation messages into the domain's transcript. */
export function toTranscriptTurns(
  rows: TelnyxConversationMessage[],
): VoiceAgentTranscriptTurn[] {
  return rows.flatMap((row) => {
    const role = TRANSCRIPT_ROLES[(row.role ?? "").toLowerCase()];
    if (!role) return [];
    const text = (row.text ?? row.content ?? "").trim();
    // A tool turn often carries no text of its own; an empty line in the
    // transcript is noise, not a turn.
    if (!text) return [];
    return [{ role, text, at: toDate(row.sent_at ?? row.created_at) }];
  });
}

function str(raw: unknown): string | null {
  return typeof raw === "string" && raw ? raw : null;
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === "object" && raw !== null;
}

/**
 * Telnyx reports one analysis result as `{ insight_id, result }`. A result that
 * is not text is stored as the JSON it came as — the structured insights are
 * read back with `JSON.parse` upstream — and an entry with no id is dropped,
 * because there is no way back from it to the field that asked for it.
 */
function toInsightResults(raw: unknown): VoiceAgentInsightResult[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const insightId = str(entry.insight_id);
    if (!insightId) return [];
    const result =
      typeof entry.result === "string"
        ? entry.result
        : JSON.stringify(entry.result ?? null);
    return [{ insightId, result }];
  });
}

/**
 * Reads an analysis delivery out of whatever Telnyx posted.
 *
 * Two shapes reach Ringee and both are handled here on purpose. An insight
 * group posts a flat body (`conversation_id` plus `insights`), while the call
 * event of the same analysis arrives in the Call Control envelope
 * (`data.payload`, with the results under `results`). They are the same fact,
 * they are both idempotent to apply, and which one an account sends is the
 * provider's business — so the adapter accepts either rather than making the
 * domain care.
 *
 * Returns null when the body carries no conversation to bind the results to.
 */
export function toInsightDelivery(
  body: unknown,
): VoiceAgentInsightDelivery | null {
  if (!isRecord(body)) return null;

  const envelope = isRecord(body.data) ? body.data : body;
  const payload = isRecord(envelope.payload) ? envelope.payload : envelope;

  const conversationId = str(payload.conversation_id);
  if (!conversationId) return null;

  return {
    conversationId,
    insightGroupId: str(payload.insight_group_id),
    insights: [
      ...toInsightResults(payload.results),
      ...toInsightResults(payload.insights),
    ],
  };
}

/** The body of an insight-group create or update, as Telnyx accepts it. */
export interface TelnyxInsightGroupPayload {
  name: string;
  webhook: string;
}

export function toInsightGroupPayload(
  group: VoiceAgentInsightGroupSettings,
): TelnyxInsightGroupPayload {
  return { name: group.name, webhook: group.webhookUrl };
}
