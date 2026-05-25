import { z } from "zod";

// ZodRawShape objects — keep these as plain object literals (not z.object(...))
// so they're compatible with McpServer#tool / registerTool API.

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
    .enum([
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
    ])
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
    .describe("Optional UUID of the source call this callback originated from."),
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
    .describe("Existing Ringee contact UUID. If provided, name/phone are looked up server-side."),
  phoneNumber: z
    .string()
    .min(3)
    .max(20)
    .optional()
    .describe("Destination phone number, E.164 (e.g. +14155552671). Required when contactId is absent."),
  name: z.string().max(200).optional().describe("Display name shown in the dialer UI."),
  company: z.string().max(200).optional().describe("Company shown in the dialer UI."),
});

export const CreateCallSessionSchema = {
  title: z
    .string()
    .max(200)
    .optional()
    .describe("Human-readable title for the session (visible to the magic-link recipient)."),
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
    .describe("Optional cap on the number of calls placed before the session auto-completes."),
  metadata: z
    .record(z.string(), z.any())
    .optional()
    .describe("Free-form JSON metadata persisted with the session (not exposed to the magic-link UI)."),
};

export const UpdateCallSessionSchema = {
  callSessionId: z.string().uuid().describe("UUID of the call session to update."),
  title: z.string().max(200).optional(),
  campaignId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .describe("Pass null to detach the session from its current campaign."),
  expiresInMinutes: z.number().int().min(1).max(60 * 24 * 30).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  contacts: z
    .array(CallSessionContactSchema)
    .min(1)
    .max(500)
    .optional()
    .describe("Replace the queue. Only allowed before the session has started any calls."),
};

export const DeleteCallSessionSchema = {
  callSessionId: z.string().uuid().describe("UUID of the call session to revoke."),
};

export const GetCallSessionSchema = {
  callSessionId: z.string().uuid().describe("UUID of the call session to fetch."),
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

export type SearchContactsInput = {
  [K in keyof typeof SearchContactsSchema]: z.infer<
    (typeof SearchContactsSchema)[K]
  >;
};
export type GetContactInput = {
  [K in keyof typeof GetContactSchema]: z.infer<(typeof GetContactSchema)[K]>;
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
