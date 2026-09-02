import { Injectable, Logger } from "@nestjs/common";
import { TelnyxClient } from "../../telephony/telnyx/telnyx.client";
import { TelnyxKnowledgeStore } from "./telnyx.knowledge.store";
import type {
  VoiceAgentAssistant,
  VoiceAgentCallHandle,
  VoiceAgentCallingAppSettings,
  VoiceAgentCallRequest,
  VoiceAgentConfig,
  VoiceAgentConversation,
  VoiceAgentEmbeddingStatus,
  VoiceAgentInsightDefinition,
  VoiceAgentInsightDelivery,
  VoiceAgentInsightGroupSettings,
  VoiceAgentProvider,
  VoiceAgentRecording,
  VoiceAgentRecordingQuery,
  VoiceAgentTranscriptTurn,
  VoiceAgentUsageQuery,
  VoiceAgentUsageRecord,
  VoiceAgentVoice,
} from "../interfaces/voice-agent.provider";
import { curateVoices, type RawProviderVoice } from "../voices.catalog";
import {
  toAssistantPayload,
  toCallingAppPatch,
  toInsightDelivery,
  toInsightGroupPayload,
  toTranscriptTurns,
  toVoiceAgentAssistant,
  type TelnyxAssistantResponse,
  type TelnyxConversationMessage,
  type TelnyxTexmlApplication,
} from "./telnyx.voice-agent.mapper";

/** Page size and ceiling for walking the provider's integration-secret list. */
const SECRET_PAGE_SIZE = 100;
const MAX_SECRET_PAGES = 50;

/**
 * Provider statuses that mean "try again", not "your request was wrong".
 *
 * `/ai/embeddings` answers a perfectly valid bucket with `503` and the generic
 * `10007 Unexpected error` often enough that treating the first reply as final
 * is what strands a document the user just uploaded.
 */
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Attempts, and the base delay between them, for starting an embedding task. */
const EMBEDDING_ATTEMPTS = 3;
const EMBEDDING_RETRY_MS = 800;

/** How many detail records to ask for per record type. One call needs a few. */
const USAGE_PAGE_SIZE = 50;

/** Transcript paging. The provider caps a page at 100 messages. */
const TRANSCRIPT_PAGE_SIZE = 100;
const TRANSCRIPT_MAX_PAGES = 20;

/** A provider timestamp, or null when it is absent or unparseable. */
function toDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

interface UsageRecordType {
  recordType: string;
  kind: VoiceAgentUsageRecord["kind"];
  /** Handles this record type can be looked up by, best first. */
  keys: Array<"conversationId" | "callControlId">;
}

/**
 * What one agent call costs, and where each part of it is reported.
 *
 * Telnyx bills an agent call as separate products and tags each with only the
 * handle its own subsystem knows about — the voice leg has no idea a
 * conversation happened, and the token records have no idea which SIP leg
 * carried them. Reading all three by the right handle is what makes an agent
 * call cost what it actually cost.
 */
const USAGE_RECORD_TYPES: UsageRecordType[] = [
  // The voice leg — the same charge every non-agent Ringee call settles from.
  { recordType: "sip-trunking", kind: "telephony", keys: ["callControlId"] },
  // The conversation engine, billed per minute. Tagged with both handles.
  {
    recordType: "ai-voice-assistant",
    kind: "voice_agent",
    keys: ["conversationId", "callControlId"],
  },
  // The model tokens. Only ever tagged with the conversation.
  { recordType: "inference", kind: "inference", keys: ["conversationId"] },
];

/**
 * The Telnyx implementation of the voice-agent contract, and the only place
 * these Telnyx routes are called. Every method returns Ringee-shaped values.
 */
@Injectable()
export class TelnyxVoiceAgentService implements VoiceAgentProvider {
  private readonly logger = new Logger(TelnyxVoiceAgentService.name);

  constructor(
    private readonly telnyxClient: TelnyxClient,
    private readonly knowledgeStore: TelnyxKnowledgeStore,
  ) {}

