import { EnrichmentProviderType } from "@ringee/database";

export type EnrichmentScope = "personal" | "organization";

export type EnrichmentCredentials = {
  apiKey: string;
  accountId: string;
  connectionId: string;
  metadata?: Record<string, unknown>;
};

export type EnrichmentCapabilities = {
  byEmail: boolean;
  byDomain: boolean;
  byLinkedIn: boolean;
  byNameCompany: boolean;
  byPhone: boolean;
  emailVerify: boolean;
  returnsPhone: boolean;
  returnsEmail: boolean;
  returnsCompanyData: boolean;
  returnsSocialProfiles: boolean;
  leadSearch: boolean;
  leadSearchMaxPerPage: number;
  rateLimit: { requestsPerMinute: number; burst: number };
};

export type EnrichmentAccountInfo = {
  accountId: string;
  accountName: string | null;
  metadata?: Record<string, unknown>;
};

export type EnrichmentCreditsInfo = {
  remaining: number | null;
  limit: number | null;
  periodResetAt?: Date | null;
};

export type EnrichOpts = {
  timeoutMs?: number;
  revealPhone?: boolean;
  revealEmail?: boolean;
};

export type NameCompanyInput = {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  company?: string;
  domain?: string;
};

export type EnrichedSocialProfile = {
  platform: string;
  url: string;
  handle?: string | null;
};

export type EnrichedPersonLocation = {
  city?: string | null;
  region?: string | null;
  country?: string | null;
  countryCode?: string | null;
  postalCode?: string | null;
};

export type EnrichedEmail = {
  value: string;
  type?: string | null;
  verified?: boolean | null;
  confidence?: number | null;
};

export type EnrichedPhone = {
  value: string;
  type?: string | null;
  verified?: boolean | null;
};

export type EnrichedPerson = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  headline?: string | null;
  summary?: string | null;
  jobTitle?: string | null;
  seniority?: string | null;
  department?: string | null;
  yearsExperience?: number | null;
  emails: EnrichedEmail[];
  phones: EnrichedPhone[];
  socialProfiles: EnrichedSocialProfile[];
  linkedinUrl?: string | null;
  twitterUrl?: string | null;
  githubUrl?: string | null;
  facebookUrl?: string | null;
  websiteUrl?: string | null;
  location?: EnrichedPersonLocation | null;
  timezone?: string | null;
  languages?: string[] | null;
  skills?: string[] | null;
  birthday?: Date | null;
  gender?: string | null;
  workHistory?: Array<{
    company?: string | null;
    title?: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
    current?: boolean | null;
  }> | null;
  education?: Array<{
    school?: string | null;
    degree?: string | null;
    field?: string | null;
    startYear?: number | null;
    endYear?: number | null;
  }> | null;
};

export type EnrichedCompanyAddress = {
  type?: string | null;
  street?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
  countryCode?: string | null;
};

export type EnrichedCompany = {
  name?: string | null;
  legalName?: string | null;
  domain?: string | null;
  description?: string | null;
  industry?: string | null;
  subIndustry?: string | null;
  size?: string | null;
  employeeCount?: number | null;
  employeeCountRange?: string | null;
  annualRevenue?: number | null;
  revenueRange?: string | null;
  fundingTotal?: number | null;
  fundingStage?: string | null;
  foundedYear?: number | null;
  companyType?: string | null;
  ticker?: string | null;
  exchange?: string | null;
  website?: string | null;
  phone?: string | null;
  contactEmail?: string | null;
  emailDomain?: string | null;
  technologies?: string[] | null;
  keywords?: string[] | null;
  logoUrl?: string | null;
  linkedinUrl?: string | null;
  twitterUrl?: string | null;
  facebookUrl?: string | null;
  crunchbaseUrl?: string | null;
  socialProfiles?: EnrichedSocialProfile[] | null;
  hq?: EnrichedCompanyAddress | null;
  addresses?: EnrichedCompanyAddress[] | null;
};

export type EnrichmentResult = {
  found: boolean;
  confidence: number | null;
  person: EnrichedPerson | null;
  company: EnrichedCompany | null;
  raw: unknown;
  providerCost?: number | null;
};

export type EmailVerificationResult = {
  status: "deliverable" | "undeliverable" | "risky" | "unknown";
  score: number | null;
  raw: unknown;
};

// ── Lead Search ──

export type LeadSearchFilters = {
  // Person filters
  jobTitles?: string[];
  jobTitlesExclude?: string[];
  seniorities?: string[];
  departments?: string[];
  yearsExperienceMin?: number;
  yearsExperienceMax?: number;

  // Location filters (person)
  personLocations?: string[]; // ["United States", "Spain", ...]
  personCountries?: string[]; // ISO codes
  personCities?: string[];

  // Company filters
  companyNames?: string[];
  companyDomains?: string[];
  industries?: string[];
  industriesExclude?: string[];
  employeeCountRanges?: string[]; // ["1-10","11-50","51-200"]
  revenueRanges?: string[];
  technologies?: string[];
  fundingStages?: string[];
  companyLocations?: string[];
  companyCountries?: string[];

  // Contact info constraints
  hasEmail?: boolean;
  hasPhone?: boolean;
  emailVerified?: boolean;

  // Free-form keywords / boolean search
  keywords?: string;

  // Exclusions
  excludeContactedDays?: number; // skip leads contacted within N days

  // Provider-specific extra filters (escape hatch)
  extra?: Record<string, unknown>;
};

export type LeadCandidate = {
  externalId: string;
  provider: EnrichmentProviderType;
  person: EnrichedPerson;
  company: EnrichedCompany | null;
  confidence?: number | null;
  raw?: unknown;
};

export type LeadSearchResult = {
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
  results: LeadCandidate[];
  raw?: unknown;
};

export type LeadSearchOpts = {
  page?: number;
  perPage?: number;
  timeoutMs?: number;
};
