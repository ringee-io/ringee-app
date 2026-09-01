import { z } from "zod";

// ZodRawShape objects — keep these as plain object literals (not z.object(...))
// so they're compatible with McpServer#tool / registerTool API.

/**
 * The CallOutcome enum values (mirrors `enum CallOutcome` in the Prisma
 * schema). Shared by log_call_outcome and find_contacts_by_outcome so the two
 * tools never drift from each other or from the database.
 */
export const CALL_OUTCOME_VALUES = [
  "meeting_booked",
  "sale",
  "interested",
  "follow_up",
  "callback_scheduled",
  "not_interested",
  "no_answer",
  "voicemail",
  "wrong_number",
  "gatekeeper",
] as const;

/**
 * The CallStatus enum values (mirrors `enum CallStatus` in the Prisma schema).
 * Used by list_calls to let the caller filter by call state.
 */
export const CALL_STATUS_VALUES = [
  "pending",
  "ringing",
  "answered",
  "recording",
  "completed",
  "failed",
] as const;

export const SearchContactsSchema = {
  query: z
    .string()
    .min(1)
    .max(200)
    .describe(
      "Free-text search across contact name, phone number, email, and company. " +
        "Use to find existing contacts before placing a call or scheduling a meeting.",
    ),
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("1-based page number. Defaults to 1."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Page size. Defaults to 10, max 50."),
};

export const GetContactSchema = {
  contactId: z
    .string()
    .uuid()
    .describe(
      "UUID of the contact. Use search_contacts first if you only have a phone/name.",
    ),
};

export const FindContactsByOutcomeSchema = {
  outcomes: z
    .array(z.enum(CALL_OUTCOME_VALUES))
    .min(1)
    .max(CALL_OUTCOME_VALUES.length)
    .describe(
      "Call outcomes that mark conversion or engagement, e.g. " +
        '["sale","interested","meeting_booked"]. A contact matches when one of ' +
        "its calls reached any of these outcomes. Use this to learn the real ICP " +
        "from who already bought or engaged.",
    ),
  match: z
    .enum(["any", "last"])
    .optional()
    .describe(
      '"any" (default): the contact had ANY call with one of these outcomes. ' +
        '"last": only the contact\'s most recent call is considered.',
    ),
  includeUnreachable: z
    .boolean()
    .optional()
    .describe(
      "By default contacts flagged doNotCall or unsubscribed are excluded. " +
        "Set true to include them.",
    ),
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("1-based page number. Defaults to 1."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Page size. Defaults to 10, max 50."),
};

// ── Contact write tools (create / update / delete) ─────────────

const E164_REGEX = /^\+[1-9]\d{1,14}$/;

const phoneNumberField = z
  .string()
  .min(3)
  .max(20)
  .regex(E164_REGEX, "Phone number must be E.164 (e.g. +14155552671).");

export const CreateContactSchema = {
  phoneNumber: phoneNumberField.describe(
    "Destination phone number in E.164 format (e.g. +14155552671). Must be unique within the user/organization.",
  ),
  name: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .describe("Display name. If omitted, firstName/lastName are used."),
  firstName: z.string().max(50).optional().describe("Given name."),
  lastName: z.string().max(50).optional().describe("Family name."),
  email: z.string().email().max(100).optional().describe("Primary email."),
  jobTitle: z.string().max(100).optional().describe("Role at the company."),
  state: z.string().max(100).optional().describe("State or region."),
  website: z.string().max(255).optional().describe("Company website."),
  revenue: z.string().max(100).optional().describe("Company revenue or range."),
  companySize: z
    .string()
    .max(100)
    .optional()
    .describe("Company size or range."),
  organization: z
    .string()
    .max(100)
    .optional()
    .describe("Company name (stored as contact.company)."),
  source: z
    .string()
    .max(50)
    .optional()
    .describe(
      "Where this contact came from (e.g. 'mcp', 'event', 'referral'). Defaults to 'mcp' when omitted.",
    ),
  note: z
    .string()
    .max(2000)
    .optional()
    .describe("Optional initial note attached to the contact."),
  tagIds: z
    .array(z.string().uuid())
    .max(20)
    .optional()
    .describe("Optional tag UUIDs to attach on creation."),
};

export const UpdateContactSchema = {
  contactId: z
    .string()
    .uuid()
    .describe(
      "UUID of the contact to update. Must belong to the current user/organization.",
    ),
  phoneNumber: phoneNumberField
    .optional()
    .describe(
      "New phone number, E.164. Must remain unique within the user/organization.",
    ),
  name: z.string().min(1).max(100).optional(),
  firstName: z.string().max(50).optional(),
  lastName: z.string().max(50).optional(),
  email: z.string().email().max(100).optional(),
  jobTitle: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  website: z.string().max(255).optional(),
  revenue: z.string().max(100).optional(),
  companySize: z.string().max(100).optional(),
  organization: z
    .string()
    .max(100)
    .optional()
    .describe("Company name (stored as contact.company)."),
  source: z.string().max(50).optional(),
  tagIds: z
    .array(z.string().uuid())
    .max(20)
    .optional()
    .describe(
      "Replace the contact's tags with this exact set (omit to leave tags unchanged).",
    ),
};

export const DeleteContactSchema = {
  contactId: z
    .string()
    .uuid()
    .describe("UUID of the contact to delete (soft delete — sets deletedAt)."),
  confirm: z
    .literal(true)
    .describe(
      "Must be the literal boolean true. Forces the model to make deletion explicit; do not pass true unless the human user has unambiguously asked to delete this specific contact.",
    ),
  confirmPhoneNumber: phoneNumberField.describe(
    "Must EXACTLY match the contact's stored phoneNumber (E.164). Fetch it with get_contact first — this guard prevents deleting the wrong contact.",
  ),
};

export type CreateContactInput = {
  [K in keyof typeof CreateContactSchema]: z.infer<
    (typeof CreateContactSchema)[K]
  >;
};
export type UpdateContactInput = {
  [K in keyof typeof UpdateContactSchema]: z.infer<
    (typeof UpdateContactSchema)[K]
  >;
};
export type DeleteContactInput = {
  [K in keyof typeof DeleteContactSchema]: z.infer<
    (typeof DeleteContactSchema)[K]
  >;
};

// ── Lead prospecting tools (Apollo / Prospeo) ──────────────────

const ProviderEnum = z
  .enum(["apollo", "prospeo"])
  .describe(
    "Optional enrichment provider to use. Defaults to whichever the user has connected — Apollo is preferred when both are available.",
  );

export const SearchLeadsSchema = {
  provider: ProviderEnum.optional(),
  keywords: z
    .string()
    .max(500)
    .optional()
    .describe("Free-text / boolean keyword search (e.g. 'VP marketing SaaS')."),
  jobTitles: z
    .array(z.string().min(1).max(100))
    .max(20)
    .optional()
    .describe(
      "Match any of these job titles (e.g. ['VP Sales', 'Head of Sales']).",
    ),
  jobTitlesExclude: z
    .array(z.string().min(1).max(100))
    .max(20)
    .optional()
    .describe("Exclude leads matching any of these titles."),
  seniorities: z
    .array(z.string().min(1).max(50))
    .max(20)
    .optional()
    .describe(
      "Seniority bands (e.g. ['c_suite','vp','director','manager']). Provider-specific.",
    ),
  departments: z
    .array(z.string().min(1).max(50))
    .max(20)
    .optional()
    .describe("Departments (e.g. ['sales','marketing','engineering'])."),
  personCountries: z
    .array(z.string().min(2).max(60))
    .max(20)
    .optional()
    .describe("ISO country codes or names for the person's location."),
  personCities: z.array(z.string().max(100)).max(20).optional(),
  industries: z.array(z.string().max(100)).max(20).optional(),
  companyDomains: z
    .array(z.string().max(120))
    .max(20)
    .optional()
    .describe("Company domains (e.g. ['stripe.com'])."),
  companyNames: z.array(z.string().max(120)).max(20).optional(),
  employeeCountRanges: z
    .array(z.string().max(20))
    .max(10)
    .optional()
    .describe("Employee-count buckets (e.g. ['1-10','11-50','51-200'])."),
  technologies: z.array(z.string().max(80)).max(20).optional(),
  hasEmail: z.boolean().optional(),
  hasPhone: z.boolean().optional(),
  emailVerified: z.boolean().optional(),
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("1-based page. Defaults to 1."),
  perPage: z
    .number()
    .int()
    .min(1)
    .max(25)
    .optional()
    .describe("Results per page. Defaults to 25, capped at 25."),
};

export const RevealLeadSchema = {
  jobId: z
    .string()
    .uuid()
    .describe("UUID of the lead search job returned by search_leads."),
  externalId: z
    .string()
    .min(1)
    .max(200)
    .describe(
      "Candidate.externalId from the search result you want to reveal.",
    ),
  revealPhone: z
    .boolean()
    .optional()
    .describe(
      "Set true to also reveal a mobile phone number. Costs extra credits with the upstream provider.",
    ),
};

export const ImportLeadsSchema = {
  jobId: z
    .string()
    .uuid()
    .describe(
      "UUID of the lead search job containing the candidates to import.",
    ),
  externalIds: z
    .array(z.string().min(1).max(200))
    .min(1)
    .max(50)
    .describe(
      "Candidate externalIds from that job's results to import as contacts.",
    ),
  tagIds: z
    .array(z.string().uuid())
    .max(10)
    .optional()
    .describe("Optional tag UUIDs to assign to every imported contact."),
};

export type SearchLeadsInput = {
  [K in keyof typeof SearchLeadsSchema]: z.infer<(typeof SearchLeadsSchema)[K]>;
};
export type RevealLeadInput = {
  [K in keyof typeof RevealLeadSchema]: z.infer<(typeof RevealLeadSchema)[K]>;
};
export type ImportLeadsInput = {
  [K in keyof typeof ImportLeadsSchema]: z.infer<(typeof ImportLeadsSchema)[K]>;
};

export const ListCallsSchema = {
  contactId: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Filter to a single contact's calls. Resolve the contactId with " +
        "search_contacts first when the user names a person.",
    ),
  outcome: z
    .array(z.enum(CALL_OUTCOME_VALUES))
    .min(1)
    .optional()
    .describe(
      'Only return calls whose logged outcome is one of these (e.g. ["sale","interested"]).',
    ),
  status: z
    .array(z.enum(CALL_STATUS_VALUES))
    .min(1)
    .optional()
    .describe(
      'Only return calls in these states (e.g. ["completed"]). Most past calls are "completed".',
    ),
  dateFrom: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe(
      "ISO-8601 datetime (with timezone). Only calls created at or after this.",
    ),
  dateTo: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe(
      "ISO-8601 datetime (with timezone). Only calls created at or before this.",
    ),
  campaignId: z
    .string()
    .optional()
    .describe(
      "Only calls dialed in this campaign (UUID), or the literal 'none' for " +
        "calls made OUTSIDE any campaign (manual dialer, extension, call " +
        "sessions, SDK). Omit for every call.",
    ),
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("1-based page number. Defaults to 1."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Page size. Defaults to 10, max 50."),
};

export const StartCallSchema = {
  contactId: z
    .string()
    .uuid()
    .optional()
    .describe(
      "UUID of the contact to dial. Either contactId or phoneNumber is required.",
    ),
  phoneNumber: z
    .string()
    .min(3)
    .max(20)
    .optional()
    .describe(
      "Destination phone number in E.164 format (e.g. +14155552671). " +
        "Used when the destination is not yet a saved contact.",
    ),
  note: z
    .string()
    .max(500)
    .optional()
    .describe(
      "Optional context about why the call is being placed — surfaced as a notification on the user's device.",
    ),
};

export const LogCallOutcomeSchema = {
  callId: z
    .string()
    .uuid()
    .describe("UUID of the call whose outcome should be recorded."),
  outcome: z
    .enum(CALL_OUTCOME_VALUES)
    .describe("Disposition for the call. Pick the most specific value."),
  outcomeNote: z
    .string()
    .max(2000)
    .optional()
    .describe("Free-text follow-up note. Visible in the call detail view."),
};

export const CreateCallbackSchema = {
  contactId: z
    .string()
    .uuid()
    .describe("UUID of the contact who should be called back."),
  scheduledAt: z
    .string()
    .datetime({ offset: true })
    .describe(
      "ISO-8601 datetime (with timezone) when the callback should fire. " +
        "Must be in the future.",
    ),
  callId: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Optional UUID of the source call this callback originated from.",
    ),
  note: z
    .string()
    .max(500)
    .optional()
    .describe("Optional reminder note for the user — e.g. talking points."),
};

export const ScheduleMeetingSchema = {
  contactId: z
    .string()
    .uuid()
    .describe("UUID of the contact the meeting is with."),
  scheduledAt: z
    .string()
    .datetime({ offset: true })
    .describe("ISO-8601 datetime (with timezone) when the meeting starts."),
  title: z
    .string()
    .max(200)
    .optional()
    .describe("Meeting title shown in calendars and reminders."),
  duration: z
    .number()
    .int()
    .min(5)
    .max(480)
    .optional()
    .describe("Meeting duration in minutes. Defaults to 30."),
  location: z
    .string()
    .max(500)
    .optional()
    .describe("Physical address or video-call URL."),
  notes: z
    .string()
    .max(2000)
    .optional()
    .describe("Optional agenda / preparation notes."),
  attendeeEmail: z
    .string()
    .email()
    .optional()
    .describe(
      "External attendee email. When provided and a calendar is connected, " +
        "the invite is delivered through the user's Google/Microsoft calendar.",
    ),
  calendarProvider: z
    .enum(["google", "microsoft"])
    .optional()
    .describe(
      "Force a specific calendar integration. Defaults to whichever is connected.",
    ),
  callId: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Optional UUID of the call this meeting was booked from. Sets the call outcome to meeting_booked.",
    ),
};

