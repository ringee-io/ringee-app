import { Injectable } from "@nestjs/common";
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
} from "./interfaces/voice-agent.provider";
import { TelnyxVoiceAgentService } from "./telnyx/telnyx.voice-agent.service";

/**
 * The dispatcher every service talks to. One `telnyx` case today; a second
 * voice-AI provider plugs in at `getServiceProvider()` without the domain
 * learning about it — the same shape as `TelephonyService`.
 */
@Injectable()
export class VoiceAgentProviderService implements VoiceAgentProvider {
  constructor(private readonly telnyx: TelnyxVoiceAgentService) {}

  private getServiceProvider(provider = "telnyx"): VoiceAgentProvider {
    switch (provider) {
      default:
        return this.telnyx;
    }
  }

  createAssistant(config: VoiceAgentConfig): Promise<VoiceAgentAssistant> {
    return this.getServiceProvider().createAssistant(config);
  }

  updateAssistant(
    assistantId: string,
    config: VoiceAgentConfig,
  ): Promise<VoiceAgentAssistant> {
    return this.getServiceProvider().updateAssistant(assistantId, config);
  }

  getAssistant(assistantId: string): Promise<VoiceAgentAssistant | null> {
    return this.getServiceProvider().getAssistant(assistantId);
  }

  deleteAssistant(assistantId: string): Promise<void> {
    return this.getServiceProvider().deleteAssistant(assistantId);
  }

  configureTestAccess(
    assistantId: string,
    options: {
      enabled: boolean;
      dynamicVariables?: Record<string, string>;
    },
  ): Promise<void> {
    return this.getServiceProvider().configureTestAccess(assistantId, options);
  }

  startCall(request: VoiceAgentCallRequest): Promise<VoiceAgentCallHandle> {
    return this.getServiceProvider().startCall(request);
  }

  createInsightGroup(name: string): Promise<string> {
    return this.getServiceProvider().createInsightGroup(name);
  }

  deleteInsightGroup(groupId: string): Promise<void> {
    return this.getServiceProvider().deleteInsightGroup(groupId);
  }

  createInsight(
    groupId: string,
    definition: VoiceAgentInsightDefinition,
  ): Promise<string> {
    return this.getServiceProvider().createInsight(groupId, definition);
  }

  updateInsight(
    insightId: string,
    definition: VoiceAgentInsightDefinition,
  ): Promise<void> {
    return this.getServiceProvider().updateInsight(insightId, definition);
  }

  deleteInsight(groupId: string, insightId: string): Promise<void> {
    return this.getServiceProvider().deleteInsight(groupId, insightId);
  }

  storeSecret(identifier: string, token: string): Promise<string> {
    return this.getServiceProvider().storeSecret(identifier, token);
  }

  deleteSecret(identifier: string): Promise<void> {
    return this.getServiceProvider().deleteSecret(identifier);
  }

  listVoices(): Promise<VoiceAgentVoice[]> {
    return this.getServiceProvider().listVoices();
  }

  renderVoicePreview(
    voiceId: string,
    text: string,
  ): Promise<{ audio: Buffer; contentType: string }> {
    return this.getServiceProvider().renderVoicePreview(voiceId, text);
  }

  fetchUsageRecords(
    query: VoiceAgentUsageQuery,
  ): Promise<VoiceAgentUsageRecord[]> {
    return this.getServiceProvider().fetchUsageRecords(query);
  }

  createKnowledgeStore(store: string): Promise<void> {
    return this.getServiceProvider().createKnowledgeStore(store);
  }

  deleteKnowledgeStore(store: string): Promise<void> {
    return this.getServiceProvider().deleteKnowledgeStore(store);
  }

  putKnowledgeDocument(
    store: string,
    fileName: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    return this.getServiceProvider().putKnowledgeDocument(
      store,
      fileName,
      body,
      contentType,
    );
  }

  deleteKnowledgeDocument(store: string, fileName: string): Promise<void> {
    return this.getServiceProvider().deleteKnowledgeDocument(store, fileName);
  }

  indexKnowledgeStore(store: string): Promise<string> {
    return this.getServiceProvider().indexKnowledgeStore(store);
  }

  indexKnowledgeUrl(store: string, url: string): Promise<string> {
    return this.getServiceProvider().indexKnowledgeUrl(store, url);
  }

  getIndexingStatus(taskId: string): Promise<VoiceAgentEmbeddingStatus> {
    return this.getServiceProvider().getIndexingStatus(taskId);
  }
}
