export type AiAgentId =
  | 'prospecting_expert'
  | 'campaign_builder'
  | 'crm'
  | 'call_coach'
  | 'analytics';

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
  suggestedCallAngle: string | null;
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
