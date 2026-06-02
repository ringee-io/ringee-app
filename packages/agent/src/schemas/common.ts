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
  .describe("ISO-8601 datetime with timezone offset (e.g. 2026-05-23T14:30:00-04:00).");

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