  // ── Assistants ───────────────────────────────────────────────

  async createAssistant(
    config: VoiceAgentConfig,
  ): Promise<VoiceAgentAssistant> {
    const raw = await this.telnyxClient.post<TelnyxAssistantResponse>(
      "/ai/assistants",
      toAssistantPayload(config, { unauthenticatedWebCalls: false }),
    );
    return toVoiceAgentAssistant(raw);
  }

  async updateAssistant(
    assistantId: string,
    config: VoiceAgentConfig,
  ): Promise<VoiceAgentAssistant> {
    // Telnyx updates an assistant with POST, not PATCH.
    await this.telnyxClient.post(
      `/ai/assistants/${assistantId}`,
      toAssistantPayload(config, {
        unauthenticatedWebCalls: await this.readWebCallFlag(assistantId),
      }),
    );
    const updated = await this.getAssistant(assistantId);
    if (!updated) {
      throw new Error(`Assistant ${assistantId} vanished during update`);
    }
    return updated;
  }

  async getAssistant(assistantId: string): Promise<VoiceAgentAssistant | null> {
    const raw = await this.readAssistant(assistantId);
    return raw ? toVoiceAgentAssistant(raw) : null;
  }

  async deleteAssistant(assistantId: string): Promise<void> {
    try {
      await this.telnyxClient.delete(`/ai/assistants/${assistantId}`);
    } catch (error) {
      // A missing assistant is the state the caller asked for.
      if (!this.isNotFound(error)) throw error;
    }
  }

  async configureTestAccess(
    assistantId: string,
    options: {
      enabled: boolean;
      dynamicVariables?: Record<string, string>;
    },
  ): Promise<void> {
    // Telnyx replaces `telephony_settings` wholesale, so sending only the
    // web-call flag drops the rest of the block — the per-call time limit and
    // the recording settings among them. An agent opened for a browser test
    // would come back with no time limit and recording off, and stay that way
    // until the next full save. Carry the current values through.
    const current = await this.readAssistant(assistantId);
    const telephony = current?.telephony_settings ?? {};

    await this.telnyxClient.post(`/ai/assistants/${assistantId}`, {
      telephony_settings: {
        ...(telephony.time_limit_secs != null
          ? { time_limit_secs: telephony.time_limit_secs }
          : {}),
        ...(telephony.recording_settings
          ? { recording_settings: telephony.recording_settings }
          : {}),
        supports_unauthenticated_web_calls: options.enabled,
      },
      ...(options.dynamicVariables
        ? { dynamic_variables: options.dynamicVariables }
        : {}),
    });
  }

  /**
   * Reads the current web-call flag so an ordinary configuration update does
   * not silently close (or re-open) a running test session.
   */
  private async readWebCallFlag(assistantId: string): Promise<boolean> {
    const current = await this.readAssistant(assistantId);
    return (
      current?.telephony_settings?.supports_unauthenticated_web_calls ?? false
    );
  }

  /** The provider's own assistant body, for the fields the domain type drops. */
  private async readAssistant(
    assistantId: string,
  ): Promise<TelnyxAssistantResponse | null> {
    try {
      const raw = await this.telnyxClient.get<
        TelnyxAssistantResponse | { data: TelnyxAssistantResponse }
      >(`/ai/assistants/${assistantId}`);
      const body = "data" in raw ? raw.data : raw;
      return body?.id ? body : null;
    } catch (error) {
      if (this.isNotFound(error)) return null;
      throw error;
    }
  }

  // ── Calls ────────────────────────────────────────────────────

