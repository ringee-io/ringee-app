import { Injectable } from "@nestjs/common";
import { EnrichmentProviderType } from "@ringee/database";
import { AbstractEnrichmentProvider } from "../../abstract-provider";
import { EnrichmentError } from "../../errors";
import type {
  EnrichmentAccountInfo,
  EnrichmentCapabilities,
  EnrichmentCredentials,
  EnrichmentResult,
  EnrichOpts,
  LeadCandidate,
  LeadSearchFilters,
  LeadSearchOpts,
  LeadSearchResult,
  NameCompanyInput,
} from "../../types";
import { mapApolloCompany, mapApolloPerson } from "./apollo.mapper";
import { normalizeApolloLocations } from "./apollo.locations";
import {
  APOLLO_REACHABLE_EMAIL_STATUSES,
  normalizeEmployeeRanges,
  normalizeIndustryTagIds,
  normalizeSeniorities,
  normalizeTechnologies,
  toApolloRevenueRange,
} from "./apollo.vocabulary";
import type {
  ApolloAuthHealthResponse,
  ApolloOrganizationEnrichResponse,
  ApolloPeopleMatchResponse,
  ApolloPeopleSearchResponse,
  ApolloPerson,
} from "./apollo.types";

const DEFAULT_BASE_URL = "https://api.apollo.io";

export type ApolloProviderConfig = {
  apiBaseUrl?: string;
};

@Injectable()
export class ApolloProvider extends AbstractEnrichmentProvider {
  readonly type = EnrichmentProviderType.apollo;

  readonly capabilities: EnrichmentCapabilities = {
    byEmail: true,
    byDomain: true,
    byLinkedIn: true,
    byNameCompany: true,
    byPhone: false,
    emailVerify: false,
    returnsPhone: true,
    returnsEmail: true,
    returnsCompanyData: true,
    returnsSocialProfiles: true,
    leadSearch: true,
    leadSearchMaxPerPage: 100,
    rateLimit: { requestsPerMinute: 60, burst: 10 },
  };

  private readonly baseUrl: string;

