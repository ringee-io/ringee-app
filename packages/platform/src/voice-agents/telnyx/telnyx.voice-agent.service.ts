import { Injectable, Logger } from "@nestjs/common";
import { TelnyxClient } from "../../telephony/telnyx/telnyx.client";
import { TelnyxKnowledgeStore } from "./telnyx.knowledge.store";
import type {
  VoiceAgentAssistant,
  VoiceAgentCallHandle,
  VoiceAgentCallRequest,
  VoiceAgentConfig,
  VoiceAgentEmbeddingStatus,
  VoiceAgentInsightDefinition,
  VoiceAgentProvider,
  VoiceAgentUsageQuery,
  VoiceAgentUsageRecord,
  VoiceAgentVoice,
} from "../interfaces/voice-agent.provider";
import { curateVoices, type RawProviderVoice } from "../voices.catalog";
import {
  toAssistantPayload,
  toVoiceAgentAssistant,
  type TelnyxAssistantResponse,
} from "./telnyx.voice-agent.mapper";

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
    try {
      const raw = await this.telnyxClient.get<
        TelnyxAssistantResponse | { data: TelnyxAssistantResponse }
      >(`/ai/assistants/${assistantId}`);
      const body = "data" in raw ? raw.data : raw;
      return body?.id ? toVoiceAgentAssistant(body) : null;
    } catch (error) {
      if (this.isNotFound(error)) return null;
      throw error;
    }
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
    await this.telnyxClient.post(`/ai/assistants/${assistantId}`, {
      telephony_settings: {
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
    const current = await this.getAssistant(assistantId);
    return current?.unauthenticatedWebCallsEnabled ?? false;
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
        ...(request.record === undefined ? {} : { Record: request.record }),
      },
    );

    const body = raw?.data ?? raw ?? {};
    return {
      providerCallId: body.sid ?? body.call_sid ?? null,
      callControlId: body.call_control_id ?? null,
      callSessionId: body.call_session_id ?? null,
    };
  }

  // ── Post-call analysis ───────────────────────────────────────

  async createInsightGroup(name: string): Promise<string> {
    const raw = await this.telnyxClient.post<{ data?: { id: string } }>(
      "/ai/conversations/insight-groups",
      { name },
    );
    const id = raw?.data?.id;
    if (!id) throw new Error("Telnyx returned no insight group id");
    return id;
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
    // stored has to be resolved first.
    const list = await this.telnyxClient.get<{
      data?: Array<{ id: string; identifier: string }>;
    }>("/integration_secrets");
    const match = list?.data?.find((row) => row.identifier === identifier);
    if (!match) return;
    try {
      await this.telnyxClient.delete(`/integration_secrets/${match.id}`);
    } catch (error) {
      if (!this.isNotFound(error)) throw error;
    }
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

  // ── Usage ────────────────────────────────────────────────────

  /**
   * Reads the provider's own billing records for a conversation. Records land
   * with a lag after the call ends, so an empty result means "not yet", never
   * "free" — the caller retries rather than settling at zero.
   */
  async fetchUsageRecords(
    query: VoiceAgentUsageQuery,
  ): Promise<VoiceAgentUsageRecord[]> {
    const kinds: Array<{
      recordType: string;
      kind: VoiceAgentUsageRecord["kind"];
    }> = [
      { recordType: "ai-voice-assistant", kind: "voice_agent" },
      { recordType: "inference", kind: "inference" },
    ];

    const results = await Promise.all(
      kinds.map(({ recordType, kind }) =>
        this.fetchRecordsOfType(recordType, kind, query),
      ),
    );
    return results.flat();
  }

  private async fetchRecordsOfType(
    recordType: string,
    kind: VoiceAgentUsageRecord["kind"],
    query: VoiceAgentUsageQuery,
  ): Promise<VoiceAgentUsageRecord[]> {
    const params = new URLSearchParams();
    params.set("filter[record_type]", recordType);
    if (query.conversationId) {
      params.set("filter[conversation_id]", query.conversationId);
    }
    if (query.callControlId && !query.conversationId) {
      params.set("filter[call_control_id]", query.callControlId);
    }
    params.set("page[size]", "50");

    try {
      const raw = await this.telnyxClient.get<{ data?: Record<string, any>[] }>(
        `/detail_records?${params.toString()}`,
      );
      return (raw?.data ?? []).map((row) => ({
        kind,
        conversationId: row.conversation_id ?? null,
        callControlId: row.call_control_id ?? null,
        costUsd: Number.parseFloat(row.cost ?? "0") || 0,
        billedSeconds:
          typeof row.billed_sec === "number" ? row.billed_sec : null,
        occurredAt: row.created_at ? new Date(row.created_at) : null,
      }));
    } catch (error) {
      // One record type being unavailable must not hide the other; the caller
      // decides whether a partial answer is enough to settle on.
      this.logger.warn(
        `Could not read ${recordType} usage records: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
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

  async indexKnowledgeStore(store: string): Promise<string> {
    const raw = await this.telnyxClient.post<{ data?: { task_id?: string } }>(
      "/ai/embeddings",
      { bucket_name: store },
    );
    const taskId = raw?.data?.task_id;
    if (!taskId) throw new Error("Telnyx returned no embedding task id");
    return taskId;
  }

  async indexKnowledgeUrl(store: string, url: string): Promise<string> {
    const raw = await this.telnyxClient.post<{ data?: { task_id?: string } }>(
      "/ai/embeddings/url",
      { bucket_name: store, url },
    );
    const taskId = raw?.data?.task_id;
    if (!taskId) throw new Error("Telnyx returned no embedding task id");
    return taskId;
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
    const status = (error as { status?: number; getStatus?: () => number })
      ?.status;
    if (status === 404) return true;
    const getStatus = (error as { getStatus?: () => number })?.getStatus;
    return typeof getStatus === "function" && getStatus.call(error) === 404;
  }
}
