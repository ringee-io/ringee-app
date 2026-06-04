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