// ── Call Session tool schemas ──────────────────────────────────

const CallSessionContactSchema = z.object({
  contactId: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Existing Ringee contact UUID. If provided, name/phone are looked up server-side.",
    ),
  phoneNumber: z
    .string()
    .min(3)
    .max(20)
    .optional()
    .describe(
      "Destination phone number, E.164 (e.g. +14155552671). Required when contactId is absent.",
    ),
  name: z
    .string()
    .max(200)
    .optional()
    .describe("Display name shown in the dialer UI."),
  company: z
    .string()
    .max(200)
    .optional()
    .describe("Company shown in the dialer UI."),
  jobTitle: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  website: z.string().max(255).optional(),
  revenue: z.string().max(100).optional(),
  companySize: z.string().max(100).optional(),
});

export const CreateCallSessionSchema = {
  title: z
    .string()
    .max(200)
    .optional()
    .describe(
      "Human-readable title for the session (visible to the magic-link recipient).",
    ),
  campaignId: z
    .string()
    .uuid()
    .optional()
    .describe("Optional campaign UUID to attribute the session against."),
  contacts: z
    .array(CallSessionContactSchema)
    .min(1)
    .max(500)
    .describe("Ordered queue of contacts/numbers to dial."),
  expiresInMinutes: z
    .number()
    .int()
    .min(1)
    .max(60 * 24 * 30)
    .optional()
    .describe("How long the magic link stays valid. Default 60 minutes."),
  maxCalls: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe(
      "Optional cap on the number of calls placed before the session auto-completes.",
    ),
  metadata: z
    .record(z.string(), z.any())
    .optional()
    .describe(
      "Free-form JSON metadata persisted with the session (not exposed to the magic-link UI).",
    ),
};

