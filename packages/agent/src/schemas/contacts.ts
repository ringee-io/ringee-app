import { z } from "zod";
import { phoneNumber, uuid } from "./common.js";

export const SearchContactsSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(200)
    .describe(
      'Free-text search across name, phone, email and company. Pass "*" to list ALL contacts (paginated).',
    ),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const GetContactSchema = z.object({
  contactId: uuid.describe("UUID of the contact. Resolve with search first."),
});

export const CreateContactSchema = z.object({
  phoneNumber: phoneNumber.describe(
    "Destination phone in E.164. Must be unique within the user/organization.",
  ),
  name: z.string().min(1).max(100).optional(),
  firstName: z.string().max(50).optional(),
  lastName: z.string().max(50).optional(),
  email: z.string().email().max(100).optional(),
  jobTitle: z.string().max(100).optional(),
  organization: z.string().max(100).optional().describe("Company name."),
  source: z.string().max(50).optional(),
  note: z.string().max(2000).optional(),
  tagIds: z.array(uuid).max(20).optional(),
});

export const UpdateContactSchema = z.object({
  contactId: uuid,
  phoneNumber: phoneNumber.optional(),
  name: z.string().min(1).max(100).optional(),
  firstName: z.string().max(50).optional(),
  lastName: z.string().max(50).optional(),
  email: z.string().email().max(100).optional(),
  jobTitle: z.string().max(100).optional(),
  organization: z.string().max(100).optional(),
  source: z.string().max(50).optional(),
  tagIds: z
    .array(uuid)
    .max(20)
    .optional()
    .describe("Replaces the tag set (omit to leave tags unchanged)."),
});

/**
 * DESTRUCTIVE. Double-guarded: `confirm` must be literally `true` AND
 * `confirmPhoneNumber` must equal the contact's stored phone. Always read the
 * phone back to the human and get an explicit "yes, delete" first.
 */
export const DeleteContactSchema = z.object({
  contactId: uuid,
  confirm: z.literal(true),
  confirmPhoneNumber: phoneNumber.describe(
    "Must EXACTLY match the contact's stored phoneNumber (E.164).",
  ),
});

export type SearchContactsInput = z.infer<typeof SearchContactsSchema>;
export type GetContactInput = z.infer<typeof GetContactSchema>;
export type CreateContactInput = z.infer<typeof CreateContactSchema>;
export type UpdateContactInput = z.infer<typeof UpdateContactSchema>;
export type DeleteContactInput = z.infer<typeof DeleteContactSchema>;
