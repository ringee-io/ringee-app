import { z } from "zod";
import {
  campaignLeadStatusEnum,
  campaignStatusEnum,
  isoDateTime,
  phoneNumber,
  uuid,
} from "./common.js";

export const ListCampaignsSchema = z.object({
  search: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe("Free-text filter over name and description."),
  status: campaignStatusEnum.optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const GetCampaignSchema = z.object({
  campaignId: uuid,
});

export const UpdateCampaignStatusSchema = z.object({
  campaignId: uuid,
  status: campaignStatusEnum.describe(
    "Allowed transitions: draft→active, active→paused|completed, " +
      "paused→active|completed. 'completed' is terminal.",
  ),
});

export const ListCampaignLeadsSchema = z.object({
  campaignId: uuid,
  status: campaignLeadStatusEnum.optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const CampaignLeadInputSchema = z.object({
  name: z.string().min(1).max(100),
  phone: phoneNumber,
  email: z.string().email().max(255).optional(),
  company: z.string().max(100).optional(),
  jobTitle: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  website: z.string().max(255).optional(),
  revenue: z.string().max(100).optional(),
  companySize: z.string().max(100).optional(),
});

export const AddCampaignLeadsSchema = z.object({
  campaignId: uuid,
  leads: z.array(CampaignLeadInputSchema).min(1).max(200),
});

export const DeleteCampaignLeadSchema = z.object({
  campaignId: uuid,
  leadId: uuid.describe("The CampaignLead id, NOT the contact id."),
  confirm: z.literal(true),
});

export const GetCampaignAnalyticsSchema = z.object({
  campaignId: uuid,
  startDate: isoDateTime.optional(),
  endDate: isoDateTime.optional(),
  includeAgents: z.boolean().optional(),
  includeHourly: z.boolean().optional(),
});

export type ListCampaignsInput = z.infer<typeof ListCampaignsSchema>;
export type GetCampaignInput = z.infer<typeof GetCampaignSchema>;
export type UpdateCampaignStatusInput = z.infer<
  typeof UpdateCampaignStatusSchema
>;
export type ListCampaignLeadsInput = z.infer<typeof ListCampaignLeadsSchema>;
export type CampaignLeadInput = z.infer<typeof CampaignLeadInputSchema>;
export type AddCampaignLeadsInput = z.infer<typeof AddCampaignLeadsSchema>;
export type DeleteCampaignLeadInput = z.infer<typeof DeleteCampaignLeadSchema>;
export type GetCampaignAnalyticsInput = z.infer<
  typeof GetCampaignAnalyticsSchema
>;
