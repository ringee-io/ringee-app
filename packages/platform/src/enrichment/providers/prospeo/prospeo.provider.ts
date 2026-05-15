import { Injectable } from "@nestjs/common";
import { EnrichmentProviderType } from "@ringee/database";
import { AbstractEnrichmentProvider } from "../../abstract-provider";
import { EnrichmentError } from "../../errors";
import type {
  EmailVerificationResult,
  EnrichedCompany,
  EnrichedPerson,
  EnrichmentAccountInfo,
  EnrichmentCapabilities,
  EnrichmentCreditsInfo,
  EnrichmentCredentials,
  EnrichmentResult,
  EnrichOpts,
  LeadCandidate,
  LeadSearchFilters,
  LeadSearchOpts,
  LeadSearchResult,
  NameCompanyInput,
} from "../../types";
import type {
  ProspeoAccountInfoResponse,
  ProspeoEmailFinderResponse,
  ProspeoEmailVerifierResponse,
  ProspeoEnrichPersonRequest,
  ProspeoEnrichPersonResponse,
  ProspeoEnvelope,
  ProspeoSearchPersonRequest,
  ProspeoSearchPersonResponse,
  ProspeoSearchPersonResult,
} from "./prospeo.types";
import {
  normalizeDepartments,
  normalizeFundingStages,
  normalizeHeadcountRanges,
  normalizeIndustries,
  normalizeSeniorities,
} from "./prospeo.vocabulary";
import { ProspeoLocationResolver, RawRequester } from "./prospeo.locations";

const DEFAULT_BASE_URL = "https://api.prospeo.io";
const SEARCH_PER_PAGE = 25;
// Max times we'll drop a filter group and retry on Prospeo INVALID_FILTERS
// errors before surfacing the failure to the caller.
const MAX_FILTER_RELAX_RETRIES = 4;

// Filter groups in priority order for automatic relaxation. Earlier entries
// are dropped first because their enum vocabularies are the most fragile;
// later entries (titles, locations, domains) carry the actual search intent
// and we'd rather fail than strip them.
const RELAXATION_PRIORITY = [
  "company_headcount_range",
  "company_industry",
  "company_funding",
  "company_technology",
  "company_email_provider",
  "person_seniority",
  "person_departments",
  "person_year_of_experience",
  "company_location",
  "person_location",
  "person_job_title",
  "company_names",
  "company_websites",
] as const;
type RelaxableGroup = (typeof RELAXATION_PRIORITY)[number];

export type ProspeoProviderConfig = {
  apiBaseUrl?: string;
};

@Injectable()
export class ProspeoProvider extends AbstractEnrichmentProvider {
  readonly type = EnrichmentProviderType.prospeo;

  readonly capabilities: EnrichmentCapabilities = {
    byEmail: true,
    byDomain: true,
    byLinkedIn: true,
    byNameCompany: true,
    byPhone: false,
    emailVerify: true,
    returnsPhone: true,
    returnsEmail: true,
    returnsCompanyData: true,
    returnsSocialProfiles: true,
    leadSearch: true,
    leadSearchMaxPerPage: SEARCH_PER_PAGE,
    rateLimit: { requestsPerMinute: 60, burst: 5 },
  };

  private readonly baseUrl: string;
  private readonly locations: ProspeoLocationResolver;

