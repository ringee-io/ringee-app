/**
 * Ringee's own vocabulary for AI voice agents.
 *
 * A voice agent is an assistant that holds a spoken conversation on a call:
 * the provider runs the model, the speech stack and the tool loop, Ringee owns
 * what the agent is told to do. This file is the boundary — nothing below
 * `@ringee/platform` ever sees a provider's assistant shape, and adding a
 * second provider means writing an adapter, not touching the domain.
 *
 * The command half mirrors `telephony/interfaces/telephony.service.ts`; the
 * event half arrives through `TelephonyEvent`'s `conversation` field.
 */

/** Which LLM family runs the conversation, as the product presents it. */
export type VoiceAgentLlmProvider =
  | "ringee"
  | "openai"
  | "anthropic"
  | "google";

/** Who takes the first turn, in provider-independent product language. */
export type VoiceAgentGreetingMode =
  | "assistant_speaks_first"
  | "assistant_generates_greeting"
  | "assistant_waits_for_user";

export interface VoiceAgentToolHeader {
  name: string;
  /**
   * May reference a provider-held secret rather than carrying one. The adapter
   * decides how; callers pass `{ secretRef }` and never a literal credential.
   */
  value?: string;
  secretRef?: string;
}

/** A JSON Schema object describing a tool's arguments. */
export interface VoiceAgentToolParameters {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

/**
 * The tools an agent may use. Deliberately a small closed set: V1 ships
 * pre-built agents, so a tool exists because a blueprint needs it.
 */
export type VoiceAgentTool =
  | {
      kind: "hangup";
      description: string;
    }
  | {
      kind: "webhook";
      name: string;
      description: string;
      url: string;
      method: "GET" | "POST";
      headers?: VoiceAgentToolHeader[];
      parameters?: VoiceAgentToolParameters;
    }
  | {
      kind: "retrieval";
      /** Knowledge stores the agent may search. */
      bucketIds: string[];
    };

/**
 * Everything Ringee decides about an agent. Composed by the blueprint plus the
 * user's own choices; the adapter turns it into whatever the provider wants.
 */
export interface VoiceAgentConfig {
  /** The name the agent introduces itself with. */
  name: string;
  instructions: string;
  /** Fixed greeting text. Ignored by modes that generate or wait. */
  greeting: string;
  greetingMode?: VoiceAgentGreetingMode;
  /** Provider-side model id. Ringee picks it; the user picks a family. */
  modelId: string;
  /** Reference to a provider-held secret for a bring-your-own-key model. */
  llmApiKeyRef?: string | null;
  /** Curated voice id, or null to leave the provider default in place. */
  voiceId?: string | null;
  /**
   * Base language the conversation is held in, e.g. "es" — taken from the
   * chosen voice. It decides what the agent *hears*, not only what it says: a
   * provider transcribing in the wrong language returns nothing usable, and an
   * agent that never receives a turn simply stays silent.
   */
  language?: string;
  /** Default values for the variables the instructions interpolate. */
  dynamicVariables?: Record<string, string>;
  tools: VoiceAgentTool[];
  /** Analysis group whose insights run on every finished conversation. */
  insightGroupId?: string | null;
  /** Hard cap on call length, so an unattended agent cannot run up spend. */
  maxCallSeconds?: number;
  recordCalls?: boolean;
  /** Gives the assistant one extra model turn after the live call ends. */
  postConversationEnabled?: boolean;
}

/** A provider assistant as Ringee cares about it. */
export interface VoiceAgentAssistant {
  assistantId: string;
  /**
   * The provider resource an outbound call is placed through. Null means the
   * provider has not finished provisioning it yet.
   */
  callingAppId: string | null;
  /** Whether an unauthenticated browser may currently talk to this agent. */
  unauthenticatedWebCallsEnabled: boolean;
  /**
   * Where the assistant currently calls Ringee back for its tools.
   *
   * Stored provider-side at the last save, so it goes stale the moment
   * `PUBLIC_BACKEND_URL` changes — and a stale tool URL is not a degraded
   * agent, it is one that says "I am having a technical problem" and books
   * nothing. The dial path compares these against the current base so it can
   * re-sync before the call instead of after the complaint.
   */
  toolWebhookUrls: string[];
}

export interface VoiceAgentCallRequest {
  assistantId: string;
  callingAppId: string;
  from: string;
  to: string;
  /** Per-call values for the agent's dynamic variables. */
  variables?: Record<string, string>;
  /** Where conversation lifecycle and analysis events should be delivered. */
  conversationCallbackUrl?: string;
  /** Where call status events should be delivered. */
  statusCallbackUrl?: string;
  /** Seconds to keep ringing before giving up. */
  ringTimeoutSeconds?: number;
  /** Hard cap after which the provider ends the call. */
  timeLimitSeconds?: number;
  record?: boolean;
}

/**
 * What Ringee requires of the calling application an agent's calls go out
 * through. The provider provisions one per assistant with its own defaults;
 * these are the settings Ringee cannot leave to them.
 */
export interface VoiceAgentCallingAppSettings {
  /**
   * Where the provider delivers the application's own call events — the cost
   * record and the saved recording among them. Ringee points it at the same
   * signed webhook every other call event already arrives on.
   */
  eventWebhookUrl: string;
  /**
   * Whether the provider must publish a per-call cost event. Ringee always
   * asks for it: without it the telephony leg of an agent call settles at
   * nothing, because no cost is ever reported for it.
   */
  callCostEvents: boolean;
  /**
   * The provider-side outbound route these calls bill through (Telnyx calls it
   * an outbound voice profile). Comes from configuration; null leaves whatever
   * the provider defaults to in place.
   */
  outboundProfileId?: string | null;
}

/**
 * What the provider hands back when it accepts a call. Every field is nullable
 * because a provider may only learn some of them once the leg exists — treat a
 * null as "not known yet", never as "no call".
 */
export interface VoiceAgentCallHandle {
  providerCallId: string | null;
  callControlId: string | null;
  callSessionId: string | null;
}

/** One analysis definition Ringee asks the provider to run after every call. */
export interface VoiceAgentInsightDefinition {
  name: string;
  instructions: string;
  /** When set, the result is JSON matching this schema instead of free text. */
  jsonSchema?: Record<string, unknown> | null;
}

/**
 * The analysis group Ringee owns for one agent, and where its results are to
 * be delivered.
 *
 * The webhook is the point of the group, not a detail of it. Post-call
 * analysis runs provider-side minutes after the conversation ends, and there
 * is no endpoint to read a finished conversation's results back — so a group
 * configured without one analyses every call and tells nobody.
 */
export interface VoiceAgentInsightGroupSettings {
  name: string;
  /** Ringee route the provider posts finished analysis to. */
  webhookUrl: string;
}

/** One analysis result, as the provider reports it after a conversation. */
export interface VoiceAgentInsightResult {
  /**
   * The analysis that produced it. This is the only reliable way back to the
   * field that asked for it: names are not unique across agents.
   */
  insightId: string;
  /** Free text, or the JSON a structured analysis returned, verbatim. */
  result: string;
}

/**
 * A delivery of post-call analysis, lifted out of whatever shape the provider
 * posted it in.
 *
 * `conversationId` is what binds it to a call — an analysis delivery names the
 * conversation and nothing else, so a delivery without one cannot be placed
 * and is dropped rather than guessed at.
 */
export interface VoiceAgentInsightDelivery {
  conversationId: string | null;
  insightGroupId: string | null;
  insights: VoiceAgentInsightResult[];
}

/**
 * One turn of a conversation, as the provider transcribed it while the call
 * was live.
 *
 * This is the agent call's transcript: the provider runs the speech stack, so
 * it already holds the text and Ringee does not pay to transcribe the audio a
 * second time. `tool` turns are the agent's own function calls — kept because
 * "the agent looked up availability here" is often the only explanation for
 * what it said next.
 */
export interface VoiceAgentTranscriptTurn {
  role: "agent" | "customer" | "tool";
  text: string;
  at: Date | null;
}

/**
 * A billable usage record, as the provider reports it after the fact.
 * `costUsd` is the provider's own charge — Ringee applies its margin on top.
 *
 * An agent call is billed in two unrelated halves and both arrive here:
 * `telephony` is the voice leg, the same charge every other Ringee call
 * settles from; `voice_agent` and `inference` are the conversation engine and
 * its tokens. They carry different margins downstream, so the kind is what
 * tells them apart — never the amount.
 */
export interface VoiceAgentUsageRecord {
  kind: "telephony" | "voice_agent" | "inference";
  conversationId: string | null;
  callControlId: string | null;
  /**
   * The provider's own session handle for the leg, when the record names one.
   * It is the only place a `telephony` record reports it, and it is what the
   * recording of the same call is filed under.
   */
  callSessionId: string | null;
  costUsd: number;
  billedSeconds: number | null;
  /**
   * Seconds the two ends were actually connected, as the provider measured
   * them. Zero on a leg that never answered — which is what distinguishes a
   * failed attempt from the leg that carried the conversation.
   */
  connectedSeconds: number | null;
  /** When the leg was placed and when it ended, per the provider's records. */
  startedAt: Date | null;
  endedAt: Date | null;
  occurredAt: Date | null;
}

export interface VoiceAgentUsageQuery {
  conversationId?: string;
  callControlId?: string;
  /** Inclusive lower bound on record creation time. */
  since?: Date;
}

/**
 * A recording the provider kept for a call, as its own records report it.
 *
 * Ringee reads these rather than waiting to be told about them: the recording
 * of an agent call is announced as an event of the calling application, which
 * is not a delivery Ringee can rely on. `downloadUrl` is short-lived and signed
 * by the provider — fetch it now, never store it.
 */
/**
 * Which call to read recordings for.
 *
 * Both handles are accepted because only one of them is reliably known. A
 * provider-placed agent leg reports a call control id when it is created and a
 * session id only later, on an event Ringee may never receive — so a lookup
 * that insists on the session id finds nothing for calls that were recorded
 * perfectly well.
 */
export interface VoiceAgentRecordingQuery {
  callControlId?: string | null;
  callSessionId?: string | null;
}

/**
 * A conversation the provider ran, as Ringee needs it: the handles that tie it
 * back to a call.
 *
 * Post-call analysis names the conversation and nothing else, so this is the
 * way back from a delivered analysis to the call it belongs to when the
 * conversation was never bound to the row — the one event that would have
 * bound it is also the one that may never arrive.
 */
export interface VoiceAgentConversation {
  conversationId: string;
  assistantId: string | null;
  callControlId: string | null;
  callSessionId: string | null;
  callLegId: string | null;
}

export interface VoiceAgentRecording {
  providerRecordingId: string;
  callControlId: string | null;
  callSessionId: string | null;
  downloadUrl: string | null;
  channels: "single" | "dual" | null;
  startedAt: Date | null;
  endedAt: Date | null;
  durationMillis: number | null;
}

/** How far along the provider is with indexing a knowledge base. */
export type VoiceAgentEmbeddingStatus =
  | "pending"
  | "processing"
  | "ready"
  | "failed";

/** A voice the user may pick, already curated and normalized. */
export interface VoiceAgentVoice {
  /** Provider voice id — opaque to the user, stored on the agent. */
  id: string;
  displayName: string;
  /** Short description of how the voice sounds, when the provider gives one. */
  description: string | null;
  /** Base language, e.g. "es". */
  language: string;
  /** Full locale when the provider reports one, e.g. "es-MX". */
  locale: string | null;
  /**
   * ISO 3166-1 alpha-2 region of the locale, e.g. "MX". Null when the provider
   * reports a bare language. The picker shows it so a user hears "Spanish" and
   * sees which Spanish before choosing.
   */
  countryCode: string | null;
  accent: string | null;
  gender: "female" | "male" | "unspecified";
  custom?: { id: string; status: VoiceCloneStatus; lastError: string | null };
}

export type VoiceCloneStatus = "pending" | "ready" | "failed" | "expired";

export interface VoiceCloneInput {
  name: string;
  language: string;
  gender: VoiceAgentVoice["gender"];
  audio: Buffer;
}

/** Provider resources; the domain filters them by stored ownership. */
export interface VoiceClone {
  cloneId: string;
  name: string;
  voiceId: string | null;
  status: VoiceCloneStatus;
}

/**
 * The outbound contract. One implementation per provider; `VoiceAgentService`
 * is the dispatcher that picks between them.
 */
export interface VoiceAgentProvider {
  createAssistant(config: VoiceAgentConfig): Promise<VoiceAgentAssistant>;
  updateAssistant(
    assistantId: string,
    config: VoiceAgentConfig,
  ): Promise<VoiceAgentAssistant>;
  /** Returns null when the assistant no longer exists provider-side. */
  getAssistant(assistantId: string): Promise<VoiceAgentAssistant | null>;
  deleteAssistant(assistantId: string): Promise<void>;