  constructor(config: ApolloProviderConfig = {}) {
    super();
    this.baseUrl = (config.apiBaseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  async validateCredentials(
    creds: EnrichmentCredentials,
  ): Promise<EnrichmentAccountInfo> {
    const r = await this.request<ApolloAuthHealthResponse>({
      method: "GET",
      url: `${this.baseUrl}/v1/auth/health`,
      headers: this.headers(creds),
    });
    if (!r?.is_logged_in) {
      throw new EnrichmentError(
        "INVALID_CREDENTIALS",
        false,
        "apollo: not logged in",
      );
    }
    return {
      accountId: r.user_email ?? "apollo-account",
      accountName: r.user_name ?? r.team_name ?? r.user_email ?? null,
      metadata: { teamName: r.team_name },
    };
  }

  // ── Enrichment ──

  async enrichByEmail(
    creds: EnrichmentCredentials,
    email: string,
    opts?: EnrichOpts,
  ): Promise<EnrichmentResult> {
    return this.matchPerson(
      creds,
      {
        email,
        reveal_personal_emails: true,
        reveal_phone_number: opts?.revealPhone ?? false,
      },
      opts?.timeoutMs,
    );
  }

  async enrichByLinkedIn(
    creds: EnrichmentCredentials,
    linkedInUrl: string,
    opts?: EnrichOpts,
  ): Promise<EnrichmentResult> {
    return this.matchPerson(
      creds,
      {
        linkedin_url: linkedInUrl,
        reveal_phone_number: opts?.revealPhone ?? false,
      },
      opts?.timeoutMs,
    );
  }

  async enrichByNameCompany(
    creds: EnrichmentCredentials,
    input: NameCompanyInput,
    opts?: EnrichOpts,
  ): Promise<EnrichmentResult> {
    const body: Record<string, unknown> = {
      reveal_phone_number: opts?.revealPhone ?? false,
      reveal_personal_emails: opts?.revealEmail ?? false,
    };
    if (input.firstName) body.first_name = input.firstName;
    if (input.lastName) body.last_name = input.lastName;
    if (input.fullName && !input.firstName) body.name = input.fullName;
    if (input.company) body.organization_name = input.company;
    if (input.domain) body.domain = input.domain;
    return this.matchPerson(creds, body, opts?.timeoutMs);
  }

  async enrichByDomain(
    creds: EnrichmentCredentials,
    domain: string,
    opts?: EnrichOpts,
  ): Promise<EnrichmentResult> {
    await this.acquireToken(creds.accountId);
    const r = await this.request<ApolloOrganizationEnrichResponse>({
      method: "POST",
      url: `${this.baseUrl}/v1/organizations/enrich`,
      headers: this.headers(creds),
      body: { domain },
      timeoutMs: opts?.timeoutMs,
    });
    const company = mapApolloCompany(r.organization);
    if (!company) {
      return {
        found: false,
        confidence: null,
        person: null,
        company: null,
        raw: r,
      };
    }
    return {
      found: true,
      confidence: 0.9,
      person: null,
      company,
      raw: r,
      providerCost: 1,
    };
  }

  async enrichByPersonId(
    creds: EnrichmentCredentials,
    personId: string,
    opts?: EnrichOpts,
  ): Promise<EnrichmentResult> {
    if (!personId) {
      throw new EnrichmentError(
        "VALIDATION",
        false,
        "personId required for Apollo people/match",
      );
    }
    return this.matchPerson(
      creds,
      {
        id: personId,
        reveal_personal_emails: opts?.revealEmail ?? true,
        reveal_phone_number: opts?.revealPhone ?? false,
      },
      opts?.timeoutMs,
    );
  }

  // ── Lead Search (Apollo's flagship) ──

  async searchLeads(
    creds: EnrichmentCredentials,
    filters: LeadSearchFilters,
    opts?: LeadSearchOpts,
  ): Promise<LeadSearchResult> {
    await this.acquireToken(creds.accountId);
    const page = opts?.page ?? 1;
    const perPage = Math.min(
      opts?.perPage ?? 25,
      this.capabilities.leadSearchMaxPerPage,
    );
    const body = this.buildPeopleSearchBody(filters, page, perPage);

    const r = await this.request<ApolloPeopleSearchResponse>({
      method: "POST",
      url: `${this.baseUrl}/v1/mixed_people/search`,
      headers: this.headers(creds),
      body,
      timeoutMs: opts?.timeoutMs,
    });

    const list = (r.people ?? r.contacts ?? []) as ApolloPerson[];
    const candidates: LeadCandidate[] = list.map((p) => ({
      externalId: p.id ?? "",
      provider: this.type,
      person: mapApolloPerson(p),
      company: mapApolloCompany(p.organization ?? null),
      raw: p,
    }));

    const total = r.pagination?.total_entries ?? candidates.length;
    const totalPages = r.pagination?.total_pages ?? 1;
    return {
      total,
      page,
      perPage,
      hasMore: page < totalPages,
      results: candidates,
      raw: r,
    };
  }

  // ── Internals ──

  private async matchPerson(
    creds: EnrichmentCredentials,
    body: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<EnrichmentResult> {
    await this.acquireToken(creds.accountId);
    const r = await this.request<ApolloPeopleMatchResponse>({
      method: "POST",
      url: `${this.baseUrl}/v1/people/match`,
      headers: this.headers(creds),
      body,
      timeoutMs,
    });
    if (!r.person) {
      return {
        found: false,
        confidence: null,
        person: null,
        company: null,
        raw: r,
      };
    }
    return {
      found: true,
      confidence: r.person.email_status === "verified" ? 0.95 : 0.8,
      person: mapApolloPerson(r.person),
      company: mapApolloCompany(r.person.organization),
      raw: r,
      providerCost: 1,
    };
  }

  private buildPeopleSearchBody(
    filters: LeadSearchFilters,
    page: number,
    perPage: number,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      page,
      per_page: perPage,
    };
    if (filters.jobTitles?.length) body.person_titles = filters.jobTitles;
    if (filters.jobTitlesExclude?.length)
      body.person_not_titles = filters.jobTitlesExclude;

    // Seniorities are a strict enum (owner/founder/c_suite/vp/...). Apollo
    // silently ignores anything off-vocabulary, so normalize first.
    const seniorities = normalizeSeniorities(filters.seniorities);
    if (seniorities.length) body.person_seniorities = seniorities;
    if (filters.departments?.length)
      body.person_departments = filters.departments;

    // Locations: expand bare ISO country codes to names — Apollo matches
    // nothing on "MX"/"GB" but works on "Mexico"/"United Kingdom".
    const personLocations = normalizeApolloLocations([
      ...(filters.personLocations ?? []),
      ...(filters.personCountries ?? []),
      ...(filters.personCities ?? []),
    ]);
    if (personLocations.length) body.person_locations = personLocations;

    if (filters.companyNames?.length)
      body.q_organization_name = filters.companyNames.join(" ");
    if (filters.companyDomains?.length) {
      const domains = dedupeStrings(
        filters.companyDomains.map((d) => cleanApolloDomain(d)),
      );
      // Apollo's documented param is the array form `q_organization_domains_list`.
      if (domains.length) body.q_organization_domains_list = domains;
    }

    // Industries are filtered by Apollo-internal tag IDs. Pass through values
    // that already look like a tag ID; fold plain industry names into the
    // free-text keyword filter below since we can't resolve them offline.
    const { tagIds: industryTagIds, unmatched: industryKeywords } =
      normalizeIndustryTagIds(filters.industries);
    if (industryTagIds.length)
      body.organization_industry_tag_ids = industryTagIds;
    const { tagIds: notIndustryTagIds } = normalizeIndustryTagIds(
      filters.industriesExclude,
    );
    if (notIndustryTagIds.length)
      body.organization_not_industry_tag_ids = notIndustryTagIds;

    const employeeRanges = normalizeEmployeeRanges(filters.employeeCountRanges);
    if (employeeRanges.length)
      body.organization_num_employees_ranges = employeeRanges;

    // revenue_range is an { min, max } object of plain integers, not an array.
    const revenueRange = toApolloRevenueRange(filters.revenueRanges);
    if (revenueRange) body.revenue_range = revenueRange;

    const technologies = normalizeTechnologies(filters.technologies);
    if (technologies.length)
      body.currently_using_any_of_technology_uids = technologies;

    if (filters.fundingStages?.length)
      body.organization_latest_funding_stage_cd = filters.fundingStages;

    const companyLocations = normalizeApolloLocations([
      ...(filters.companyLocations ?? []),
      ...(filters.companyCountries ?? []),
    ]);
    if (companyLocations.length) body.organization_locations = companyLocations;

    const keywords = dedupeStrings([
      ...(filters.keywords ? [filters.keywords] : []),
      ...industryKeywords,
    ]);
    if (keywords.length) body.q_keywords = keywords.join(" ");

    if (filters.hasEmail)
      body.contact_email_status = [...APOLLO_REACHABLE_EMAIL_STATUSES];
    if (filters.extra) Object.assign(body, filters.extra);
    return body;
  }

  private headers(creds: EnrichmentCredentials): Record<string, string> {
    return {
      "X-Api-Key": creds.apiKey,
      "Cache-Control": "no-cache",
    };
  }
}

function dedupeStrings(input: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

// Apollo's `q_organization_domains_list` wants bare hostnames — no scheme,
// no "www.", no "@", no trailing path. Accepts "ringee.io",
// "https://ringee.io/foo" and "www.ringee.io" alike.
function cleanApolloDomain(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  try {
    const withScheme = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    return new URL(withScheme).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return trimmed
      .replace(/^www\./i, "")
      .replace(/^@/, "")
      .toLowerCase();
  }
}
