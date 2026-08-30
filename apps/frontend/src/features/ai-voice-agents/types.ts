/**
 * Shapes the AI Voice Agents API returns. Kept in one place so a change to the
 * contract is a single edit here rather than a hunt through components.
 */

export type VoiceAgentType = 'appointment_booking' | 'reminders_notifications';

export type VoiceAgentStatus = 'draft' | 'active' | 'disabled' | 'error';

export type VoiceAgentModelProvider =
  | 'ringee'
  | 'openai'
  | 'anthropic'
  | 'google';

export interface VoiceAgentVariable {
  key: string;
  label: string;
  required: boolean;
  description: string;
}

export interface VoiceAgentTypeInfo {
  type: VoiceAgentType;
  title: string;
  summary: string;
  requiresCalendar: boolean;
  variables: VoiceAgentVariable[];
  outcomes: string[];
}

export interface VoiceAgentVoice {
  id: string;
  displayName: string;
  description: string | null;
  language: string;
  locale: string | null;
  accent: string | null;
  gender: 'female' | 'male' | 'unspecified';
}

export interface VoiceAgentModelOption {
  provider: VoiceAgentModelProvider;
  requiresApiKey: boolean;
}

export type ExtractionFieldType = 'text' | 'number' | 'boolean' | 'select';

export interface VoiceAgentExtractionField {
  key: string;
  label: string;
  type: ExtractionFieldType;
  description: string;
  options?: string[];
}

export interface VoiceAgentAnalysisSettings {
  summary: boolean;
  outcome: boolean;
  sentiment: boolean;
}

export interface VoiceAgentKnowledgeSource {
  id: string;
  kind: 'url' | 'pdf' | 'txt' | 'docx' | 'text';
  label: string;
  sourceUrl: string | null;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  lastError: string | null;
  createdAt: string;
}

export interface VoiceAgent {
  id: string;
  name: string;
  type: VoiceAgentType;
  status: VoiceAgentStatus;
  modelProvider: VoiceAgentModelProvider;
  voiceId: string | null;
  voiceLabel: string | null;
  voiceLanguage: string | null;
  analysisSettings: VoiceAgentAnalysisSettings | null;
  extractionFields: VoiceAgentExtractionField[] | null;
  calendarIntegrationId: string | null;
  meetingDurationMinutes: number;
  timezone: string | null;
  meetingTitle: string | null;
  lastError: string | null;
  createdAt: string;
  knowledgeSources?: VoiceAgentKnowledgeSource[];
  callCount?: number;
}

export interface VoiceAgentCall {
  id: string;
  toNumber: string;
  fromNumber: string;
  status: string;
  outcome: string | null;
  summary: string | null;
  sentiment: string | null;
  extractedData: Record<string, unknown> | null;
  createdAt: string;
}

export interface VoiceAgentCallResult {
  call_id: string;
  status: string;
  outcome: string | null;
  summary: string | null;
  sentiment: string | null;
  extracted_data: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface CompanyProfile {
  companyName: string | null;
  companyWebsite: string | null;
  companyDescription: string | null;
}

export interface TestSession {
  assistantId: string;
  expiresAt: string;
  variables: VoiceAgentVariable[];
}
