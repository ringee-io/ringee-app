import { z } from "zod";
import { providerEnum, uuid } from "./common.js";

export const SearchLeadsSchema = z.object({
  provider: providerEnum
    .optional()
    .describe("Defaults to the connected provider (Apollo preferred)."),
  keywords: z.string().max(500).optional(),
  jobTitles: z.array(z.string().min(1).max(100)).max(20).optional(),
  jobTitlesExclude: z.array(z.string().min(1).max(100)).max(20).optional(),
  seniorities: z.array(z.string().min(1).max(50)).max(20).optional(),
  departments: z.array(z.string().min(1).max(50)).max(20).optional(),
  personCountries: z.array(z.string().min(2).max(60)).max(20).optional(),
  personCities: z.array(z.string().max(100)).max(20).optional(),
  industries: z.array(z.string().max(100)).max(20).optional(),
  companyDomains: z.array(z.string().max(120)).max(20).optional(),
  companyNames: z.array(z.string().max(120)).max(20).optional(),
  employeeCountRanges: z.array(z.string().max(20)).max(10).optional(),
  technologies: z.array(z.string().max(80)).max(20).optional(),
  hasEmail: z.boolean().optional(),
  hasPhone: z.boolean().optional(),
  emailVerified: z.boolean().optional(),
  page: z.number().int().min(1).optional(),
  perPage: z.number().int().min(1).max(25).optional(),
});

/** Consumes provider credits. Confirm intent before calling. */
export const RevealLeadSchema = z.object({
  jobId: uuid.describe("Lead search job id from search_leads."),
  externalId: z
    .string()
    .min(1)
    .max(200)
    .describe("Candidate externalId to reveal."),
  revealPhone: z
    .boolean()
    .optional()
    .describe("Also reveal a mobile phone (extra credits)."),
});

export const ImportLeadsSchema = z.object({
  jobId: uuid,
  externalIds: z.array(z.string().min(1).max(200)).min(1).max(50),
  tagIds: z.array(uuid).max(10).optional(),
});

export type SearchLeadsInput = z.infer<typeof SearchLeadsSchema>;
export type RevealLeadInput = z.infer<typeof RevealLeadSchema>;
export type ImportLeadsInput = z.infer<typeof ImportLeadsSchema>;
