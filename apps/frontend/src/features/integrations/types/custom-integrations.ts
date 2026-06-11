export type CustomIntegrationStatus = 'active' | 'disabled';

export type CustomIntegrationEventType =
  | 'call_completed'
  | 'call_outcome_updated'
  | 'note_created'
  | 'callback_created'
  | 'meeting_created'
  | 'recording_ready'
  | 'call_missed'
  | 'call_failed'
  | 'dnc_created';

export type CustomIntegrationInboundStatus =
  | 'received'
  | 'processing'
  | 'processed'
  | 'failed'
  | 'skipped';

export type CustomIntegrationDeliveryStatus =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'failed';

export interface CustomIntegrationSummary {
  id: string;
  name: string;
  status: CustomIntegrationStatus;
  apiKeyPrefix: string;
  apiKeyLastUsedAt: string | null;
  outboundUrl: string | null;
  subscribedEvents: CustomIntegrationEventType[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomIntegrationWithSecrets extends CustomIntegrationSummary {
  apiKey?: string;
  signingSecret?: string;
}

export interface CustomIntegrationInboundLog {
  id: string;
  integrationId: string;
  eventType: string;
  externalEventId: string;
  status: CustomIntegrationInboundStatus;
  receivedAt: string;
  processedAt: string | null;
  errorMessage: string | null;
  rawPayload: Record<string, unknown>;
}

export interface CustomIntegrationDeliveryLog {
  id: string;
  integrationId: string;
  eventType: CustomIntegrationEventType;
  subjectId: string | null;
  destinationUrl: string;
  payload: Record<string, unknown>;
  signature: string | null;
  status: CustomIntegrationDeliveryStatus;
  attemptCount: number;
  lastError: string | null;
  nextAttemptAt: string;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventFieldSpec {
  name: string;
  type: string;
  description: string;
}

export interface CustomIntegrationEventSpec {
  name: string;
  direction: 'inbound' | 'outbound';
  description: string;
  whenItFires: string;
  requiredFields: EventFieldSpec[];
  optionalFields: EventFieldSpec[];
  examplePayload: Record<string, unknown>;
  notes: string[];
}

export interface TestWebhookResult {
  ok: boolean;
  statusCode?: number;
  latencyMs: number;
  error?: string;
}

export const ALL_OUTBOUND_EVENTS: {
  value: CustomIntegrationEventType;
  label: string;
}[] = [
  { value: 'call_completed', label: 'call.completed' },
  { value: 'call_outcome_updated', label: 'call.outcome.updated' },
  { value: 'note_created', label: 'note.created' },
  { value: 'callback_created', label: 'callback.created' },
  { value: 'meeting_created', label: 'meeting.created' },
  { value: 'recording_ready', label: 'recording.ready' },
  { value: 'call_missed', label: 'call.missed' },
  { value: 'call_failed', label: 'call.failed' },
  { value: 'dnc_created', label: 'dnc.created' }
];