  async startCall(
    request: VoiceAgentCallRequest,
  ): Promise<VoiceAgentCallHandle> {
    const raw = await this.telnyxClient.post<Record<string, any>>(
      `/texml/ai_calls/${request.callingAppId}`,
      {
        From: request.from,
        To: request.to,
        AIAssistantId: request.assistantId,
        ...(request.variables && Object.keys(request.variables).length
          ? { AIAssistantDynamicVariables: request.variables }
          : {}),
        ...(request.conversationCallbackUrl
          ? {
              ConversationCallback: request.conversationCallbackUrl,
              ConversationCallbackMethod: "POST",
            }
          : {}),
        ...(request.statusCallbackUrl
          ? {
              StatusCallback: request.statusCallbackUrl,
              StatusCallbackMethod: "POST",
            }
          : {}),
        ...(request.ringTimeoutSeconds
          ? { Timeout: request.ringTimeoutSeconds }
          : {}),
        ...(request.timeLimitSeconds
          ? { TimeLimit: request.timeLimitSeconds }
          : {}),
        // Recorded on two channels like every other Ringee recording, so the
        // caller and the agent stay separable once the audio is transcribed.
        ...(request.record === undefined
          ? {}
          : { Record: request.record, RecordingChannels: "dual" }),
      },
    );

    const body = raw?.data ?? raw ?? {};
    // In TeXML the call sid *is* the call control id (`v3:…`) — the same value
    // every later callback reports as `CallSid`. Handing it back as both is
    // what lets the telephony row be found by control id from the moment it
    // exists, so a cost or recording event that arrives before the first
    // status callback still lands on the call instead of being dropped.
    const callSid = body.sid ?? body.call_sid ?? null;
    return {
      providerCallId: callSid,
      callControlId: body.call_control_id ?? callSid,
      callSessionId: body.call_session_id ?? null,
    };
  }

  /**
   * Brings the assistant's TeXML application in line with what Ringee requires
   * of it.
   *
   * Telnyx provisions one per assistant and leaves it on its own defaults: no
   * cost webhook and nowhere to deliver the application's own events. Left that
   * way an agent call is never told what it cost and its recording never
   * arrives, because both are published as events of this application rather
   * than as callbacks of the call. The outbound voice profile comes from
   * configuration, so every agent bills through the same route as the rest of
   * the account.
   */
  async configureCallingApp(
    callingAppId: string,
    settings: VoiceAgentCallingAppSettings,
  ): Promise<void> {
    const current = await this.readCallingApp(callingAppId);
    if (!current) {
      throw new Error(`Calling application ${callingAppId} was not found`);
    }

    const patch = toCallingAppPatch(current, settings);
    // Already as it should be, or missing the fields Telnyx requires on an
    // update — either way there is nothing safe to write.
    if (!patch) return;

    await this.telnyxClient.patch(`/texml_applications/${callingAppId}`, patch);
    this.logger.log(
      `Configured calling application ${callingAppId} (cost events, outbound profile, event webhook)`,
    );
  }

  private async readCallingApp(
    callingAppId: string,
  ): Promise<TelnyxTexmlApplication | null> {
    try {
      const raw = await this.telnyxClient.get<{
        data?: TelnyxTexmlApplication;
      }>(`/texml_applications/${callingAppId}`);
      return raw?.data ?? null;
    } catch (error) {
      if (this.isNotFound(error)) return null;
      throw error;
    }
  }

  // ── Post-call analysis ───────────────────────────────────────

  /**
   * Creates the group Ringee runs an agent's post-call analysis in.
   *
   * The webhook goes on at creation because it is the only way the results
   * ever come back: Telnyx analyses the conversation minutes after it ends and
   * exposes no endpoint to read a finished conversation's results, so a group
   * created without one analyses every call and delivers nothing.
   */
  async createInsightGroup(
    group: VoiceAgentInsightGroupSettings,
  ): Promise<string> {
    const raw = await this.telnyxClient.post<{ data?: { id: string } }>(
      "/ai/conversations/insight-groups",
      toInsightGroupPayload(group),
    );
    const id = raw?.data?.id;
    if (!id) throw new Error("Telnyx returned no insight group id");
    return id;
  }

