export type EnrichmentProviderType = 'prospeo' | 'apollo';
export type EnrichmentConnectionScope = 'personal' | 'organization';
export type EnrichmentConnectionStatus = 'active' | 'error' | 'disconnected';
export type EnrichmentJobStatus =
  | 'pending'
  | 'in_progress'
  | 'done'
  | 'failed'
  | 'skipped'
  | 'not_found';

export interface EnrichmentCapabilities {
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
}

export interface EnrichmentConnectionSummary {
  id: string;
  provider: EnrichmentProviderType;
  scope: EnrichmentConnectionScope;
  status: EnrichmentConnectionStatus;
  externalAccountId: string;
  externalAccountName: string | null;
  lastErrorCode: string | null;
  lastErrorAt: string | null;
  lastUsedAt: string | null;
  providerMetadata: Record<string, unknown> | null;
  capabilities: EnrichmentCapabilities | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnrichmentJobRow {
  id: string;
  connectionId: string;
  provider: EnrichmentProviderType;
  contactId: string | null;
  status: EnrichmentJobStatus;
  queryKind: string;
  costCredits: number | null;
  providerCredits: number | null;
  attemptCount: number;
  lastError: string | null;
  triggeredBy: string | null;
  resultSnapshot: unknown;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
}

export interface LeadCandidate {
  externalId: string;
  provider: EnrichmentProviderType;
  person: {
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
    jobTitle?: string | null;
    headline?: string | null;
    seniority?: string | null;
    department?: string | null;
    linkedinUrl?: string | null;
    twitterUrl?: string | null;
    githubUrl?: string | null;
    facebookUrl?: string | null;
    location?: { city?: string | null; region?: string | null; country?: string | null } | null;
    emails: { value: string; type?: string | null; verified?: boolean | null }[];
    phones: { value: string; type?: string | null; verified?: boolean | null }[];
    socialProfiles: { platform: string; url: string; handle?: string | null }[];
  };
  company: {
    name?: string | null;
    domain?: string | null;
    industry?: string | null;
    size?: string | null;
    website?: string | null;
    linkedinUrl?: string | null;
    logoUrl?: string | null;
  } | null;
  confidence?: number | null;
}

export interface LeadSearchResultDto {
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
  results: LeadCandidate[];
}

export interface LeadSearchJobDto {
  job: {
    id: string;
    status: string;
    totalResults: number | null;
    page: number;
    perPage: number;
    filters: Record<string, unknown>;
    createdAt: string;
    completedAt: string | null;
  };
  result: LeadSearchResultDto;
}

export interface LeadSearchFilters {
  jobTitles?: string[];
  jobTitlesExclude?: string[];
  seniorities?: string[];
  departments?: string[];
  yearsExperienceMin?: number;
  yearsExperienceMax?: number;
  personLocations?: string[];
  personCountries?: string[];
  personCities?: string[];
  companyNames?: string[];
  companyDomains?: string[];
  industries?: string[];
  industriesExclude?: string[];
  employeeCountRanges?: string[];
  revenueRanges?: string[];
  technologies?: string[];
  fundingStages?: string[];
  companyLocations?: string[];
  companyCountries?: string[];
  hasEmail?: boolean;
  hasPhone?: boolean;
  emailVerified?: boolean;
  keywords?: string;
  excludeContactedDays?: number;
  extra?: Record<string, unknown>;
}

export const ENRICHMENT_PROVIDER_META: Record<
  EnrichmentProviderType,
  {
    name: string;
    shortDescription: string;
    docsUrl: string;
    color: string;
    available: boolean;
    leadSearch: boolean;
  }
> = {
  prospeo: {
    name: 'Prospeo',
    shortDescription:
      'Domain-driven lead search + email/mobile reveal per contact.',
    docsUrl: 'https://prospeo.io/api-docs/search-person',
    color: '#3B82F6',
    available: true,
    leadSearch: true,
  },
  apollo: {
    name: 'Apollo.io',
    shortDescription:
      'B2B contact database with email, phone, social, and powerful lead search filters.',
    docsUrl: 'https://docs.apollo.io',
    color: '#7C3AED',
    available: true,
    leadSearch: true,
  },
};
