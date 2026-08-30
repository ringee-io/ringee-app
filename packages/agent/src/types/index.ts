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

// ── Campaigns ─────────────────────────────────────────────────────────

export type CampaignStatus = "draft" | "active" | "paused" | "completed";

/**
 * Real CampaignLeadStatus values plus the aggregate aliases the backend
 * accepts as filters ("called", "dead").
 */
export type CampaignLeadStatus =
  | "pending"
  | "queued"
  | "locked"
  | "dialing"
  | "in_call"
  | "wrap_up"
  | "dispositioned"
  | "scheduled"
  | "completed"
  | "exhausted"
  | "dnc"
  | "called"
  | "dead";

export interface CampaignSummary {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus | string;
  /** null when the backend did not include the count. */
  leadsCount: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Single-campaign read: adds the dialing configuration. */
export interface CampaignDetail extends CampaignSummary {
  dialerMode: string | null;
  maxAttempts: number | null;
  retryDelayMin: number | null;
  wrapUpTimeSec: number | null;
  workingHours: {
    timezone: string | null;
    /** "08:00" — local to the campaign's timezone. */
    start: string | null;
    end: string | null;
    /** 0=Sunday … 6=Saturday. */
    days: number[] | null;
  };
}

export interface ListCampaignsResult {
  total: number;
  page: number;
  totalPages: number;
  limit?: number;
  campaigns: CampaignSummary[];
}

export interface UpdateCampaignStatusResult {
  ok: boolean;
  campaignId: string;
  name: string;
  status: CampaignStatus | string;
}

export interface CampaignLead {
  leadId: string;
  status: CampaignLeadStatus | string;
  priority: number;
  attempts: number;
  lastCallAt: string | null;
  nextCallAt: string | null;
  deadAt: string | null;
  assignedUserId: string | null;
  contact: {
    id: string;
    name: string | null;
    phoneNumber: string;
    email: string | null;
    company: string | null;
    jobTitle: string | null;
  } | null;
}

export interface ListCampaignLeadsResult {
  total: number;
  page: number;
  totalPages: number;
  limit?: number;
  campaignId: string;
  status: string | null;
  leads: CampaignLead[];
}

export interface AddCampaignLeadsResult {
  ok: boolean;
  campaignId: string;
  totalRows: number;
  contactsCreated: number;
  leadsAdded: number;
  duplicatesSkipped: number;
  invalidRows: number;
  errors: unknown[];
}

export interface DeleteCampaignLeadResult {
  ok: boolean;
  deleted: boolean;
  campaignId?: string;
  leadId?: string;
  error?: string;
}

export interface CampaignAnalyticsSummary {
  totalAttempts: number;
  connected: number;
  conversions: number;
  avgHandleTimeSec: number | null;
  uniqueLeadsDialed: number;
  /** Already a percentage (0-100). */
  contactRate: number;
  /** Already a percentage (0-100). */
  conversionRate: number;
  leadsByStatus: Record<string, number>;
}

export interface CampaignDispositionStat {
  dispositionCode: string;
  count: number;
  percentage: number;
}

export interface CampaignAgentStat {
  agentUserId: string;
  attempts: number;
  connected: number;
  totalTalkSec: number;
  conversions: number;
  contactRate: number;
}

export interface CampaignHourlyStat {
  hour: number;
  attempts: number;
  connected: number;
}

export interface CampaignAnalyticsResult {
  campaign: { id: string; name: string; status: string };
  window: { startDate: string | null; endDate: string | null };
  summary: CampaignAnalyticsSummary;
  dispositions: CampaignDispositionStat[];
  agents?: CampaignAgentStat[];
  hourly?: CampaignHourlyStat[];
}

// ── Call analytics (dashboard overview) ───────────────────────────────

export type AnalyticsBlock =
  | "kpis"
  | "funnel"
  | "by-outcome"
  | "over-time"
  | "best-time-of-day"
  | "agents";

/** Every *Rate field is already a percentage (0-100). */
export interface CallAnalyticsKpis {
  totalCalls: number;
  answeredCalls: number;
  meetingsBooked: number;
  meetingOutcomeNoEvent: number;
  sales: number;
  interested: number;
  followUps: number;
  notInterested: number;
  noAnswer: number;
  voicemail: number;
  wrongNumber: number;
  gatekeeper: number;
  callbackScheduled: number;
  callbacksScheduled: number;
  conversionRate: number;
  meetingRate: number;
  positiveOutcomeRate: number;
  answerRate: number;
  /** Seconds. */
  averageDuration: number;
  rangeStart: string;
  rangeEnd: string;
}

export interface CallAnalyticsResult {
  scope: "personal" | "organization";
  campaignId: string | null;
  outcome: CallOutcome | null;
  memberUserId: string | null;
  kpis?: CallAnalyticsKpis;
  funnel?: { label: string; value: number }[];
  callsByOutcome?: { outcome: string; count: number }[];
  outcomesOverTime?: unknown[];
  bestTimeOfDay?: unknown[];
  agents?: unknown[];
}

// ── Day activity ──────────────────────────────────────────────────────

export interface DayActivityCallback {
  callbackId: string;
  scheduledAt: string;
  status: string;
  note: string | null;
  completedAt: string | null;
  callId: string | null;
  contact: {
    id: string;
    name: string | null;
    phoneNumber: string;
    company: string | null;
  } | null;
  campaign: { id: string; name: string } | null;
}

export interface DayActivityMeeting {
  meetingId: string;
  title: string | null;
  scheduledAt: string;
  duration: number | null;
  status: string;
  location: string | null;
  contactId: string;
}

export interface DayActivityResult {
  date: string;
  utcOffset: string;
  window: { start: string; end: string };
  campaignId: string | null;
  calls: {
    total: number;
    returned: number;
    /** Counts over the returned page. */
    outcomeCounts: Record<string, number>;
    items: CallDetail[];
  };
  callbacks?: { total: number; items: DayActivityCallback[] };
  meetings?: { total: number; items: DayActivityMeeting[] };
}

// ── Callbacks ─────────────────────────────────────────────────────────

export type CallbackStatus =
  | "scheduled"
  | "due"
  | "in_progress"
  | "completed"
  | "missed"
  | "cancelled";

export interface ListCallbacksResult {
  total: number;
  page: number;
  totalPages: number;
  limit?: number;
  status: string | null;
  callbacks: DayActivityCallback[];
}

// ── DNC (do-not-call) ─────────────────────────────────────────────────

export interface DncEntry {
  id: string;
  phoneNumber: string;
  reason: string | null;
  source: string | null;
  addedAt: string;
}

export interface ListDncResult {
  total: number;
  page: number;
  totalPages: number;
  limit?: number;
  entries: DncEntry[];
}

export interface AddToDncResult {
  ok: boolean;
  added: number;
  duplicates: number;
  alreadyListed?: boolean;
  entryId?: string;
  phoneNumbers: string[];
}

export interface RemoveFromDncResult {
  ok: boolean;
  removed: number;
  phoneNumber: string;
  error?: string;
}

// ── AI pipelines ──────────────────────────────────────────────────────

export type AiPipelineType =
  | "follow_up_recommendations"
  | "script_optimization"
  | "objection_intelligence";

export type PipelineContextType =
  | "campaign"
  | "organization_outside_campaign"
  | "personal";

export type PendingActionStatus =
  | "pending"
  | "completed"
  | "dismissed"
  | "snoozed";

export interface AiPipelineOverview {
  type: AiPipelineType | string;
  name: string;
  valueProposition: string;
  detailRoute: string;
  implemented: boolean;
  enabledContexts: number;
  totalPendingActions: number;
  totalNewEligible: number;
}

export interface ListAiPipelinesResult {
  pipelines: AiPipelineOverview[];
}

export interface AiPipelineResultsContext {
  contextKey: string;
  contextType: PipelineContextType | string;
  label: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  lastConfidence: string | null;
  newEligibleSinceLastRun: number;
  pendingActionCount: number;
}

export interface AiPipelineResults {
  pipeline: {
    type: string;
    name: string;
    valueProposition: string;
    detailRoute: string;
    implemented: boolean;
  };
  context: AiPipelineResultsContext;
  status: PendingActionStatus | string;
  /** Shape is backend-defined (paginated pending actions). */
  actions: unknown;
  /** Only for objection_intelligence: ranked objections + trend. */
  objections?: unknown;
}

// ── AI voice agents ─────────────────────────────────────────────────

export interface AiVoiceAgentSummary {
  id: string;
  name: string;
  type: string;
  status: string;
  voice: string | null;
  callCount: number;
  createdAt: string;
}

export interface AiVoiceAgentVariable {
  key: string;
  required: boolean;
  description: string;
}

export interface ListAiVoiceAgentsResult {
  agents: AiVoiceAgentSummary[];
  total: number;
  /** Which variables each agent type accepts, keyed by type. */
  variablesByType: Record<string, AiVoiceAgentVariable[]>;
}

export interface StartAiVoiceAgentCallResult {
  ok: boolean;
  callId: string;
  status: string;
  note?: string;
}

/** The normalized result of one agent call. */
export interface AiVoiceAgentCallResult {
  call_id: string;
  status: string;
  outcome: string | null;
  summary: string | null;
  sentiment: string | null;
  extracted_data: Record<string, unknown>;
  metadata: Record<string, unknown>;
}
