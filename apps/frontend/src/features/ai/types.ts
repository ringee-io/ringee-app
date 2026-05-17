export type AiAgentId =
  | 'prospecting_expert'
  | 'campaign_builder'
  | 'crm'
  | 'call_coach'
  | 'analytics';

/**
 * The three prospecting entry modes. Each starts a conversation from a
 * different kind of input and gives the agent a distinct playbook.
 */
export type ProspectingMode = 'icp' | 'customers' | 'signals';

export interface AiAgentDescriptor {
  id: AiAgentId;
  label: string;
  description: string;
  active: boolean;
  comingSoon?: boolean;
}

export interface AiConversation {
  id: string;
  userId: string;
  organizationId: string | null;
  agent: AiAgentId;
  title: string | null;
  providerSelection: string | null;
  agentState: Record<string, unknown> | null;
  summary: string | null;
  /** Running total of AI credits consumed by this conversation. */
  totalCostCredits: number;
  lastMessageAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AiMessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type AiMessageStatus = 'pending' | 'streaming' | 'completed' | 'failed';

export interface AiMessage {
  id: string;
  conversationId: string;
  role: AiMessageRole;
  status: AiMessageStatus;
  content: string | null;
  toolName: string | null;
  toolPayload: Record<string, unknown> | null;
  createdAt: string;
  // Token usage + cost (populated on assistant turns).
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedTokens?: number | null;
  cacheWriteTokens?: number | null;
  costCredits?: number | null;
}

/** Per-message token usage carried by the `usage` SSE event. */
export interface AiUsageInfo {
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  costCredits: number;
}

export interface ProspectWorkHistoryEntry {
  company: string | null;
  title: string | null;
  current: boolean | null;
}

export interface ProspectEducationEntry {
  school: string | null;
  degree: string | null;
  field: string | null;
}

export interface ProspectPersonDetails {
  firstName: string | null;
  lastName: string | null;
  headline: string | null;
  summary: string | null;
  jobTitle: string | null;
  seniority: string | null;
  department: string | null;
  yearsExperience: number | null;
  linkedinUrl: string | null;
  twitterUrl: string | null;
  githubUrl: string | null;
  facebookUrl: string | null;
  websiteUrl: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  timezone: string | null;
  languages: string[];
  skills: string[];
  emailCount: number;
  verifiedEmailCount: number;
  phoneCount: number;
  workHistory: ProspectWorkHistoryEntry[];
  education: ProspectEducationEntry[];
}

export interface ProspectCompanyDetails {
  name: string | null;
  legalName: string | null;
  domain: string | null;
  website: string | null;
  description: string | null;
  industry: string | null;
  subIndustry: string | null;
  size: string | null;
  employeeCount: number | null;
  employeeCountRange: string | null;
  revenueRange: string | null;
  fundingStage: string | null;
  foundedYear: number | null;
  companyType: string | null;
  linkedinUrl: string | null;
  logoUrl: string | null;
  location: string | null;
  technologies: string[];
  keywords: string[];
}

export interface ProspectDetails {
  person: ProspectPersonDetails;
  company: ProspectCompanyDetails | null;
}

export interface ProspectPreview {
  externalId: string;
  jobId: string;
  provider: string;
  fullName: string | null;
  jobTitle: string | null;
  company: string | null;
  location: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
  fitScore: number;
  confidence: number | null;
  reasons: string[];
  /** Public LinkedIn profile URL, when the provider returned one. */
  linkedinUrl: string | null;
  /** Full normalized provider data for the detail modal. */
  details: ProspectDetails;
}

export interface AiToolEvent {
  id: string;
  conversationId: string;
  messageId: string | null;
  kind: string;
  payload: Record<string, unknown>;
  resolved: boolean;
  resolvedAt: string | null;
  resolutionData: Record<string, unknown> | null;
  createdAt: string;
}

export interface StreamMessage {
  type: string;
  [key: string]: unknown;
}