  constructor(config: ProspeoProviderConfig = {}) {
    super();
    this.baseUrl = (config.apiBaseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    const rawRequester: RawRequester = (input) =>
      this.request({
        method: input.method,
        url: input.url,
        headers: input.headers,
        body: input.body,
        timeoutMs: input.timeoutMs,
      });
    this.locations = new ProspeoLocationResolver(this.baseUrl, rawRequester);
  }

  // ── Auth & account ──

  async validateCredentials(
    creds: EnrichmentCredentials,
  ): Promise<EnrichmentAccountInfo> {
    const env = await this.callEnvelope<ProspeoAccountInfoResponse>(
      creds,
      "GET",
      "/account-information",
    );
    const info = env.response ?? {};
    return {
      accountId: info.email ?? "prospeo-account",
      accountName: info.email ?? null,
      metadata: {
        plan: info.plan,
        monthlyCredits: info.monthly_credits,
        remainingCredits: info.remaining_credits,
        resetDate: info.reset_date,
      },
    };
  }

  async getCredits(
    creds: EnrichmentCredentials,
  ): Promise<EnrichmentCreditsInfo> {
    const env = await this.callEnvelope<ProspeoAccountInfoResponse>(
      creds,
      "GET",
      "/account-information",
    );
    const info = env.response ?? {};
    return {
      remaining: info.remaining_credits ?? null,
      limit: info.monthly_credits ?? null,
      periodResetAt: info.reset_date ? new Date(info.reset_date) : null,
    };
  }

  // ── Enrichment (legacy email-finder endpoints) ──

  async enrichByDomain(
    creds: EnrichmentCredentials,
    domain: string,
    opts?: EnrichOpts,
  ): Promise<EnrichmentResult> {
    await this.acquireToken(creds.accountId);
    const env = await this.callEnvelope<ProspeoEmailFinderResponse>(
      creds,
      "POST",
      "/domain-search",
      { company: domain },
      opts?.timeoutMs,
    );
    return this.mapPersonResult(env);
  }

  async enrichByEmail(
    creds: EnrichmentCredentials,
    email: string,
    opts?: EnrichOpts,
  ): Promise<EnrichmentResult> {
    return this.enrichPerson(
      creds,
      { email },
      { revealPhone: opts?.revealPhone, timeoutMs: opts?.timeoutMs },
    );
  }

  async enrichByLinkedIn(
    creds: EnrichmentCredentials,
    linkedInUrl: string,
    opts?: EnrichOpts,
  ): Promise<EnrichmentResult> {
    return this.enrichPerson(
      creds,
      { linkedin_url: linkedInUrl },
      { revealPhone: opts?.revealPhone, timeoutMs: opts?.timeoutMs },
    );
  }

  async enrichByNameCompany(
    creds: EnrichmentCredentials,
    input: NameCompanyInput,
    opts?: EnrichOpts,
  ): Promise<EnrichmentResult> {
    const data: ProspeoEnrichPersonRequest["data"] = {};
    if (input.firstName) data.first_name = input.firstName;
    if (input.lastName) data.last_name = input.lastName;
    if (input.fullName) data.full_name = input.fullName;
    if (input.fullName && !input.firstName && !input.lastName) {
      const parts = input.fullName.trim().split(/\s+/);
      if (parts.length >= 2) {
        data.first_name = parts[0];
        data.last_name = parts.slice(1).join(" ");
      }
    }
    if (input.company) data.company_name = input.company;
    if (input.domain) data.company_website = input.domain;
    return this.enrichPerson(creds, data, {
      revealPhone: opts?.revealPhone,
      timeoutMs: opts?.timeoutMs,
    });
  }

  async verifyEmail(
    creds: EnrichmentCredentials,
    email: string,
  ): Promise<EmailVerificationResult> {
    await this.acquireToken(creds.accountId);
    const env = await this.callEnvelope<ProspeoEmailVerifierResponse>(
      creds,
      "POST",
      "/email-verifier",
      { email },
    );
    const r = env.response ?? {};
    const status = ((): EmailVerificationResult["status"] => {
      switch (r.status) {
        case "valid":
        case "deliverable":
          return "deliverable";
        case "invalid":
        case "undeliverable":
          return "undeliverable";
        case "risky":
        case "catch_all":
        case "accept_all":
          return "risky";
        default:
          return "unknown";
      }
    })();
    return {
      status,
      score: typeof r.score === "number" ? r.score : null,
      raw: env,
    };
  }

  // ── Lead Search (Prospeo /search-person) ──
  // Maps the full LeadSearchFilters surface to Prospeo's nested filter object.
  // Prospeo accepts any combination of company/person filter groups; we no
  // longer require companyDomains, but we DO require at least one usable
  // filter group so the API call isn't unbounded.

  async searchLeads(
    creds: EnrichmentCredentials,
    filters: LeadSearchFilters,
    opts?: LeadSearchOpts,
  ): Promise<LeadSearchResult> {
    // Resolve raw location strings to canonical Prospeo names via
    // /search-suggestions (free, no daily limit) before building filters.
    // Any unresolvable input is dropped — invalid locations are the #1 cause
    // of /search-person 400s and they cost us daily quota.
    const resolvedPersonLocations = await this.resolveLocations(creds, [
      ...(filters.personLocations ?? []),
      ...(filters.personCountries ?? []),
      ...(filters.personCities ?? []),
    ]);
    const resolvedCompanyLocations = await this.resolveLocations(creds, [
      ...(filters.companyLocations ?? []),
      ...(filters.companyCountries ?? []),
    ]);

    let prospeoFilters = this.buildSearchFilters(
      filters,
      resolvedPersonLocations,
      resolvedCompanyLocations,
    );
    if (!hasAnyFilter(prospeoFilters)) {
      throw new EnrichmentError(
        "VALIDATION",
        false,
        "Prospeo lead search requires at least one valid filter. After normalization (industries, headcount, seniorities, departments, locations all checked against Prospeo's vocabulary) nothing remained — try job titles or company domains instead.",
      );
    }

    const page = Math.max(1, opts?.page ?? 1);

    // Prospeo's /search-person is strict about enum vocab (headcount strings,
    // industry names, seniority codes). When the API rejects a filter group,
    // automatically drop the offending group and retry — agents typically
    // construct rich filter sets and shouldn't burn turns on validation
    // errors. We retry at most MAX_FILTER_RELAX_RETRIES times; each retry
    // drops one filter group in priority order.
    const droppedGroups: string[] = [];
    let res: ProspeoSearchPersonResponse | null = null;
    for (let attempt = 0; attempt <= MAX_FILTER_RELAX_RETRIES; attempt += 1) {
      await this.acquireToken(creds.accountId);
      const body: ProspeoSearchPersonRequest = {
        page,
        filters: prospeoFilters,
      };
      // Provider-side response is NOT wrapped in `response`; talk to it directly.
      res = await this.requestRaw<ProspeoSearchPersonResponse>(
        creds,
        "POST",
        "/search-person",
        body,
        opts?.timeoutMs,
      );

      if (!res.error) break;

      const filterIssue = res.filter_error ?? "";
      const code = (res.error_code ?? "").toUpperCase();
      const looksLikeFilterIssue =
        !!filterIssue ||
        code === "INVALID_FILTERS" ||
        code === "INVALID_REQUEST" ||
        code === "INVALID_DATAPOINTS";

      if (!looksLikeFilterIssue || attempt === MAX_FILTER_RELAX_RETRIES) {
        throw this.classifyProspeoError(
          res.error_code ?? res.filter_error,
          res.filter_error ?? res.error_code ?? "search-person failed",
          res,
        );
      }

      const target = pickFilterGroupToDrop(prospeoFilters, filterIssue);
      if (!target) {
        // Nothing safe left to drop — surface the original error.
        throw this.classifyProspeoError(
          res.error_code ?? res.filter_error,
          res.filter_error ?? res.error_code ?? "search-person failed",
          res,
        );
      }
      prospeoFilters = dropFilterGroup(prospeoFilters, target);
      droppedGroups.push(target);
      if (!hasAnyFilter(prospeoFilters)) {
        // All filters got dropped — refuse rather than make an unbounded call.
        throw this.classifyProspeoError(
          res.error_code ?? res.filter_error,
          res.filter_error ??
            res.error_code ??
            "Prospeo rejected every filter group provided",
          res,
        );
      }
    }

    if (!res || res.error) {
      throw new EnrichmentError(
        "VALIDATION",
        false,
        "Prospeo search-person failed after relaxation retries",
      );
    }

    const results = (res.results ?? []).map((r) =>
      this.mapSearchHitToCandidate(r),
    );
    const total = res.pagination?.total_count ?? results.length;
    const perPage = res.pagination?.per_page ?? SEARCH_PER_PAGE;
    const currentPage = res.pagination?.current_page ?? page;
    const totalPages = res.pagination?.total_page ?? 1;

    return {
      total,
      page: currentPage,
      perPage,
      hasMore: currentPage < totalPages,
      results,
      // Surface the relaxation trail on the raw payload so callers (and the
      // agent's tool result) can mention dropped filters if useful.
      raw:
        droppedGroups.length > 0
          ? { ...res, _relaxedFilters: droppedGroups }
          : res,
    };
  }

  /**
   * Reveal email (and optionally mobile) for a specific person returned by
   * /search-person. Mobile reveal costs significantly more; gate on opts.revealPhone.
   */
  async enrichByPersonId(
    creds: EnrichmentCredentials,
    personId: string,
    opts?: EnrichOpts,
  ): Promise<EnrichmentResult> {
    if (!personId) {
      throw new EnrichmentError(
        "VALIDATION",
        false,
        "personId required for Prospeo enrich-person",
      );
    }
    return this.enrichPerson(
      creds,
      { person_id: personId },
      { revealPhone: opts?.revealPhone, timeoutMs: opts?.timeoutMs },
    );
  }

  // ── Internals ──

  /**
   * Builds the Prospeo `/search-person` filters object. EVERY enum-typed
   * field is normalized against Prospeo's controlled vocabulary BEFORE the
   * request leaves us; invalid values are dropped silently because they cost
   * us a 400 (and burn daily search quota). Locations are pre-resolved by
   * the caller (resolveLocations) since that requires an async lookup.
   */
  private buildSearchFilters(
    filters: LeadSearchFilters,
    resolvedPersonLocations: string[],
    resolvedCompanyLocations: string[],
  ): ProspeoSearchPersonRequest["filters"] {
    const out: ProspeoSearchPersonRequest["filters"] = {};

    const domains = (filters.companyDomains ?? [])
      .map((d) => normalizeDomain(d))
      .filter((d): d is string => !!d);
    const companyNamesInclude = uniqueStrings(filters.companyNames);

    if (domains.length || companyNamesInclude.length) {
      out.company = {};
      if (domains.length) out.company.websites = { include: domains };
      if (companyNamesInclude.length)
        out.company.names = { include: companyNamesInclude };
    }

    const industriesInclude = normalizeIndustries(filters.industries);
    const industriesExclude = normalizeIndustries(filters.industriesExclude);
    if (industriesInclude.length || industriesExclude.length) {
      out.company_industry = {};
      if (industriesInclude.length)
        out.company_industry.include = industriesInclude;
      if (industriesExclude.length)
        out.company_industry.exclude = industriesExclude;
    }

    if (resolvedCompanyLocations.length) {
      out.company_location = { include: resolvedCompanyLocations };
    }

    const headcount = normalizeHeadcountRanges(filters.employeeCountRanges);
    if (headcount.length) {
      out.company_headcount_range = { include: headcount };
    }

    const fundings = normalizeFundingStages(filters.fundingStages);
    if (fundings.length) {
      out.company_funding = { include: fundings };
    }

    const technologies = uniqueStrings(filters.technologies);
    if (technologies.length) {
      out.company_technology = { include: technologies };
    }

    const seniorities = normalizeSeniorities(filters.seniorities);
    if (seniorities.length) {
      out.person_seniority = { include: seniorities };
    }

    if (
      typeof filters.yearsExperienceMin === "number" ||
      typeof filters.yearsExperienceMax === "number"
    ) {
      out.person_year_of_experience = {};
      if (typeof filters.yearsExperienceMin === "number")
        out.person_year_of_experience.min = filters.yearsExperienceMin;
      if (typeof filters.yearsExperienceMax === "number")
        out.person_year_of_experience.max = filters.yearsExperienceMax;
    }

    if (resolvedPersonLocations.length) {
      out.person_location = { include: resolvedPersonLocations };
    }

    const jobTitles = uniqueStrings(filters.jobTitles);
    const jobTitlesExclude = uniqueStrings(filters.jobTitlesExclude);
    if (jobTitles.length || jobTitlesExclude.length) {
      out.person_job_title = {};
      if (jobTitles.length) out.person_job_title.include = jobTitles;
      if (jobTitlesExclude.length)
        out.person_job_title.exclude = jobTitlesExclude;
    }

    const departments = normalizeDepartments(filters.departments);
    if (departments.length) {
      out.person_departments = { include: departments };
    }

    return out;
  }

  /**
   * Resolves user-supplied location strings (ISO codes, country names, city
   * names) to the canonical form Prospeo's /search-person accepts. Hits
   * /search-suggestions for unknown inputs — free per Prospeo's pricing,
   * rate-limited at 15 req/s, no daily limit. Cached per-instance.
   */
  private async resolveLocations(
    creds: EnrichmentCredentials,
    raws: (string | null | undefined)[],
  ): Promise<string[]> {
    if (raws.length === 0) return [];
    return this.locations.resolveMany(creds.apiKey, raws);
  }

  /**
   * Unified call to Prospeo /enrich-person — supports lookup by person_id,
   * linkedin_url, email, or name+company. Returns NOT_FOUND for empty results.
   */
  private async enrichPerson(
    creds: EnrichmentCredentials,
    data: ProspeoEnrichPersonRequest["data"],
    opts: { revealPhone?: boolean; timeoutMs?: number } = {},
  ): Promise<EnrichmentResult> {
    if (!data || Object.keys(data).length === 0) {
      throw new EnrichmentError(
        "VALIDATION",
        false,
        "Prospeo /enrich-person requires person_id, linkedin_url, email, or name + company.",
      );
    }
    await this.acquireToken(creds.accountId);
    const body: ProspeoEnrichPersonRequest = {
      data,
      enrich_mobile: !!opts.revealPhone,
    };
    const res = await this.requestRaw<ProspeoEnrichPersonResponse>(
      creds,
      "POST",
      "/enrich-person",
      body as unknown as Record<string, unknown>,
      opts.timeoutMs,
    );

    if (res.error) {
      throw this.classifyProspeoError(
        res.error_code,
        res.error_code ?? "enrich-person failed",
        res,
      );
    }

    return this.mapEnrichPersonResult(res);
  }

  private mapPersonResult(
    env: ProspeoEnvelope<ProspeoEmailFinderResponse>,
  ): EnrichmentResult {
    const r = env.response ?? {};
    const email = r.email ?? r.raw_format ?? null;
    const found = !!(email || r.first_name || r.linkedin_url);
    if (!found) {
      return {
        found: false,
        confidence: null,
        person: null,
        company: null,
        raw: env,
      };
    }
    const emailVerified = r.email_status === "valid";
    return {
      found: true,
      confidence: emailVerified ? 0.9 : 0.7,
      person: {
        firstName: r.first_name ?? null,
        lastName: r.last_name ?? null,
        fullName:
          r.first_name && r.last_name
            ? `${r.first_name} ${r.last_name}`
            : (r.first_name ?? r.last_name ?? null),
        jobTitle: r.position ?? null,
        emails: email
          ? [{ value: email, type: "work", verified: emailVerified }]
          : [],
        phones: [],
        socialProfiles: r.linkedin_url
          ? [{ platform: "linkedin", url: r.linkedin_url }]
          : [],
        linkedinUrl: r.linkedin_url ?? null,
      },
      company:
        r.company || r.domain
          ? { name: r.company ?? null, domain: r.domain ?? null }
          : null,
      raw: env,
      providerCost: 1,
    };
  }

  private mapSearchHitToCandidate(
    hit: ProspeoSearchPersonResult,
  ): LeadCandidate {
    const p = hit.person ?? {};
    const c = hit.company ?? {};
    const fullName =
      p.full_name ??
      [p.first_name, p.last_name].filter(Boolean).join(" ") ??
      null;
    const person: EnrichedPerson = {
      firstName: p.first_name ?? null,
      lastName: p.last_name ?? null,
      fullName,
      jobTitle: p.current_job_title ?? null,
      headline: p.headline ?? null,
      linkedinUrl: p.linkedin_url ?? null,
      location: p.location
        ? {
            city: p.location.city ?? null,
            region: p.location.state ?? null,
            country: p.location.country ?? null,
            countryCode: p.location.country_code ?? null,
          }
        : null,
      timezone: p.location?.time_zone ?? null,
      skills: p.skills ?? null,
      // Email & mobile NOT included in /search-person; revealed via /enrich-person.
      emails: [],
      phones: [],
      socialProfiles: p.linkedin_url
        ? [{ platform: "linkedin", url: p.linkedin_url }]
        : [],
    };
    const company: EnrichedCompany | null =
      c.name || c.domain || c.website
        ? {
            name: c.name ?? null,
            domain: c.domain ?? null,
            website: c.website ?? null,
            description: c.description ?? null,
            industry: c.industry ?? null,
            employeeCount: c.employee_count ?? null,
            employeeCountRange: c.employee_count_range ?? null,
            linkedinUrl: c.linkedin_url ?? null,
            foundedYear: c.founded ?? null,
            hq: c.location
              ? {
                  city: c.location.city ?? null,
                  region: c.location.state ?? null,
                  country: c.location.country ?? null,
                  countryCode: c.location.country_code ?? null,
                }
              : null,
          }
        : null;

    return {
      externalId: p.person_id ?? "",
      provider: EnrichmentProviderType.prospeo,
      person,
      company,
      confidence: 0.8,
      raw: hit,
    };
  }

  private mapEnrichPersonResult(
    res: ProspeoEnrichPersonResponse,
  ): EnrichmentResult {
    const p = res.person ?? {};
    const c = res.company ?? {};
    const found = !!(p.person_id || p.first_name || p.linkedin_url);
    if (!found) {
      return {
        found: false,
        confidence: null,
        person: null,
        company: null,
        raw: res,
      };
    }

    const emailRaw = p.email?.email ?? null;
    const emailVerified = p.email?.status === "VERIFIED";
    const mobileRaw = p.mobile?.mobile ?? null;
    const mobileVerified = p.mobile?.status === "VERIFIED";

    const fullName =
      p.full_name ??
      [p.first_name, p.last_name].filter(Boolean).join(" ") ??
      null;

    const person: EnrichedPerson = {
      firstName: p.first_name ?? null,
      lastName: p.last_name ?? null,
      fullName,
      jobTitle: p.current_job_title ?? null,
      headline: p.headline ?? null,
      linkedinUrl: p.linkedin_url ?? null,
      location: p.location
        ? {
            city: p.location.city ?? null,
            region: p.location.state ?? null,
            country: p.location.country ?? null,
            countryCode: p.location.country_code ?? null,
          }
        : null,
      timezone: p.location?.time_zone ?? null,
      skills: p.skills ?? null,
      emails: emailRaw
        ? [
            {
              value: emailRaw,
              type: "work",
              verified: emailVerified,
            },
          ]
        : [],
      phones: mobileRaw
        ? [
            {
              value: mobileRaw,
              type: "mobile",
              verified: mobileVerified,
            },
          ]
        : [],
      socialProfiles: p.linkedin_url
        ? [{ platform: "linkedin", url: p.linkedin_url }]
        : [],
      workHistory:
        p.job_history?.map((j) => ({
          company: j.company ?? null,
          title: j.title ?? null,
          startDate: j.start_date ? new Date(j.start_date) : null,
          endDate: j.end_date ? new Date(j.end_date) : null,
          current: j.current ?? null,
        })) ?? null,
    };

    const company: EnrichedCompany | null =
      c.name || c.domain || c.website
        ? {
            name: c.name ?? null,
            domain: c.domain ?? null,
            website: c.website ?? null,
            description: c.description ?? null,
            industry: c.industry ?? null,
            employeeCount: c.employee_count ?? null,
            employeeCountRange: c.employee_count_range ?? null,
            linkedinUrl: c.linkedin_url ?? null,
            foundedYear: c.founded ?? null,
            hq: c.location
              ? {
                  city: c.location.city ?? null,
                  region: c.location.state ?? null,
                  country: c.location.country ?? null,
                  countryCode: c.location.country_code ?? null,
                }
              : null,
          }
        : null;

    return {
      found: true,
      confidence: emailVerified || mobileVerified ? 0.95 : 0.8,
      person,
      company,
      raw: res,
      providerCost: mobileRaw ? 10 : res.free_enrichment ? 0 : 1,
    };
  }

  private async callEnvelope<T>(
    creds: EnrichmentCredentials,
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<ProspeoEnvelope<T>> {
    const env = await this.requestRaw<ProspeoEnvelope<T>>(
      creds,
      method,
      path,
      body,
      timeoutMs,
    );
    if (env.error) {
      throw this.classifyProspeoError(
        env.error_code,
        env.message ?? env.error_code ?? "prospeo error",
        env,
      );
    }
    return env;
  }

  private requestRaw<T>(
    creds: EnrichmentCredentials,
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<T> {
    return this.request<T>({
      method,
      url: `${this.baseUrl}${path}`,
      headers: { "X-KEY": creds.apiKey },
      body,
      timeoutMs,
    });
  }

  private classifyProspeoError(
    errorCode: string | undefined,
    message: string,
    raw: unknown,
  ): EnrichmentError {
    const code = (errorCode ?? "").toUpperCase();
    if (code === "INSUFFICIENT_CREDITS")
      return new EnrichmentError(
        "QUOTA_EXCEEDED",
        false,
        message,
        undefined,
        raw,
      );
    if (code === "INVALID_API_KEY")
      return new EnrichmentError(
        "INVALID_CREDENTIALS",
        false,
        message,
        undefined,
        raw,
      );
    if (code === "RATE_LIMITED")
      return new EnrichmentError("RATE_LIMITED", true, message, undefined, raw);
    if (code === "NO_MATCH" || code === "NO_RESULTS")
      return new EnrichmentError("NOT_FOUND", false, message, undefined, raw);
    if (
      code === "INVALID_FILTERS" ||
      code === "INVALID_DATAPOINTS" ||
      code === "INVALID_REQUEST"
    )
      return new EnrichmentError("VALIDATION", false, message, undefined, raw);
    if (/credit|quota|limit/i.test(message))
      return new EnrichmentError(
        "QUOTA_EXCEEDED",
        false,
        message,
        undefined,
        raw,
      );
    if (/not found|no result|no match/i.test(message))
      return new EnrichmentError("NOT_FOUND", false, message, undefined, raw);
    return new EnrichmentError("VALIDATION", false, message, undefined, raw);
  }
}

function uniqueStrings(input: string[] | undefined): string[] {
  if (!input) return [];
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

function collectLocations(values: (string | null | undefined)[]): string[] {
  return uniqueStrings(values.filter((v): v is string => !!v && v.trim().length > 0));
}

// ISO 3166-1 alpha-2 → country name for the codes most likely to come from
// the agent's normalized filters. Unknown codes pass through unchanged so
// Prospeo can still receive raw strings the user typed (e.g. "Spain").
const ISO_COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  CA: "Canada",
  MX: "Mexico",
  GT: "Guatemala",
  HN: "Honduras",
  SV: "El Salvador",
  NI: "Nicaragua",
  CR: "Costa Rica",
  PA: "Panama",
  CO: "Colombia",
  VE: "Venezuela",
  EC: "Ecuador",
  PE: "Peru",
  BO: "Bolivia",
  CL: "Chile",
  AR: "Argentina",
  PY: "Paraguay",
  UY: "Uruguay",
  BR: "Brazil",
  DO: "Dominican Republic",
  PR: "Puerto Rico",
  CU: "Cuba",
  ES: "Spain",
  PT: "Portugal",
  FR: "France",
  DE: "Germany",
  IT: "Italy",
  GB: "United Kingdom",
  UK: "United Kingdom",
  IE: "Ireland",
  NL: "Netherlands",
  BE: "Belgium",
  CH: "Switzerland",
  AT: "Austria",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  PL: "Poland",
  AU: "Australia",
  NZ: "New Zealand",
  IN: "India",
  SG: "Singapore",
  PH: "Philippines",
  JP: "Japan",
  KR: "South Korea",
  CN: "China",
  HK: "Hong Kong",
  TW: "Taiwan",
  AE: "United Arab Emirates",
  SA: "Saudi Arabia",
  IL: "Israel",
  TR: "Turkey",
  ZA: "South Africa",
};

function countryToName(input: string): string {
  if (!input) return input;
  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && ISO_COUNTRY_NAMES[upper]) {
    return ISO_COUNTRY_NAMES[upper];
  }
  return trimmed;
}

function hasGroup(
  f: ProspeoSearchPersonRequest["filters"],
  group: RelaxableGroup,
): boolean {
  switch (group) {
    case "company_websites":
      return !!f.company?.websites?.include?.length;
    case "company_names":
      return !!f.company?.names?.include?.length;
    case "company_industry":
      return !!(
        f.company_industry?.include?.length || f.company_industry?.exclude?.length
      );
    case "company_location":
      return !!f.company_location?.include?.length;
    case "company_headcount_range":
      return !!f.company_headcount_range?.include?.length;
    case "company_funding":
      return !!f.company_funding?.include?.length;
    case "company_technology":
      return !!f.company_technology?.include?.length;
    case "company_email_provider":
      return !!f.company_email_provider?.include?.length;
    case "person_seniority":
      return !!f.person_seniority?.include?.length;
    case "person_year_of_experience":
      return (
        typeof f.person_year_of_experience?.min === "number" ||
        typeof f.person_year_of_experience?.max === "number"
      );
    case "person_location":
      return !!f.person_location?.include?.length;
    case "person_job_title":
      return !!(
        f.person_job_title?.include?.length || f.person_job_title?.exclude?.length
      );
    case "person_departments":
      return !!f.person_departments?.include?.length;
    default:
      return false;
  }
}

function pickFilterGroupToDrop(
  f: ProspeoSearchPersonRequest["filters"],
  filterIssue: string,
): RelaxableGroup | null {
  // First, try to identify the offending group from Prospeo's filter_error
  // message — it usually mentions the field name (e.g. "company_headcount_range").
  const lc = filterIssue.toLowerCase();
  for (const group of RELAXATION_PRIORITY) {
    if (lc.includes(group) && hasGroup(f, group)) return group;
  }
  // Fall back to priority order: drop the first present group.
  for (const group of RELAXATION_PRIORITY) {
    if (hasGroup(f, group)) return group;
  }
  return null;
}

function dropFilterGroup(
  f: ProspeoSearchPersonRequest["filters"],
  group: RelaxableGroup,
): ProspeoSearchPersonRequest["filters"] {
  const next: ProspeoSearchPersonRequest["filters"] = { ...f };
  if (group === "company_websites" || group === "company_names") {
    if (!next.company) return next;
    const company = { ...next.company };
    if (group === "company_websites") delete company.websites;
    else delete company.names;
    if (!company.websites && !company.names) delete next.company;
    else next.company = company;
    return next;
  }
  delete (next as Record<string, unknown>)[group];
  return next;
}

function hasAnyFilter(f: ProspeoSearchPersonRequest["filters"]): boolean {
  const company = f.company;
  if (company && (company.websites?.include?.length || company.names?.include?.length))
    return true;
  if (f.company_industry?.include?.length || f.company_industry?.exclude?.length)
    return true;
  if (f.company_location?.include?.length) return true;
  if (f.company_headcount_range?.include?.length) return true;
  if (f.company_funding?.include?.length) return true;
  if (f.company_technology?.include?.length) return true;
  if (f.person_seniority?.include?.length) return true;
  if (
    typeof f.person_year_of_experience?.min === "number" ||
    typeof f.person_year_of_experience?.max === "number"
  )
    return true;
  if (f.person_location?.include?.length) return true;
  if (f.person_job_title?.include?.length || f.person_job_title?.exclude?.length)
    return true;
  if (f.person_departments?.include?.length) return true;
  return false;
}

function normalizeDomain(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Strip scheme + trailing path. Accepts "ringee.io", "https://ringee.io/foo".
  try {
    const withScheme = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(withScheme);
    return url.hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return trimmed.replace(/^www\./i, "").toLowerCase();
  }
}
