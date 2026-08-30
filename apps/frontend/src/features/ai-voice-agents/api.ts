'use client';

import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useMemo } from 'react';
import type {
  CompanyProfile,
  Paginated,
  TestSession,
  VoiceAgent,
  VoiceAgentCall,
  VoiceAgentCallResult,
  VoiceAgentExtractionField,
  VoiceAgentKnowledgeSource,
  VoiceAgentModelOption,
  VoiceAgentModelProvider,
  VoiceAgentType,
  VoiceAgentTypeInfo,
  VoiceAgentVoice
} from './types';

const BASE = '/ai-voice-agents';

export interface SaveAgentBody {
  name?: string;
  type?: VoiceAgentType;
  modelProvider?: VoiceAgentModelProvider;
  apiKey?: string;
  voiceId?: string | null;
  analysis?: { summary?: boolean; sentiment?: boolean };
  extractionFields?: VoiceAgentExtractionField[];
  calendarIntegrationId?: string | null;
  meetingDurationMinutes?: number;
  timezone?: string | null;
  meetingTitle?: string | null;
}

/**
 * One typed client for the module. Components call these instead of building
 * paths inline, so a route rename is a single edit and every caller shares the
 * same response types.
 */
export function useVoiceAgentApi() {
  const api = useApi();

  return useMemo(
    () => ({
      listTypes: () => api.get<VoiceAgentTypeInfo[]>(`${BASE}/types`),
      listVoices: () => api.get<VoiceAgentVoice[]>(`${BASE}/voices`),
      listModels: () => api.get<VoiceAgentModelOption[]>(`${BASE}/models`),

      verifyCredential: (provider: VoiceAgentModelProvider, apiKey: string) =>
        api.post<{ valid: boolean; reason?: string }>(
          `${BASE}/credentials/verify`,
          { provider, apiKey }
        ),

      getCompanyProfile: () =>
        api.get<CompanyProfile | null>(`${BASE}/company-profile`),
      saveCompanyProfile: (body: CompanyProfile) =>
        api.patch<CompanyProfile>(`${BASE}/company-profile`, body),
      generateCompanyDescription: (website: string) =>
        api.post<{ description: string }>(`${BASE}/company-profile/generate`, {
          website
        }),

      list: () => api.get<Paginated<VoiceAgent>>(BASE),
      get: (id: string) => api.get<VoiceAgent>(`${BASE}/${id}`),
      create: (body: SaveAgentBody) => api.post<VoiceAgent>(BASE, body),
      update: (id: string, body: SaveAgentBody) =>
        api.patch<VoiceAgent>(`${BASE}/${id}`, body),
      remove: (id: string) => api.delete<{ deleted: boolean }>(`${BASE}/${id}`),
      setStatus: (id: string, status: 'active' | 'disabled') =>
        api.post<VoiceAgent>(`${BASE}/${id}/status`, { status }),

      listKnowledge: (id: string) =>
        api.get<VoiceAgentKnowledgeSource[]>(`${BASE}/${id}/knowledge`),
      addKnowledgeUrl: (id: string, url: string, label?: string) =>
        api.post<VoiceAgentKnowledgeSource>(`${BASE}/${id}/knowledge/url`, {
          url,
          label
        }),
      addKnowledgeText: (id: string, label: string, content: string) =>
        api.post<VoiceAgentKnowledgeSource>(`${BASE}/${id}/knowledge/text`, {
          label,
          content
        }),
      addKnowledgeDocument: (id: string, file: File) => {
        const form = new FormData();
        form.append('file', file);
        return api.upload<VoiceAgentKnowledgeSource>(
          `${BASE}/${id}/knowledge/document`,
          form
        );
      },
      removeKnowledge: (id: string, sourceId: string) =>
        api.delete<{ removed: boolean }>(`${BASE}/${id}/knowledge/${sourceId}`),

      startCall: (
        id: string,
        body: {
          to: string;
          from_number_id?: string;
          variables?: Record<string, string>;
          metadata?: Record<string, unknown>;
        }
      ) =>
        api.post<{ id: string; status: string }>(`${BASE}/${id}/calls`, body),
      listCalls: (id: string, page = 1) =>
        api.get<Paginated<VoiceAgentCall>>(`${BASE}/${id}/calls`, {
          page: String(page)
        }),
      getCall: (callId: string) =>
        api.get<VoiceAgentCallResult>(`${BASE}/calls/${callId}`),

      startTestSession: (id: string, variables?: Record<string, string>) =>
        api.post<TestSession>(`${BASE}/${id}/test-session`, { variables }),
      endTestSession: (id: string) =>
        api.delete<{ closed: boolean }>(`${BASE}/${id}/test-session`)
    }),
    [api]
  );
}