export const UpdateCallSessionSchema = {
  callSessionId: z
    .string()
    .uuid()
    .describe("UUID of the call session to update."),
  title: z.string().max(200).optional(),
  campaignId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .describe("Pass null to detach the session from its current campaign."),
  expiresInMinutes: z
    .number()
    .int()
    .min(1)
    .max(60 * 24 * 30)
    .optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  contacts: z
    .array(CallSessionContactSchema)
    .min(1)
    .max(500)
    .optional()
    .describe(
      "Replace the queue. Only allowed before the session has started any calls.",
    ),
};

export const DeleteCallSessionSchema = {
  callSessionId: z
    .string()
    .uuid()
    .describe("UUID of the call session to revoke."),
};

export const GetCallSessionSchema = {
  callSessionId: z
    .string()
    .uuid()
    .describe("UUID of the call session to fetch."),
};

export type CreateCallSessionInput = {
  [K in keyof typeof CreateCallSessionSchema]: z.infer<
    (typeof CreateCallSessionSchema)[K]
  >;
};
export type UpdateCallSessionInput = {
  [K in keyof typeof UpdateCallSessionSchema]: z.infer<
    (typeof UpdateCallSessionSchema)[K]
  >;
};
export type DeleteCallSessionInput = {
  [K in keyof typeof DeleteCallSessionSchema]: z.infer<
    (typeof DeleteCallSessionSchema)[K]
  >;
};
export type GetCallSessionInput = {
  [K in keyof typeof GetCallSessionSchema]: z.infer<
    (typeof GetCallSessionSchema)[K]
  >;
};

