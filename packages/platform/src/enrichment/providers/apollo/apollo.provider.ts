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
    if (filters.seniorities?.length)
      body.person_seniorities = filters.seniorities;
    if (filters.departments?.length)
      body.person_departments = filters.departments;
    if (filters.personLocations?.length)
      body.person_locations = filters.personLocations;
    if (filters.personCountries?.length)
      body.person_locations = filters.personCountries;
    if (filters.companyNames?.length)
      body.q_organization_name = filters.companyNames.join(" ");
    if (filters.companyDomains?.length)
      body.q_organization_domains = filters.companyDomains.join("\n");
    if (filters.industries?.length)
      body.organization_industry_tag_ids = filters.industries;
    if (filters.industriesExclude?.length)
      body.organization_not_industry_tag_ids = filters.industriesExclude;
    if (filters.employeeCountRanges?.length) {
      body.organization_num_employees_ranges = filters.employeeCountRanges;
    }
    if (filters.revenueRanges?.length)
      body.revenue_range = filters.revenueRanges;
    if (filters.technologies?.length)
      body.currently_using_any_of_technology_uids = filters.technologies;
    if (filters.fundingStages?.length)
      body.organization_latest_funding_stage_cd = filters.fundingStages;
    if (filters.companyLocations?.length)
      body.organization_locations = filters.companyLocations;
    if (filters.keywords) body.q_keywords = filters.keywords;
    if (filters.hasEmail)
      body.contact_email_status = ["verified", "likely to engage"];
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
