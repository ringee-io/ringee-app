/**
 * Typed shapes for the data returned by the Ringee backend/MCP tools.
 *
 * These mirror the JSON the MCP tools serialize (see
 * `apps/backend/src/mcp/mcp.func.ts`). They are *contracts*, not business
 * logic — the backend remains the single source of truth.
 */

/**
 * How dangerous an action is. Drives confirmation gating in every interface
 * (CLI flags, Claude Skills wording, ChatGPT App button styles).
 *
 * - `read`        — pure reads, always safe.
 * - `write`       — create/update data, normal intent is enough.
 * - `sensitive`   — spends credits or mints shareable access (magic links);
 *                   requires explicit, informed confirmation.
 * - `destructive` — revokes access or deletes data; requires strict,
 *                   double confirmation.
 */
export type Sensitivity = "read" | "write" | "sensitive" | "destructive";

export type CallOutcome =
  | "meeting_booked"
  | "sale"
  | "interested"
  | "follow_up"
  | "callback_scheduled"
  | "not_interested"
  | "no_answer"
  | "voicemail"
  | "wrong_number"
  | "gatekeeper";

export type EnrichmentProvider = "apollo" | "prospeo";

export type CalendarProvider = "google" | "microsoft";

// ── Contacts ──────────────────────────────────────────────────────────

export interface ContactSummary {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string;
  email: string | null;
  company: string | null;
  jobTitle: string | null;
  state?: string | null;
  website?: string | null;
  revenue?: string | null;
  companySize?: string | null;
  lastCallAt?: string | null;
}

export interface SearchContactsResult {
  total: number;
  page: number;
  totalPages: number;
  /** Page size used for this result (echoed back for stable pagination). */
  limit?: number;
  /** The query that produced this result ("*" means "all contacts"). */
  query?: string;
  contacts: ContactSummary[];
}

/**
 * A contact returned by find_contacts_by_outcome: ICP-relevant attributes plus
 * the outcome/time of the most recent call. A superset of {@link ContactSummary}
 * so the same list components can render it.
 */
export interface OutcomeContactSummary extends ContactSummary {
  seniority: string | null;
  department: string | null;
  locationCountryCode: string | null;
  score: number | null;
  status: string | null;
  lifecycleStage: string | null;
  /** Outcome of the contact's most recent call, if any. */
  lastOutcome: CallOutcome | null;
}

export interface FindContactsByOutcomeResult {
  total: number;
  page: number;
  totalPages: number;
  /** Page size used for this result (echoed back for stable pagination). */
  limit?: number;
  /** Whether "any" call matched or only the "last" call was considered. */
  match: "any" | "last";
  /** The outcome set this result was filtered by (echoed for pagination). */
  outcomes: CallOutcome[];
  contacts: OutcomeContactSummary[];
}

/** Full contact record with activity. Shape is backend-defined; we keep the
 *  known fields strongly typed and allow the rest through. */
export interface ContactDetail extends ContactSummary {
  notes?: unknown[];
  calls?: unknown[];
  meetings?: unknown[];
  tags?: unknown[];
  [key: string]: unknown;
}

export interface MutateContactResult {
  ok: boolean;
  created?: boolean;
  updated?: boolean;
  contact?: ContactSummary;
  error?: string;
}

export interface DeleteContactResult {
  ok: boolean;
  deleted: boolean;
  contactId?: string;
  phoneNumber?: string;
  error?: string;
}

// ── Calls / outcomes / callbacks / meetings ───────────────────────────

export type CallStatus =
  | "pending"
  | "ringing"
  | "answered"
  | "recording"
  | "completed"
  | "failed";

/**
 * Full, human-facing detail of a call as returned by list_calls. Mirrors
 * `serializeCallDetail` in the backend MCP — deliberately omits cost and
 * low-level telephony plumbing.
 */
export interface CallDetail {
  id: string;
  direction: string | null;
  status: CallStatus | string;
  fromNumber: string;
  toNumber: string;
  startedAt: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  createdAt: string;
  durationSeconds: number | null;
  /** Human-readable duration, e.g. "3:12" or "1:02:05". */
  duration: string | null;
  outcome: CallOutcome | null;
  outcomeNote: string | null;
  contact: ContactSummary | null;
  recordingUrl: string | null;
  hasRecording: boolean;
  transcription: string | null;
  hasTranscription: boolean;
}

