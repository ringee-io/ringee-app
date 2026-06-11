import { z } from "zod";

export const RingeeContextSchema = z.object({
  userId: z.string(),
  scope: z.enum(["personal", "organization"]),
  organizationId: z.string().nullable(),
  organizationName: z.string().nullable(),
  userName: z.string().nullable(),
});

export type RingeeContext = z.infer<typeof RingeeContextSchema>;

export const CallHistoryEntrySchema = z.object({
  id: z.string(),
  direction: z.string().nullable(),
  fromNumber: z.string(),
  toNumber: z.string(),
  status: z.string(),
  outcome: z.string().nullable(),
  durationSeconds: z.number().nullable(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  recordingUrl: z.string().nullable(),
  contactName: z.string().nullable(),
});

export type CallHistoryEntry = z.infer<typeof CallHistoryEntrySchema>;

export const CallerIdEntrySchema = z.object({
  id: z.string(),
  phoneNumber: z.string(),
  verified: z.boolean(),
  status: z.string(),
});

export type CallerIdEntry = z.infer<typeof CallerIdEntrySchema>;

export const CallSessionResultSchema = z.object({
  dialerUrl: z.string(),
  sessionToken: z.string(),
  expiresAt: z.string(),
});

export type CallSessionResult = z.infer<typeof CallSessionResultSchema>;

export const ValidateResponseSchema = z.object({
  valid: z.boolean(),
  context: RingeeContextSchema,
});

export type ValidateResponse = z.infer<typeof ValidateResponseSchema>;
