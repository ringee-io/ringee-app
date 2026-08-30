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
  greeting: string;
  /** Provider-side model id. Ringee picks it; the user picks a family. */
  modelId: string;
  /** Reference to a provider-held secret for a bring-your-own-key model. */
  llmApiKeyRef?: string | null;
  /** Curated voice id, or null to leave the provider default in place. */
  voiceId?: string | null;
  /** Default values for the variables the instructions interpolate. */
  dynamicVariables?: Record<string, string>;
  tools: VoiceAgentTool[];
  /** Analysis group whose insights run on every finished conversation. */
  insightGroupId?: string | null;
  /** Hard cap on call length, so an unattended agent cannot run up spend. */
  maxCallSeconds?: number;
  recordCalls?: boolean;
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
 * A billable usage record, as the provider reports it after the fact.
 * `costUsd` is the provider's own charge — Ringee applies its margin on top.
 */
export interface VoiceAgentUsageRecord {
  kind: "voice_agent" | "inference";
  conversationId: string | null;
  callControlId: string | null;
  costUsd: number;
  billedSeconds: number | null;
  occurredAt: Date | null;
}

export interface VoiceAgentUsageQuery {
  conversationId?: string;
  callControlId?: string;
  /** Inclusive lower bound on record creation time. */
  since?: Date;
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
  accent: string | null;
  gender: "female" | "male" | "unspecified";
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

  createInsightGroup(name: string): Promise<string>;
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
  /** Renders a short sample so the user can hear a voice before choosing it. */
  renderVoicePreview(
    voiceId: string,
    text: string,
  ): Promise<{ audio: Buffer; contentType: string }>;

  fetchUsageRecords(
    query: VoiceAgentUsageQuery,
  ): Promise<VoiceAgentUsageRecord[]>;

  // ── Knowledge bases ──
  // A store holds one agent's documents; indexing it is asynchronous, so every
  // write returns a task the caller polls.

  createKnowledgeStore(store: string): Promise<void>;
  deleteKnowledgeStore(store: string): Promise<void>;
  putKnowledgeDocument(
    store: string,
    fileName: string,
    body: Buffer,
    contentType: string,
  ): Promise<void>;
  deleteKnowledgeDocument(store: string, fileName: string): Promise<void>;
  /** Indexes everything currently in the store. Returns the task id. */
  indexKnowledgeStore(store: string): Promise<string>;
  /** Crawls a public page into the store and indexes it. Returns the task id. */
  indexKnowledgeUrl(store: string, url: string): Promise<string>;
  getIndexingStatus(taskId: string): Promise<VoiceAgentEmbeddingStatus>;
}