// ── Workspace switching (personal ⇆ organization) ──────────────

export const ListWorkspacesSchema = {};

export const SwitchWorkspaceSchema = {
  workspaceId: z
    .string()
    .min(1)
    .max(100)
    .describe(
      "Which workspace to operate in. Pass the literal 'personal' for your own " +
        "account, or an organization id from list_workspaces (an exact " +
        "organization name also works). Applies to all subsequent actions.",
    ),
};

export type ListWorkspacesInput = Record<string, never>;
export type SwitchWorkspaceInput = {
  [K in keyof typeof SwitchWorkspaceSchema]: z.infer<
    (typeof SwitchWorkspaceSchema)[K]
  >;
};

export type SearchContactsInput = {
  [K in keyof typeof SearchContactsSchema]: z.infer<
    (typeof SearchContactsSchema)[K]
  >;
};
export type GetContactInput = {
  [K in keyof typeof GetContactSchema]: z.infer<(typeof GetContactSchema)[K]>;
};
export type FindContactsByOutcomeInput = {
  [K in keyof typeof FindContactsByOutcomeSchema]: z.infer<
    (typeof FindContactsByOutcomeSchema)[K]
  >;
};
export type ListCallsInput = {
  [K in keyof typeof ListCallsSchema]: z.infer<(typeof ListCallsSchema)[K]>;
};
export type StartCallInput = {
  [K in keyof typeof StartCallSchema]: z.infer<(typeof StartCallSchema)[K]>;
};
export type LogCallOutcomeInput = {
  [K in keyof typeof LogCallOutcomeSchema]: z.infer<
    (typeof LogCallOutcomeSchema)[K]
  >;
};
export type CreateCallbackInput = {
  [K in keyof typeof CreateCallbackSchema]: z.infer<
    (typeof CreateCallbackSchema)[K]
  >;
};
export type ScheduleMeetingInput = {
  [K in keyof typeof ScheduleMeetingSchema]: z.infer<
    (typeof ScheduleMeetingSchema)[K]
  >;
};