  /**
   * Re-points an existing group at Ringee's analysis callback.
   *
   * Runs on every save, for the groups created before there was a callback to
   * point at: those agents are still analysing every call they make, and
   * nothing but this brings their results back.
   *
   * PUT, not POST — see `updateInsight`.
   */
  async updateInsightGroup(
    groupId: string,
    group: VoiceAgentInsightGroupSettings,
  ): Promise<void> {
    await this.telnyxClient.put(
      `/ai/conversations/insight-groups/${groupId}`,
      toInsightGroupPayload(group),
    );
  }

  parseInsightWebhook(body: unknown): VoiceAgentInsightDelivery | null {
    return toInsightDelivery(body);
  }

  async deleteInsightGroup(groupId: string): Promise<void> {
    try {
      await this.telnyxClient.delete(
        `/ai/conversations/insight-groups/${groupId}`,
      );
    } catch (error) {
      if (!this.isNotFound(error)) throw error;
    }
  }

  async createInsight(
    groupId: string,
    definition: VoiceAgentInsightDefinition,
  ): Promise<string> {
    const raw = await this.telnyxClient.post<{ data?: { id: string } }>(
      "/ai/conversations/insights",
      this.insightBody(definition),
    );
    const id = raw?.data?.id;
    if (!id) throw new Error("Telnyx returned no insight id");
    await this.telnyxClient.post(
      `/ai/conversations/insight-groups/${groupId}/insights/${id}/assign`,
      {},
    );
    return id;
  }

  async updateInsight(
    insightId: string,
    definition: VoiceAgentInsightDefinition,
  ): Promise<void> {
    // PUT, not POST. An assistant is updated with POST (see `updateAssistant`),
    // and following that convention here answers 404 "Resource not found" on an
    // insight that plainly exists — which then lands on the agent row as the
    // reason its knowledge never got attached.
    await this.telnyxClient.put(
      `/ai/conversations/insights/${insightId}`,
      this.insightBody(definition),
    );
  }

  async deleteInsight(groupId: string, insightId: string): Promise<void> {
    try {
      await this.telnyxClient.delete(
        `/ai/conversations/insight-groups/${groupId}/insights/${insightId}/unassign`,
      );
    } catch (error) {
      if (!this.isNotFound(error)) throw error;
    }
    try {
      await this.telnyxClient.delete(`/ai/conversations/insights/${insightId}`);
    } catch (error) {
      if (!this.isNotFound(error)) throw error;
    }
  }

  private insightBody(definition: VoiceAgentInsightDefinition) {
    return {
      name: definition.name,
      instructions: definition.instructions,
      ...(definition.jsonSchema ? { json_schema: definition.jsonSchema } : {}),
    };
  }

  // ── Secrets ──────────────────────────────────────────────────

  async storeSecret(identifier: string, token: string): Promise<string> {
    await this.telnyxClient.post("/integration_secrets", {
      identifier,
      type: "bearer",
      token,
    });
    return identifier;
  }

  async deleteSecret(identifier: string): Promise<void> {
    // The delete route takes the secret's own id, so the identifier Ringee
    // stored has to be resolved first — and the list is paginated. Reading
    // only the first page means that, past one page of secrets, every delete
    // silently finds nothing and a customer's revoked API key stays stored at
    // the provider forever. Walk the pages until it is found.
    const match = await this.findSecret(identifier);
    if (!match) {
      this.logger.warn(
        `No stored secret matched ${identifier} — nothing to delete`,
      );
      return;
    }
    try {
      await this.telnyxClient.delete(`/integration_secrets/${match.id}`);
    } catch (error) {
      if (!this.isNotFound(error)) throw error;
    }
  }

  private async findSecret(
    identifier: string,
  ): Promise<{ id: string; identifier: string } | null> {
    for (let page = 1; page <= MAX_SECRET_PAGES; page++) {
      const params = new URLSearchParams();
      params.set("page[number]", String(page));
      params.set("page[size]", String(SECRET_PAGE_SIZE));

      const list = await this.telnyxClient.get<{
        data?: Array<{ id: string; identifier: string }>;
        meta?: { total_pages?: number };
      }>(`/integration_secrets?${params.toString()}`);

      const rows = list?.data ?? [];
      const match = rows.find((row) => row.identifier === identifier);
      if (match) return match;

      const totalPages = list?.meta?.total_pages ?? 1;
      if (page >= totalPages || rows.length === 0) break;
    }
    return null;
  }

