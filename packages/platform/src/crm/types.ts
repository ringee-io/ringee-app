import { CrmProviderType, CrmRecordType } from "@ringee/database";

export type CrmScope = "personal" | "organization";

export type CrmTokenSet = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes?: string[];
};

export type CrmCredentials = {
  accessToken: string;
  refreshToken?: string | null;
  accountId: string;
  connectionId: string;
};

export type CrmCapabilities = {
  supportsCompanies: boolean;
  supportsTasks: boolean;
  supportsLists: boolean;
  supportsRecordingUrl: boolean;
  supportsTranscript: boolean;
  supportsCallObject: boolean;
  maxNoteLength: number;
  rateLimit: { requestsPerMinute: number; burst: number };
};

export type CrmWorkspaceInfo = {
  accountId: string;
  accountName: string | null;
  capabilities?: Partial<CrmCapabilities>;
  metadata?: Record<string, unknown>;
};

export type CrmRecordRef = {
  externalId: string;
  externalType: CrmRecordType;
};

export type CrmRecordMatch = CrmRecordRef & {
  displayName: string;
  phoneNumbers: string[];
  emails: string[];
  matchedOn: "phone_exact" | "phone_suffix";
  raw?: unknown;
};

export type CrmCallDirection = "inbound" | "outbound";

export type CrmCallLogInput = {
  idempotencyKey: string;
  ringeeCallId: string;
  direction: CrmCallDirection;
  from: string;
  to: string;
  startedAt: Date;
  endedAt?: Date | null;
  durationSeconds?: number | null;
  outcome?: string | null;
  outcomeLabel?: string | null;
  notes?: string | null;
  recordingUrl?: string | null;
  transcriptUrl?: string | null;
  transcript?: string | null;
  summary?: string | null;
  insights?: Record<string, unknown> | null;
  agentName?: string | null;
  agentEmail?: string | null;
  linkedRecords: CrmRecordRef[];
  needsPersonCreation?: {
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phoneE164: string;
  } | null;
};

export type CrmNoteInput = {
  recordId: string;
  recordType: CrmRecordType;
  title?: string | null;
  body: string;
  idempotencyKey?: string;
};

export type CrmTaskInput = {
  title: string;
  body?: string | null;
  dueAt?: Date | null;
  assigneeEmail?: string | null;
  linkedRecords: CrmRecordRef[];
  idempotencyKey?: string;
};

export type CrmPersonInput = {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phoneE164: string;
  company?: string | null;
  idempotencyKey?: string;
};

export type CrmCompanyInput = {
  name: string;
  domain?: string | null;
  phoneE164?: string | null;
  industry?: string | null;
  size?: string | null;
  website?: string | null;
  idempotencyKey?: string;
};

export type CrmCompanyMatch = CrmRecordRef & {
  name: string;
  domain: string | null;
  matchedOn: "domain_exact" | "name_exact" | "phone_suffix";
  raw?: unknown;
};

export type CrmOwnerRef = {
  externalId: string;
  email: string | null;
  name: string | null;
};

export type CrmContactSyncResult = {
  contact: CrmRecordRef;
  phones: string[];
  emails: string[];
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  jobTitle: string | null;
  owner: CrmOwnerRef | null;
  company: CrmRecordRef | null;
  customFields: Record<string, unknown>;
  raw: unknown;
};

export type CrmCompanySyncResult = {
  company: CrmRecordRef;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  phone: string | null;
  website: string | null;
  customFields: Record<string, unknown>;
  raw: unknown;
};

export type CrmListRef = {
  externalId: string;
  name: string;
  memberCount?: number;
};

export type CrmPagedResult<T> = {
  data: T[];
  nextPageToken: string | null;
};

export type CrmAuthorizeParams = {
  state: string;
  redirectUri: string;
  scope?: string[];
};

export type CrmExchangeParams = {
  code: string;
  redirectUri: string;
};

export { CrmProviderType, CrmRecordType };