// ── Campaigns ──────────────────────────────────────────────────

/** Campaign lifecycle states (mirrors VALID_CAMPAIGN_STATUSES). */
export const CAMPAIGN_STATUS_VALUES = [
  "draft",
  "active",
  "paused",
  "completed",
] as const;

/**
 * The CampaignLeadStatus enum values (mirrors the Prisma enum), plus the two
 * legacy aggregate aliases the repository still understands.
 */
export const CAMPAIGN_LEAD_STATUS_VALUES = [
  "pending",
  "queued",
  "locked",
  "dialing",
  "in_call",
  "wrap_up",
  "dispositioned",
  "scheduled",
  "completed",
  "exhausted",
  "dnc",
  "called",
  "dead",
] as const;

const pageField = z
  .number()
  .int()
  .min(1)
  .optional()
  .describe("1-based page number. Defaults to 1.");

const limitField = z
  .number()
  .int()
  .min(1)
  .max(50)
  .optional()
  .describe("Page size. Defaults to 10, max 50.");

/** YYYY-MM-DD calendar day. */
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD (e.g. 2026-06-02).");

export const ListCampaignsSchema = {
  search: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe("Free-text filter over campaign name and description."),
  status: z
    .enum(CAMPAIGN_STATUS_VALUES)
    .optional()
    .describe("Only campaigns in this lifecycle state."),
  page: pageField,
  limit: limitField,
};

export const GetCampaignSchema = {
  campaignId: z
    .string()
    .uuid()
    .describe("UUID of the campaign. Resolve it with list_campaigns first."),
};