  // ── Voices ───────────────────────────────────────────────────

  async listVoices(): Promise<VoiceAgentVoice[]> {
    const raw = await this.telnyxClient.get<{ voices?: RawProviderVoice[] }>(
      "/text-to-speech/voices",
    );
    return curateVoices(raw?.voices ?? []);
  }

  async renderVoicePreview(
    voiceId: string,
    text: string,
  ): Promise<{ audio: Buffer; contentType: string }> {
    const { data, contentType } = await this.telnyxClient.postBinary(
      "/text-to-speech/speech",
      { voice: voiceId, text },
    );
    return { audio: data, contentType };
  }

  // ── Transcript ───────────────────────────────────────────────

  /**
   * The conversation as the provider transcribed it live.
   *
   * Read, not received: the transcript is never pushed anywhere, and it is the
   * one artifact of an agent call that costs nothing to fetch — the provider
   * ran the speech stack to hold the conversation at all, so transcribing the
   * recording a second time would be paying for text that already exists.
   *
   * Pages are walked to a ceiling rather than to exhaustion. A call is capped
   * at `AI_VOICE_AGENT_MAX_CALL_SECONDS`, so the ceiling is unreachable in
   * practice — it is there so a provider that keeps answering "one more page"
   * cannot spin this forever.
   */
  async fetchTranscript(
    conversationId: string,
  ): Promise<VoiceAgentTranscriptTurn[]> {
    const turns: VoiceAgentTranscriptTurn[] = [];

    for (let page = 1; page <= TRANSCRIPT_MAX_PAGES; page += 1) {
      const params = new URLSearchParams({
        "page[size]": String(TRANSCRIPT_PAGE_SIZE),
        "page[number]": String(page),
      });
      const raw = await this.telnyxClient.get<{
        data?: TelnyxConversationMessage[];
        meta?: { total_pages?: number };
      }>(`/ai/conversations/${conversationId}/messages?${params.toString()}`);

      const rows = raw?.data ?? [];
      turns.push(...toTranscriptTurns(rows));

      const totalPages = raw?.meta?.total_pages ?? page;
      if (rows.length === 0 || page >= totalPages) break;
    }

    return turns;
  }

  /**
   * The handles Telnyx keeps on a conversation.
   *
   * Telnyx stores the call it belonged to under `metadata`, which is the only
   * route back from a conversation id to a call — and a post-call analysis
   * carries a conversation id and nothing else.
   */
  async fetchConversation(
    conversationId: string,
  ): Promise<VoiceAgentConversation | null> {
    try {
      const raw = await this.telnyxClient.get<{
        data?: {
          id?: string;
          metadata?: Record<string, unknown> | null;
        };
      }>(`/ai/conversations/${conversationId}`);
      const body = raw?.data;
      if (!body?.id) return null;

      const metadata = (body.metadata ?? {}) as Record<string, unknown>;
      const text = (value: unknown): string | null =>
        typeof value === "string" && value ? value : null;

      return {
        conversationId: body.id,
        assistantId: text(metadata.assistant_id),
        callControlId: text(metadata.call_control_id),
        callSessionId: text(metadata.call_session_id),
        callLegId: text(metadata.call_leg_id),
      };
    } catch (error) {
      if (this.isNotFound(error)) return null;
      throw error;
    }
  }

  // ── Usage ────────────────────────────────────────────────────

  /**
   * Reads the provider's own billing records for one call. Records land with a
   * lag after the call ends, so an empty result means "not yet", never "free"
   * — the caller retries rather than settling at zero.
   */
  async fetchUsageRecords(
    query: VoiceAgentUsageQuery,
  ): Promise<VoiceAgentUsageRecord[]> {
    const results = await Promise.all(
      USAGE_RECORD_TYPES.map((type) => this.fetchRecordsOfType(type, query)),
    );
    return results.flat();
  }

