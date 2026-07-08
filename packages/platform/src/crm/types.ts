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
  supportsMeetings: boolean;
  supportsRecordingUpload: boolean;
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
  /** Video-meeting join URL (e.g. Google Meet) when a meeting was booked. */
  meetingUrl?: string | null;
  linkedRecords: CrmRecordRef[];
  needsPersonCreation?: {
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phoneE164: string;
  } | null;
};

/**
 * Result of logging a call. Splits the two distinct entities a provider may
 * produce so callers never conflate them:
 * - `record`: the person/company the call was logged against. This is what
 *   later follow-ups (recording/transcript notes, file uploads) must target.
 * - `activityId`: the id of the note/activity entity created for the call, if
 *   the provider makes a separate one (e.g. Attio note_id). `null` when the
 *   provider logs into the record itself without a distinct activity id.
 */
export type CrmCallLogResult = {
  record: CrmRecordRef;
  activityId?: string | null;
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

export type CrmMeetingInput = {
  idempotencyKey: string;
  ringeeMeetingId: string;
  callId?: string | null;
  title: string;
  description?: string | null;
  startAt: Date;
  endAt: Date;
  timezone?: string | null;
  meetingUrl?: string | null;
  ringeeMeetingUrl?: string | null;
  calendarProvider?: string | null;
  calendarEventId?: string | null;
  recordingUrl?: string | null;
  sourceCallUrl?: string | null;
  attendees: Array<{ email?: string | null; name?: string | null }>;
  ownerName?: string | null;
  ownerEmail?: string | null;
  linkedRecords: CrmRecordRef[];
};

export type CrmMeetingSyncResult = {
  ref: CrmRecordRef;
  syncMode: string;
};

export type CrmRecordingUploadInput = {
  idempotencyKey: string;
  recordingId: string;
  callId: string;
  fileName: string;
  fileBuffer: Buffer;
  fileMimeType: string;
  fileSizeBytes: number;
  linkedRecords: CrmRecordRef[];
};

export type CrmRecordingUploadResult = {
  ref: CrmRecordRef;
  externalFileId?: string | null;
  syncMode: string;
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