export const UpdateCampaignStatusSchema = {
  campaignId: z.string().uuid(),
  status: z
    .enum(CAMPAIGN_STATUS_VALUES)
    .describe(
      "New lifecycle state. Only these transitions are allowed: draft→active, " +
        "active→paused|completed, paused→active|completed. Activating requires " +
        "at least one lead, one disposition and a usable outbound number.",
    ),
};

export const ListCampaignLeadsSchema = {
  campaignId: z.string().uuid(),
  status: z
    .enum(CAMPAIGN_LEAD_STATUS_VALUES)
    .optional()
    .describe(
      'Filter by lead status. "called" (any attempt, still alive) and "dead" ' +
        "are aggregate aliases; the rest are real CampaignLeadStatus values.",
    ),
  page: pageField,
  limit: limitField,
};

export const AddCampaignLeadsSchema = {
  campaignId: z.string().uuid(),
  leads: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        phone: phoneNumberField.describe("E.164 phone number."),
        email: z.string().email().max(255).optional(),
        company: z.string().max(100).optional(),
        jobTitle: z.string().max(100).optional(),
        state: z.string().max(100).optional(),
        website: z.string().max(255).optional(),
        revenue: z.string().max(100).optional(),
        companySize: z.string().max(100).optional(),
      }),
    )
    .min(1)
    .max(200)
    .describe(
      "Leads to add. A Contact is created (or reused by phone number) for each " +
        "one, then attached to the campaign. Duplicates within the campaign are " +
        "skipped, never duplicated.",
    ),
};

export const DeleteCampaignLeadSchema = {
  campaignId: z.string().uuid(),
  leadId: z
    .string()
    .uuid()
    .describe(
      "UUID of the CampaignLead row (NOT the contact id). Get it from " +
        "list_campaign_leads.",
    ),
  confirm: z
    .boolean()
    .describe(
      "Must be the literal boolean true. Removing a lead also deletes its call " +
        "attempts and callbacks for this campaign. The Contact itself is kept.",
    ),
};

export const GetCampaignAnalyticsSchema = {
  campaignId: z.string().uuid(),
  startDate: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe("Start of the window (ISO-8601). Pair it with endDate."),
  endDate: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe("End of the window (ISO-8601). Pair it with startDate."),
  includeAgents: z
    .boolean()
    .optional()
    .describe("Include the per-agent performance breakdown. Default true."),
  includeHourly: z
    .boolean()
    .optional()
    .describe("Include the hourly call-volume histogram. Default false."),
};

export type ListCampaignsInput = {
  [K in keyof typeof ListCampaignsSchema]: z.infer<
    (typeof ListCampaignsSchema)[K]
  >;
};
export type GetCampaignInput = {
  [K in keyof typeof GetCampaignSchema]: z.infer<(typeof GetCampaignSchema)[K]>;
};
export type UpdateCampaignStatusInput = {
  [K in keyof typeof UpdateCampaignStatusSchema]: z.infer<
    (typeof UpdateCampaignStatusSchema)[K]
  >;
};
export type ListCampaignLeadsInput = {
  [K in keyof typeof ListCampaignLeadsSchema]: z.infer<
    (typeof ListCampaignLeadsSchema)[K]
  >;
};
export type AddCampaignLeadsInput = {
  [K in keyof typeof AddCampaignLeadsSchema]: z.infer<
    (typeof AddCampaignLeadsSchema)[K]
  >;
};
export type DeleteCampaignLeadInput = {
  [K in keyof typeof DeleteCampaignLeadSchema]: z.infer<
    (typeof DeleteCampaignLeadSchema)[K]
  >;
};
export type GetCampaignAnalyticsInput = {
  [K in keyof typeof GetCampaignAnalyticsSchema]: z.infer<
    (typeof GetCampaignAnalyticsSchema)[K]
  >;
};

// ── Call analytics (the /dashboard overview) ───────────────────

export const DASHBOARD_RANGE_VALUES = [
  "today",
  "yesterday",
  "7d",
  "30d",
  "this_month",
  "last_month",
] as const;

