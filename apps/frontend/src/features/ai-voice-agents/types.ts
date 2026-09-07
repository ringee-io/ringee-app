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
  /** ISO 3166-1 alpha-2, e.g. "MX". Null when the provider reports no region. */
  countryCode: string | null;
  accent: string | null;
  gender: 'female' | 'male' | 'unspecified';
  custom?: {
    id: string;
    status: 'pending' | 'ready' | 'failed' | 'expired';
    lastError: string | null;
  };
}

/** A rendered sample of one voice, playable straight from the response. */
export interface VoiceAgentVoicePreview {
  voiceId: string;
  text: string;
  contentType: string;
  audioBase64: string;
}

/**
 * A model the user can put behind an agent. `modelId` and `hosting` are shown:
 * choosing between Ringee AI and your own key is choosing between two named
 * models, and the version is what says which one you are getting.
 */
export interface VoiceAgentModelOption {
  provider: VoiceAgentModelProvider;
  /** Provider-side model id, e.g. "moonshotai/Kimi-K2.6". */
  modelId: string;
  displayName: string;
  hosting: 'ringee' | 'byok';
  recommended: boolean;
  summary: string;
  requiresApiKey: boolean;
}

/**
 * A number this workspace can present on an AI agent call. The server decides
 * what is eligible — the picker only shows what it returns.
 */
export interface VoiceAgentCallerNumber {
  id: string;
  phoneNumber: string;
  isoCountry: string;
  kind: 'purchased' | 'verified_caller_id';
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

export type VoiceAgentGreetingMode =
  | 'assistant_speaks_first'
  | 'assistant_generates_greeting'
  | 'assistant_waits_for_user';

export interface VoiceAgentConversationSettings {
  greetingMode: VoiceAgentGreetingMode;
  greeting: string;
  /** Markdown source shown in both the visual and raw editor modes. */
  instructions: string;
  postConversationEnabled: boolean;
  postConversationInstructions: string;
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

/**
 * A source that lives on another agent in the workspace, offered for reuse.
 * `alreadyAdded` is the server's answer to "is this the same thing I already
 * have", so the picker can say so instead of letting the user create a
 * duplicate and find out afterwards.
 */
export interface VoiceAgentKnowledgeLibraryEntry {
  id: string;
  kind: VoiceAgentKnowledgeSource['kind'];
  label: string;
  sourceUrl: string | null;
  status: VoiceAgentKnowledgeSource['status'];
  createdAt: string;
  agentId: string;
  agentName: string;
  alreadyAdded: boolean;
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
  companyName: string | null;
  companyWebsite: string | null;
  companyDescription: string | null;
  analysisSettings: VoiceAgentAnalysisSettings | null;
  extractionFields: VoiceAgentExtractionField[] | null;
  /** Resolved blueprint defaults on the detail endpoint. */
  conversationSettings?: VoiceAgentConversationSettings | null;
  /** The number the agent calls from; null means "choose it at trigger time". */
  callerNumberId: string | null;
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
  /** Linked telephony call; null while the provider has not accepted the leg. */
  callId: string | null;
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

/** A company context already written in the workspace, offered for reuse. */
export interface ReusableCompanyContext extends CompanyProfile {
  /** The agent it belongs to, or null for the workspace-level fallback. */
  agentId: string | null;
  label: string;
}

/**
 * A connected calendar, as the agent form needs it. `/calendar/integrations`
 * returns more than this — only these fields are read here.
 */
export interface CalendarIntegrationOption {
  id: string;
  provider: string;
  email: string | null;
  isActive: boolean;
}

export interface TestSession {
  assistantId: string;
  expiresAt: string;
  variables: VoiceAgentVariable[];
}

/** Server-calculated price for one successfully created human voice clone. */
export interface VoiceCloneQuote {
  amountUsd: number;
  currency: 'USD';
  canAfford: boolean;
}

export interface VoiceCloneReadingSample {
  language: string;
  text: string;
}