  /**
   * One record type's rows for one call.
   *
   * Which handle the lookup uses is the record type's own business: the voice
   * leg is never tagged with the conversation and the token records are never
   * tagged with the leg, so asking either one by the wrong handle answers a
   * confident, wrong "no records" — and a call settled on that would be given
   * away for free.
   */
  private async fetchRecordsOfType(
    type: UsageRecordType,
    query: VoiceAgentUsageQuery,
  ): Promise<VoiceAgentUsageRecord[]> {
    const params = new URLSearchParams();
    params.set("filter[record_type]", type.recordType);

    const handle = type.keys
      .map((key) => [key, query[key]] as const)
      .find(([, value]) => Boolean(value));
    // No handle this record type understands. Reporting nothing would read as
    // "this call cost nothing", so the caller is left waiting instead.
    if (!handle) return [];
    const [key, value] = handle;
    params.set(
      key === "conversationId"
        ? "filter[conversation_id]"
        : "filter[call_control_id]",
      value!,
    );
    params.set("page[size]", String(USAGE_PAGE_SIZE));

    try {
      const raw = await this.telnyxClient.get<{ data?: Record<string, any>[] }>(
        `/detail_records?${params.toString()}`,
      );
      return (raw?.data ?? []).map((row) => ({
        kind: type.kind,
        conversationId: row.conversation_id ?? null,
        callControlId: row.call_control_id ?? null,
        // Telnyx names the call session `telnyx_session_id` on a detail record
        // and nothing else on it names the session at all — which makes this
        // the only place a provider-placed agent leg ever reports the handle
        // its recording is filed under.
        callSessionId: row.telnyx_session_id ?? row.call_session_id ?? null,
        costUsd: Number.parseFloat(row.cost ?? "0") || 0,
        billedSeconds:
          typeof row.billed_sec === "number" ? row.billed_sec : null,
        // `call_sec` is time on the call, not time billed: a leg that was
        // refused reports zero here while still reporting a billed minute.
        connectedSeconds:
          typeof row.call_sec === "number" ? row.call_sec : null,
        startedAt: toDate(row.started_at),
        endedAt: toDate(row.finished_at),
        occurredAt: toDate(row.created_at) ?? toDate(row.started_at),
      }));
    } catch (error) {
      // One record type being unavailable must not hide the others; the caller
      // decides whether a partial answer is enough to settle on.
      this.logger.warn(
        `Could not read ${type.recordType} usage records: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  /**
   * The recordings the provider kept for one call session.
   *
   * Read rather than waited for: a recording is announced as an event of the
   * calling application, and that application is the provider's to configure,
   * so an agent call whose recording never arrived is the normal case rather
   * than the exceptional one.
   */
  async fetchRecordings(
    query: VoiceAgentRecordingQuery,
  ): Promise<VoiceAgentRecording[]> {
    const params = new URLSearchParams();
    // Control id first: it is the handle Ringee holds from the moment the leg
    // is placed. The session id only ever arrives on an event, so filtering on
    // it answers "no recordings" for calls that were recorded perfectly well —
    // which is exactly how agent-call audio went missing.
    if (query.callControlId) {
      params.set("filter[call_control_id]", query.callControlId);
    } else if (query.callSessionId) {
      params.set("filter[call_session_id]", query.callSessionId);
    } else {
      return [];
    }

    const raw = await this.telnyxClient.get<{ data?: Record<string, any>[] }>(
      `/recordings?${params.toString()}`,
    );
    return (
      (raw?.data ?? [])
        // A recording still being written has no usable download URL yet.
        .filter((row) => row.status === "completed")
        .map((row) => ({
          providerRecordingId: String(row.id),
          callControlId: row.call_control_id ?? null,
          callSessionId: row.call_session_id ?? null,
          downloadUrl: row.download_urls?.mp3 ?? null,
          channels:
            row.channels === "dual" || row.channels === "single"
              ? row.channels
              : null,
          startedAt: row.recording_started_at
            ? new Date(row.recording_started_at)
            : null,
          endedAt: row.recording_ended_at
            ? new Date(row.recording_ended_at)
            : null,
          durationMillis:
            typeof row.duration_millis === "number"
              ? row.duration_millis
              : null,
        }))
    );
  }

  // ── Knowledge bases ──────────────────────────────────────────

  createKnowledgeStore(store: string): Promise<void> {
    return this.knowledgeStore.createBucket(store);
  }

  deleteKnowledgeStore(store: string): Promise<void> {
    return this.knowledgeStore.deleteBucket(store);
  }

  putKnowledgeDocument(
    store: string,
    fileName: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    return this.knowledgeStore.putObject(store, fileName, body, contentType);
  }

  readKnowledgeDocument(
    store: string,
    fileName: string,
  ): Promise<{ body: Buffer; contentType: string }> {
    return this.knowledgeStore.getObject(store, fileName);
  }

  deleteKnowledgeDocument(store: string, fileName: string): Promise<void> {
    return this.knowledgeStore.deleteObject(store, fileName);
  }

  indexKnowledgeStore(store: string): Promise<string> {
    return this.startEmbedding("/ai/embeddings", { bucket_name: store });
  }

  indexKnowledgeUrl(store: string, url: string): Promise<string> {
    return this.startEmbedding("/ai/embeddings/url", {
      bucket_name: store,
      url,
    });
  }

  /**
   * Opens an embedding task, retrying the provider's own transient failures.
   *
   * The bytes are already in the bucket by the time this runs, so a single
   * `503` here costs the user the whole upload: the source is marked failed and
   * nothing ever re-reads it. Retrying a handful of times turns the provider's
   * most common blip into a slower success instead of a lost document — and a
   * `400` still fails immediately, because repeating a rejected request only
   * delays telling the user what is actually wrong.
   */
  private async startEmbedding(
    path: string,
    body: Record<string, unknown>,
  ): Promise<string> {
    for (let attempt = 1; ; attempt++) {
      try {
        const raw = await this.telnyxClient.post<{
          data?: { task_id?: string };
        }>(path, body);
        const taskId = raw?.data?.task_id;
        if (!taskId) throw new Error("Telnyx returned no embedding task id");
        return taskId;
      } catch (error) {
        if (attempt >= EMBEDDING_ATTEMPTS || !this.isRetryable(error))
          throw error;
        this.logger.warn(
          `${path} failed on attempt ${attempt}/${EMBEDDING_ATTEMPTS} for ${
            body.bucket_name
          }; retrying`,
        );
        await this.pause(EMBEDDING_RETRY_MS * attempt);
      }
    }
  }

  private isRetryable(error: unknown): boolean {
    const status = this.statusOf(error);
    // No status at all is a transport failure (DNS, socket, timeout), which is
    // exactly the kind of thing a second attempt fixes.
    return status === null || RETRYABLE_STATUSES.has(status);
  }

  private statusOf(error: unknown): number | null {
    const candidate = error as {
      status?: number;
      getStatus?: () => number;
    } | null;
    if (typeof candidate?.getStatus === "function") {
      return candidate.getStatus.call(error);
    }
    return typeof candidate?.status === "number" ? candidate.status : null;
  }

  private pause(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getIndexingStatus(taskId: string): Promise<VoiceAgentEmbeddingStatus> {
    const raw = await this.telnyxClient.get<{ data?: { status?: string } }>(
      `/ai/embeddings/${taskId}`,
    );
    switch (raw?.data?.status) {
      case "success":
      case "partial_success":
        return "ready";
      case "failure":
        return "failed";
      case "processing":
        return "processing";
      default:
        return "pending";
    }
  }

  private isNotFound(error: unknown): boolean {
    return this.statusOf(error) === 404;
  }
}