export const GetCallAnalyticsSchema = {
  range: z
    .enum(DASHBOARD_RANGE_VALUES)
    .optional()
    .describe(
      "Preset window. Ignored when from/to are given. Defaults to the backend's " +
        "own default (last 30 days).",
    ),
  from: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe("Custom window start (ISO-8601). Must be paired with `to`."),
  to: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe("Custom window end (ISO-8601). Must be paired with `from`."),
  campaignId: z
    .string()
    .optional()
    .describe(
      "Restrict to one campaign (UUID), or pass the literal 'none' for calls " +
        "made OUTSIDE any campaign. Omit to cover every call.",
    ),
  outcome: z
    .enum(CALL_OUTCOME_VALUES)
    .optional()
    .describe("Restrict every metric to calls with this outcome."),
  scope: z
    .enum(["personal", "organization"])
    .optional()
    .describe(
      "'personal' counts only your own calls; 'organization' covers the whole " +
        "workspace. Defaults to organization when an org is active.",
    ),
  memberUserId: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Narrow org-wide numbers to one member (organization admins only).",
    ),
  include: z
    .array(
      z.enum([
        "kpis",
        "funnel",
        "by-outcome",
        "over-time",
        "best-time-of-day",
        "agents",
      ]),
    )
    .min(1)
    .optional()
    .describe(
      'Which blocks to compute. Defaults to ["kpis","funnel","by-outcome"].',
    ),
};

export type GetCallAnalyticsInput = {
  [K in keyof typeof GetCallAnalyticsSchema]: z.infer<
    (typeof GetCallAnalyticsSchema)[K]
  >;
};

// ── Day activity (one calendar day) ────────────────────────────

export const GetDayActivitySchema = {
  date: calendarDate.describe(
    "The calendar day to report on, YYYY-MM-DD (e.g. 2026-06-02).",
  ),
  utcOffset: z
    .string()
    .regex(
      /^[+-]\d{2}:\d{2}$/,
      "utcOffset must look like +HH:MM or -HH:MM (e.g. -04:00).",
    )
    .optional()
    .describe(
      "Timezone offset the day boundaries are computed in. Defaults to +00:00 " +
        "(UTC). Pass the user's offset so 'yesterday' means their yesterday.",
    ),
  campaignId: z
    .string()
    .optional()
    .describe(
      "Restrict the calls to one campaign (UUID), or 'none' for calls outside " +
        "any campaign. Omit for everything.",
    ),
  outcome: z
    .array(z.enum(CALL_OUTCOME_VALUES))
    .min(1)
    .optional()
    .describe("Only calls whose logged outcome is one of these."),
  includeCallbacks: z
    .boolean()
    .optional()
    .describe("Include callbacks scheduled for that day. Default true."),
  includeMeetings: z
    .boolean()
    .optional()
    .describe("Include meetings scheduled for that day. Default true."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Max calls to return. Defaults to 50."),
};

export type GetDayActivityInput = {
  [K in keyof typeof GetDayActivitySchema]: z.infer<
    (typeof GetDayActivitySchema)[K]
  >;
};

// ── Callbacks ──────────────────────────────────────────────────

/** The CallbackStatus enum values (mirrors the Prisma enum). */
export const CALLBACK_STATUS_VALUES = [
  "scheduled",
  "due",
  "in_progress",
  "completed",
  "missed",
  "cancelled",
] as const;

export const ListCallbacksSchema = {
  status: z
    .enum(CALLBACK_STATUS_VALUES)
    .optional()
    .describe("Only callbacks in this state. Omit for all of them."),
  page: pageField,
  limit: limitField,
};

export type ListCallbacksInput = {
  [K in keyof typeof ListCallbacksSchema]: z.infer<
    (typeof ListCallbacksSchema)[K]
  >;
};

// ── DNC (do-not-call list) ─────────────────────────────────────

export const ListDncSchema = {
  search: z
    .string()
    .min(1)
    .max(50)
    .optional()
    .describe("Filter by phone-number fragment."),
  page: pageField,
  limit: limitField,
};

export const AddToDncSchema = {
  phoneNumbers: z
    .array(phoneNumberField)
    .min(1)
    .max(500)
    .describe(
      "Phone numbers to suppress, E.164. Every future dial to these numbers is " +
        "blocked for this workspace.",
    ),
  reason: z
    .string()
    .max(500)
    .optional()
    .describe("Why they were suppressed (e.g. 'requested removal')."),
};

export const RemoveFromDncSchema = {
  phoneNumber: phoneNumberField.describe(
    "The suppressed number to release, E.164. Use list_dnc to confirm it first.",
  ),
  confirm: z
    .boolean()
    .describe(
      "Must be the literal boolean true. Releasing a number makes it callable " +
        "again — only do this when the user explicitly asked for it.",
    ),
};

export type ListDncInput = {
  [K in keyof typeof ListDncSchema]: z.infer<(typeof ListDncSchema)[K]>;
};
export type AddToDncInput = {
  [K in keyof typeof AddToDncSchema]: z.infer<(typeof AddToDncSchema)[K]>;
};
export type RemoveFromDncInput = {
  [K in keyof typeof RemoveFromDncSchema]: z.infer<
    (typeof RemoveFromDncSchema)[K]
  >;
};

// ── AI pipelines (analysis results) ────────────────────────────

export const AI_PIPELINE_TYPE_VALUES = [
  "follow_up_recommendations",
  "script_optimization",
  "objection_intelligence",
] as const;

export const PIPELINE_CONTEXT_TYPE_VALUES = [
  "campaign",
  "organization_outside_campaign",
  "personal",
] as const;

export const ListAiPipelinesSchema = {};

export const GetAiPipelineResultsSchema = {
  pipeline: z
    .enum(AI_PIPELINE_TYPE_VALUES)
    .describe("Which pipeline's analysis to read. See list_ai_pipelines."),
  contextType: z
    .enum(PIPELINE_CONTEXT_TYPE_VALUES)
    .describe(
      "Which slice of data the pipeline analysed: one 'campaign', the " +
        "organization's calls outside campaigns, or a freelancer's 'personal' " +
        "calls. Each context is analysed and enabled independently.",
    ),
  campaignId: z
    .string()
    .uuid()
    .optional()
    .describe("Required when contextType is 'campaign'."),
  status: z
    .enum(["pending", "completed", "dismissed", "snoozed"])
    .optional()
    .describe("Filter the resulting actions by state. Defaults to pending."),
};

export type ListAiPipelinesInput = Record<string, never>;
export type GetAiPipelineResultsInput = {
  [K in keyof typeof GetAiPipelineResultsSchema]: z.infer<
    (typeof GetAiPipelineResultsSchema)[K]
  >;
};

// ── AI Voice Agents ────────────────────────────────────────────

export const ListAiVoiceAgentsSchema = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("How many agents to return. Defaults to 20."),
};

