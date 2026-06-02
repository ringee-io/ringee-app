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
  lastCallAt?: string | null;
}

export interface SearchContactsResult {
  total: number;
  page: number;
  totalPages: number;
  contacts: ContactSummary[];
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