export interface ListCallsResult {
  total: number;
  page: number;
  totalPages: number;
  /** Page size used for this result (echoed back for stable pagination). */
  limit?: number;
  calls: CallDetail[];
}

export interface LogCallOutcomeResult {
  ok: boolean;
  callId: string;
  outcome: CallOutcome;
  outcomeNote?: string | null;
}

export interface CreateCallbackResult {
  ok: boolean;
  callbackId?: string;
  scheduledAt?: string;
  status?: string;
  error?: string;
}

export interface ScheduleMeetingResult {
  ok: boolean;
  meetingId?: string;
  scheduledAt?: string;
  duration?: number;
  status?: string;
  error?: string;
}

// ── Call sessions (magic-link dialing) ────────────────────────────────

export type CallSessionStatus =
  | "active"
  | "completed"
  | "expired"
  | "revoked"
  | string;

export interface CreateCallSessionResult {
  callSessionId: string;
  /** Magic link — share EXACTLY as returned. The raw token is embedded once
   *  and cannot be re-fetched. */
  joinUrl: string;
  expiresAt: string | null;
  contactsCount: number;
  status: CallSessionStatus;
}

export interface UpdateCallSessionResult {
  callSessionId: string;
  status: CallSessionStatus;
  updated: boolean;
}

export interface DeleteCallSessionResult {
  callSessionId: string;
  deleted: boolean;
  status: CallSessionStatus;
}

export interface CallSessionInfo {
  callSessionId: string;
  title: string | null;
  userId: string;
  organizationId: string | null;
  campaignId: string | null;
  status: CallSessionStatus;
  expiresAt: string | null;
  contactsCount: number;
  callsCompleted: number;
  /** Whether a usable magic-link token still exists. Token value is never
   *  exposed by reads. */
  joinUrlAvailable: boolean;
}

// ── Leads (Apollo / Prospeo prospecting) ──────────────────────────────

export interface LeadPersonPreview {
  fullName: string | null;
  jobTitle: string | null;
  seniority: string | null;
  department: string | null;
  linkedinUrl: string | null;
  location: string | null;
  emailsAvailable: boolean;
  phonesAvailable: boolean;
}

export interface LeadCompanyPreview {
  name: string | null;
  domain: string | null;
  industry: string | null;
  employeeCount: number | null;
}

export interface LeadCandidate {
  externalId: string;
  confidence: number | null;
  person: LeadPersonPreview;
  company: LeadCompanyPreview | null;
}

export interface SearchLeadsResult {
  ok: boolean;
  jobId: string;
  provider: EnrichmentProvider | string;
  cached: boolean;
  page: number;
  perPage: number;
  total: number;
  hasMore: boolean;
  results: LeadCandidate[];
}

export interface RevealLeadResult {
  ok: boolean;
  contactId: string;
  emailRevealed: boolean;
  phoneRevealed: boolean;
  person: {
    fullName: string | null;
    jobTitle: string | null;
    emails: string[];
    phones: string[];
  };
  company: { name: string | null; domain: string | null } | null;
}

export interface ImportLeadsResult {
  ok: boolean;
  imported: number;
  duplicates?: number;
  errors?: unknown[];
  contactIds: string[];
  error?: string;
}

// ── Workspaces (personal ⇆ organization scope) ────────────────────────

export interface Workspace {
  /** "personal" for the user's own account, or the organization id. */
  id: string;
  type: "personal" | "organization";
  name: string;
  /** Org role (e.g. "org:admin"); null for the personal workspace. */
  role: string | null;
  imageUrl: string | null;
  /** Whether this is the workspace every action is currently scoped to. */
  active: boolean;
}

export interface ListWorkspacesResult {
  /** id of the active workspace ("personal" or an organization id). */
  active: string;
  workspaces: Workspace[];
}

export interface SwitchWorkspaceResult extends ListWorkspacesResult {
  switched: boolean;
}
