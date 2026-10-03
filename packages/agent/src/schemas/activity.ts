import { z } from "zod";
import {
  calendarProviderEnum,
  callOutcomeEnum,
  callStatusEnum,
  callbackStatusEnum,
  campaignFilter,
  isoDateTime,
  uuid,
} from "./common.js";

export const ListCallsSchema = z.object({
  contactId: uuid
    .optional()
    .describe("Filter to a single contact's calls (resolve it first)."),
  campaignId: campaignFilter
    .optional()
    .describe(
      'Only this campaign\'s calls, or "none" for calls outside any campaign.',
    ),
  outcome: z
    .array(callOutcomeEnum)
    .min(1)
    .optional()
    .describe("Only calls whose logged outcome is one of these."),
  status: z
    .array(callStatusEnum)
    .min(1)
    .optional()
    .describe('Only calls in these states (e.g. ["completed"]).'),
  dateFrom: isoDateTime
    .optional()
    .describe("Only calls created at or after this."),
  dateTo: isoDateTime
    .optional()
    .describe("Only calls created at or before this."),
  page: z.number().int().min(1).optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Default 10, max 50."),
});

/**
 * Either a canonical `outcome` or a workspace `dispositionId` (from
 * list_dispositions). With a disposition, the backend records the outcome it
 * maps to. Kept a plain object — the ChatGPT App registers its `.shape` — so
 * "one of the two" is enforced by the backend, not by a refinement here.
 */
export const LogCallOutcomeSchema = z.object({
  callId: uuid.describe("UUID of an existing call. Never invent ids."),
  outcome: callOutcomeEnum
    .optional()
    .describe("Canonical outcome. Required unless dispositionId is given."),
  dispositionId: uuid
    .optional()
    .describe(
      "A workspace disposition id from list_dispositions. Its canonical outcome is recorded; an outcome sent with it is ignored.",
    ),
  outcomeNote: z.string().max(2000).optional(),
});

/** The workspace's active dispositions. No input. */
export const ListDispositionsSchema = z.object({});

export const CreateCallbackSchema = z.object({
  contactId: uuid,
  scheduledAt: isoDateTime.describe("When the callback fires. Must be future."),
  callId: uuid.optional(),
  note: z.string().max(500).optional(),
});

export const ListCallbacksSchema = z.object({
  status: callbackStatusEnum
    .optional()
    .describe("'scheduled' and 'due' are the ones still owed."),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const ScheduleMeetingSchema = z.object({
  contactId: uuid,
  scheduledAt: isoDateTime.describe("When the meeting starts."),
  title: z.string().max(200).optional(),
  duration: z
    .number()
    .int()
    .min(5)
    .max(480)
    .optional()
    .describe("Minutes. Default 30."),
  location: z.string().max(500).optional().describe("Address or video URL."),
  notes: z.string().max(2000).optional(),
  attendeeEmail: z.string().email().optional(),
  calendarProvider: calendarProviderEnum.optional(),
  calendarId: uuid
    .optional()
    .describe(
      "Ringee calendar to book on. Omit for the workspace's global calendar.",
    ),
  callId: uuid
    .optional()
    .describe("Source call — sets that call's outcome to meeting_booked."),
});

export type ListCallsInput = z.infer<typeof ListCallsSchema>;
export type LogCallOutcomeInput = z.infer<typeof LogCallOutcomeSchema>;
export type ListDispositionsInput = z.infer<typeof ListDispositionsSchema>;
export type CreateCallbackInput = z.infer<typeof CreateCallbackSchema>;
export type ListCallbacksInput = z.infer<typeof ListCallbacksSchema>;
export type ScheduleMeetingInput = z.infer<typeof ScheduleMeetingSchema>;
