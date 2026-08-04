import { z } from "zod";

/** E.164 phone number, e.g. +14155552671. */
export const E164_REGEX = /^\+[1-9]\d{1,14}$/;

export const phoneNumber = z
  .string()
  .min(3)
  .max(20)
  .regex(E164_REGEX, "Phone number must be E.164 (e.g. +14155552671).");

export const uuid = z.string().uuid();

/** ISO-8601 datetime with timezone offset, e.g. 2026-05-23T14:30:00-04:00. */
export const isoDateTime = z
  .string()
  .datetime({ offset: true })
  .describe(
    "ISO-8601 datetime with timezone offset (e.g. 2026-05-23T14:30:00-04:00).",
  );

export const providerEnum = z.enum(["apollo", "prospeo"]);

export const callOutcomeEnum = z.enum([
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
]);

export const calendarProviderEnum = z.enum(["google", "microsoft"]);

export const callStatusEnum = z.enum([
  "pending",
  "ringing",
  "answered",
  "recording",
  "completed",
  "failed",
]);

export const callbackStatusEnum = z.enum([
  "scheduled",
  "due",
  "in_progress",
  "completed",
  "missed",
  "cancelled",
]);

export const campaignStatusEnum = z.enum([
  "draft",
  "active",
  "paused",
  "completed",
]);

/**
 * Real CampaignLeadStatus values plus the two aggregate aliases the backend
 * still accepts ("called" = any attempt and still alive, "dead" = given up on).
 */
export const campaignLeadStatusEnum = z.enum([
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
]);

/** Sentinel for "calls made outside any campaign". */
export const NO_CAMPAIGN = "none";

/**
 * A campaign filter: a campaign UUID, or the literal "none" to isolate calls
 * that were NOT dialed through a campaign (manual dialer, extension, call
 * sessions, SDK).
 */
export const campaignFilter = z
  .union([uuid, z.literal(NO_CAMPAIGN)])
  .describe('Campaign UUID, or "none" for calls made outside any campaign.');

export const dashboardRangeEnum = z.enum([
  "today",
  "yesterday",
  "7d",
  "30d",
  "this_month",
  "last_month",
]);

export const analyticsBlockEnum = z.enum([
  "kpis",
  "funnel",
  "by-outcome",
  "over-time",
  "best-time-of-day",
  "agents",
]);

/** A calendar day, YYYY-MM-DD. */
export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD (e.g. 2026-06-02).")
  .describe("Calendar day, YYYY-MM-DD.");

/** Fixed timezone offset, e.g. -04:00. Keeps day boundaries unambiguous. */
export const utcOffset = z
  .string()
  .regex(
    /^[+-]\d{2}:\d{2}$/,
    "utcOffset must look like +HH:MM or -HH:MM (e.g. -04:00).",
  );

export const aiPipelineTypeEnum = z.enum([
  "follow_up_recommendations",
  "script_optimization",
  "objection_intelligence",
]);

export const pipelineContextTypeEnum = z.enum([
  "campaign",
  "organization_outside_campaign",
  "personal",
]);

export const pendingActionStatusEnum = z.enum([
  "pending",
  "completed",
  "dismissed",
  "snoozed",
]);
