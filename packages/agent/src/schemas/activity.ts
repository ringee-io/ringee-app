import { z } from "zod";
import {
  calendarProviderEnum,
  callOutcomeEnum,
  isoDateTime,
  uuid,
} from "./common.js";

export const LogCallOutcomeSchema = z.object({
  callId: uuid.describe("UUID of an existing call. Never invent ids."),
  outcome: callOutcomeEnum,
  outcomeNote: z.string().max(2000).optional(),
});

export const CreateCallbackSchema = z.object({
  contactId: uuid,
  scheduledAt: isoDateTime.describe("When the callback fires. Must be future."),
  callId: uuid.optional(),
  note: z.string().max(500).optional(),
});

export const ScheduleMeetingSchema = z.object({
  contactId: uuid,
  scheduledAt: isoDateTime.describe("When the meeting starts."),
  title: z.string().max(200).optional(),
  duration: z.number().int().min(5).max(480).optional().describe("Minutes. Default 30."),
  location: z.string().max(500).optional().describe("Address or video URL."),
  notes: z.string().max(2000).optional(),
  attendeeEmail: z.string().email().optional(),
  calendarProvider: calendarProviderEnum.optional(),
  callId: uuid
    .optional()
    .describe("Source call — sets that call's outcome to meeting_booked."),
});

export type LogCallOutcomeInput = z.infer<typeof LogCallOutcomeSchema>;
export type CreateCallbackInput = z.infer<typeof CreateCallbackSchema>;
export type ScheduleMeetingInput = z.infer<typeof ScheduleMeetingSchema>;
