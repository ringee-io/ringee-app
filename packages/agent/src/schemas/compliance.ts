import { z } from "zod";
import { phoneNumber } from "./common.js";

export const ListDncSchema = z.object({
  search: z
    .string()
    .min(1)
    .max(50)
    .optional()
    .describe("Filter by phone-number fragment."),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const AddToDncSchema = z.object({
  phoneNumbers: z.array(phoneNumber).min(1).max(500),
  reason: z.string().max(500).optional(),
});

export const RemoveFromDncSchema = z.object({
  phoneNumber,
  confirm: z.literal(true),
});

export type ListDncInput = z.infer<typeof ListDncSchema>;
export type AddToDncInput = z.infer<typeof AddToDncSchema>;
export type RemoveFromDncInput = z.infer<typeof RemoveFromDncSchema>;
