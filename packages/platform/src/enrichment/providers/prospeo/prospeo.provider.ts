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
  ProspeoLinkedInResponse,
  ProspeoMobileResponse,
  ProspeoSearchPersonRequest,
  ProspeoSearchPersonResponse,
  ProspeoSearchPersonResult,
} from "./prospeo.types";

const DEFAULT_BASE_URL = "https://api.prospeo.io";
const SEARCH_PER_PAGE = 25;

export type ProspeoProviderConfig = {
  apiBaseUrl?: string;
};

@Injectable()
export class ProspeoProvider extends AbstractEnrichmentProvider {
  readonly type = EnrichmentProviderType.prospeo;

  readonly capabilities: EnrichmentCapabilities = {
    byEmail: false,
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

  constructor(config: ProspeoProviderConfig = {}) {
    super();
    this.baseUrl = (config.apiBaseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
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

  async enrichByLinkedIn(
    creds: EnrichmentCredentials,
    linkedInUrl: string,
    opts?: EnrichOpts,
  ): Promise<EnrichmentResult> {
    await this.acquireToken(creds.accountId);
    const env = await this.callEnvelope<ProspeoLinkedInResponse>(
      creds,
      "POST",
      "/linkedin-email-finder",
      { url: linkedInUrl },
      opts?.timeoutMs,
    );
    const result = this.mapPersonResult(env);
    if (result.found && opts?.revealPhone && env.response?.linkedin_url) {
      const mobile = await this.tryEnrichMobile(creds, linkedInUrl);
      if (mobile && result.person) result.person.phones.push(mobile);
    }
    return result;
  }

  async enrichByNameCompany(
    creds: EnrichmentCredentials,
    input: NameCompanyInput,
    opts?: EnrichOpts,
  ): Promise<EnrichmentResult> {
    await this.acquireToken(creds.accountId);
    const body: Record<string, string> = {};
    if (input.firstName) body.first_name = input.firstName;
    if (input.lastName) body.last_name = input.lastName;
    if (input.fullName && !input.firstName && !input.lastName) {
      const parts = input.fullName.trim().split(/\s+/);
      body.first_name = parts[0] ?? "";
      body.last_name = parts.slice(1).join(" ") ?? "";
    }
    if (input.company) body.company = input.company;
    if (input.domain) body.domain = input.domain;

    const env = await this.callEnvelope<ProspeoEmailFinderResponse>(
      creds,
      "POST",
      "/email-finder",
      body,
      opts?.timeoutMs,
    );
    return this.mapPersonResult(env);
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

  // ── Lead Search (Prospeo /search-person, domain-driven) ──

  async searchLeads(
    creds: EnrichmentCredentials,
    filters: LeadSearchFilters,
    opts?: LeadSearchOpts,
  ): Promise<LeadSearchResult> {
    const domains = (filters.companyDomains ?? [])
      .map((d) => normalizeDomain(d))
      .filter((d): d is string => !!d);

    if (domains.length === 0) {
      throw new EnrichmentError(
        "VALIDATION",
        false,
        "Prospeo lead search requires at least one company domain (e.g. ringee.io).",
      );
    }

    const page = Math.max(1, opts?.page ?? 1);

    await this.acquireToken(creds.accountId);
    const body: ProspeoSearchPersonRequest = {
      page,
      filters: {
        company: { websites: { include: domains } },
      },
    };

    // Provider-side response is NOT wrapped in `response`; talk to it directly.
    const res = await this.requestRaw<ProspeoSearchPersonResponse>(
      creds,
      "POST",
      "/search-person",
      body,
      opts?.timeoutMs,
    );

    if (res.error) {
      throw this.classifyProspeoError(
        res.error_code ?? res.filter_error,
        res.filter_error ?? res.error_code ?? "search-person failed",
        res,
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
      raw: res,
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
    await this.acquireToken(creds.accountId);
    const body: ProspeoEnrichPersonRequest = {
      data: { person_id: personId },
      enrich_mobile: !!opts?.revealPhone,
    };
    const res = await this.requestRaw<ProspeoEnrichPersonResponse>(
      creds,
      "POST",
      "/enrich-person",
      body,
      opts?.timeoutMs,
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

  // ── Internals ──

  private async tryEnrichMobile(
    creds: EnrichmentCredentials,
    linkedInUrl: string,
  ): Promise<{ value: string; type: string } | null> {
    try {
      const env = await this.callEnvelope<ProspeoMobileResponse>(
        creds,
        "POST",
        "/mobile-finder",
        { url: linkedInUrl },
      );
      const r = env.response ?? {};
      const value = r.international_format ?? r.raw_format ?? null;
      if (!value) return null;
      return { value, type: "mobile" };
    } catch (err) {
      if (err instanceof EnrichmentError && err.code === "NOT_FOUND")
        return null;
      throw err;
    }
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
      return new EnrichmentError("QUOTA_EXCEEDED", false, message, undefined, raw);
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
    if (code === "INVALID_FILTERS" || code === "INVALID_DATAPOINTS" || code === "INVALID_REQUEST")
      return new EnrichmentError("VALIDATION", false, message, undefined, raw);
    if (/credit|quota|limit/i.test(message))
      return new EnrichmentError("QUOTA_EXCEEDED", false, message, undefined, raw);
    if (/not found|no result|no match/i.test(message))
      return new EnrichmentError("NOT_FOUND", false, message, undefined, raw);
    return new EnrichmentError("VALIDATION", false, message, undefined, raw);
  }
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
