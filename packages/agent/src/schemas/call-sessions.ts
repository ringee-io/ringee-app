import { z } from "zod";
import { uuid } from "./common.js";

const MAX_EXPIRY_MIN = 60 * 24 * 30; // 30 days

export const CallSessionContactSchema = z.object({
  contactId: uuid
    .optional()
    .describe("Existing contact; name/phone looked up server-side."),
  phoneNumber: z
    .string()
    .min(3)
    .max(20)
    .optional()
    .describe("E.164 phone. Required when contactId is absent."),
  name: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
});

export const CreateCallSessionSchema = z.object({
  title: z.string().max(200).optional(),
  campaignId: uuid.optional(),
  contacts: z
    .array(CallSessionContactSchema)
    .min(1)
    .max(500)
    .describe("Ordered queue of contacts/numbers to dial."),
  expiresInMinutes: z
    .number()
    .int()
    .min(1)
    .max(MAX_EXPIRY_MIN)
    .optional()
    .describe("How long the magic link stays valid. Default 60."),
  maxCalls: z.number().int().min(1).max(500).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const UpdateCallSessionSchema = z.object({
  callSessionId: uuid,
  title: z.string().max(200).optional(),
  campaignId: uuid
    .nullable()
    .optional()
    .describe("Pass null to detach the session from its campaign."),
  expiresInMinutes: z.number().int().min(1).max(MAX_EXPIRY_MIN).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  contacts: z
    .array(CallSessionContactSchema)
    .min(1)
    .max(500)
    .optional()
    .describe("Replace the queue. Allowed only before any call has started."),
});

export const GetCallSessionSchema = z.object({ callSessionId: uuid });

/** Revoke (not hard delete): history is kept, magic link stops working. */
export const DeleteCallSessionSchema = z.object({ callSessionId: uuid });

export type CallSessionContactInput = z.infer<typeof CallSessionContactSchema>;
export type CreateCallSessionInput = z.infer<typeof CreateCallSessionSchema>;
export type UpdateCallSessionInput = z.infer<typeof UpdateCallSessionSchema>;
export type GetCallSessionInput = z.infer<typeof GetCallSessionSchema>;
export type DeleteCallSessionInput = z.infer<typeof DeleteCallSessionSchema>;