export type ListAiVoiceAgentsInput = {
  [K in keyof typeof ListAiVoiceAgentsSchema]: z.infer<
    (typeof ListAiVoiceAgentsSchema)[K]
  >;
};

export const StartAiVoiceAgentCallSchema = {
  agentId: z
    .string()
    .uuid()
    .describe("UUID of the AI voice agent that should place the call."),
  to: z
    .string()
    .regex(E164_REGEX)
    .describe("Destination phone number in E.164 format, e.g. +13055550123."),
  fromNumberId: z
    .string()
    .uuid()
    .optional()
    .describe(
      "UUID of the Ringee number to call from — list_ai_voice_agents returns the ones this workspace may use. Defaults to the number assigned to the agent; required when the agent has none and the workspace has more than one.",
    ),
  variables: z
    .record(z.string(), z.string())
    .optional()
    .describe(
      "Values for the agent type's own variables — list_ai_voice_agents reports which ones it accepts. Unknown names are rejected.",
    ),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "Free-form values echoed back on the call result, e.g. a CRM record id.",
    ),
};

export type StartAiVoiceAgentCallInput = {
  [K in keyof typeof StartAiVoiceAgentCallSchema]: z.infer<
    (typeof StartAiVoiceAgentCallSchema)[K]
  >;
};

export const GetAiVoiceAgentCallSchema = {
  callId: z
    .string()
    .uuid()
    .describe("UUID returned by start_ai_voice_agent_call."),
};

export type GetAiVoiceAgentCallInput = {
  [K in keyof typeof GetAiVoiceAgentCallSchema]: z.infer<
    (typeof GetAiVoiceAgentCallSchema)[K]
  >;
};