  /**
   * Opens or closes the assistant to unauthenticated browser calls, and sets
   * the variable values it should use while that window is open.
   *
   * Both belong to the same operation because a browser test call cannot carry
   * per-call variables: the only way to test with real values is to make them
   * the assistant's defaults for the length of the session, and restore the
   * agent's own defaults when it closes.
   */
  configureTestAccess(
    assistantId: string,
    options: {
      enabled: boolean;
      dynamicVariables?: Record<string, string>;
    },
  ): Promise<void>;

  startCall(request: VoiceAgentCallRequest): Promise<VoiceAgentCallHandle>;

  /**
   * Applies Ringee's own requirements to the calling application the provider
   * provisioned for an assistant: the outbound route its calls bill through,
   * where its events are delivered, and that it reports cost at all.
   *
   * Safe to call on every save — an application that already matches is left
   * untouched.
   */
  configureCallingApp(
    callingAppId: string,
    settings: VoiceAgentCallingAppSettings,
  ): Promise<void>;

  createInsightGroup(group: VoiceAgentInsightGroupSettings): Promise<string>;
  /**
   * Brings an existing group in line with the settings above. Called on every
   * save, because a group created before Ringee configured a webhook would
   * otherwise keep analysing calls and delivering the results nowhere.
   */
  updateInsightGroup(
    groupId: string,
    group: VoiceAgentInsightGroupSettings,
  ): Promise<void>;
  deleteInsightGroup(groupId: string): Promise<void>;
  createInsight(
    groupId: string,
    definition: VoiceAgentInsightDefinition,
  ): Promise<string>;
  updateInsight(
    insightId: string,
    definition: VoiceAgentInsightDefinition,
  ): Promise<void>;
  deleteInsight(groupId: string, insightId: string): Promise<void>;

  /**
   * Hand a user's own API key to the provider and get back a reference to it.
   * The key itself never returns and is never stored by Ringee.
   */
  storeSecret(identifier: string, token: string): Promise<string>;
  deleteSecret(identifier: string): Promise<void>;

  listVoices(): Promise<VoiceAgentVoice[]>;
  cloneVoice(input: VoiceCloneInput): Promise<VoiceClone>;
  listClonedVoices(): Promise<VoiceClone[]>;
  /** Renders a short sample so the user can hear a voice before choosing it. */
  renderVoicePreview(
    voiceId: string,
    text: string,
  ): Promise<{ audio: Buffer; contentType: string }>;

  /**
   * Reads an analysis delivery out of a provider request body. Returns null
   * when the body is not one — the route is public, so "not ours" has to be a
   * possible answer rather than an error.
   */
  parseInsightWebhook(body: unknown): VoiceAgentInsightDelivery | null;

  /**
   * The conversation's transcript, in order. Empty means the provider has not
   * published it yet, never that nothing was said.
   */
  fetchTranscript(conversationId: string): Promise<VoiceAgentTranscriptTurn[]>;

  fetchUsageRecords(
    query: VoiceAgentUsageQuery,
  ): Promise<VoiceAgentUsageRecord[]>;

  /**
   * The recordings the provider holds for one call. Empty means "none yet" —
   * a recording is finalized after the call ends, so an early read is not
   * proof the call went unrecorded.
   */
  fetchRecordings(
    query: VoiceAgentRecordingQuery,
  ): Promise<VoiceAgentRecording[]>;

  /**
   * One conversation's handles. Null when the provider does not know it.
   *
   * Read on the recovery paths only: it is what turns a conversation id — all
   * a post-call analysis carries — back into the call that produced it.
   */
  fetchConversation(
    conversationId: string,
  ): Promise<VoiceAgentConversation | null>;

  // ── Knowledge bases ──
  // A store holds one knowledge source; indexing it is asynchronous, so every
  // write returns a task the caller polls. An assistant may receive several
  // stores through its retrieval tool.

  createKnowledgeStore(store: string): Promise<void>;
  deleteKnowledgeStore(store: string): Promise<void>;
  putKnowledgeDocument(
    store: string,
    fileName: string,
    body: Buffer,
    contentType: string,
  ): Promise<void>;
  /** Reads a stored document back, so it can be copied onto another agent. */
  readKnowledgeDocument(
    store: string,
    fileName: string,
  ): Promise<{ body: Buffer; contentType: string }>;
  deleteKnowledgeDocument(store: string, fileName: string): Promise<void>;
  /** Indexes everything currently in the store. Returns the task id. */
  indexKnowledgeStore(store: string): Promise<string>;
  /** Crawls a public page into the store and indexes it. Returns the task id. */
  indexKnowledgeUrl(store: string, url: string): Promise<string>;
  getIndexingStatus(taskId: string): Promise<VoiceAgentEmbeddingStatus>;
}
