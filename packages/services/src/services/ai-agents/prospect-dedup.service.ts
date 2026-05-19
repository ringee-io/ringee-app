import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import {
  ContactDedupMatch,
  ContactRepository,
  DNCEntryRepository,
  EnrichmentProviderType,
  LeadSearchJob,
  LeadSearchJobRepository,
} from "@ringee/database";
import {
  LeadCandidate,
  LeadSearchFilters,
  LeadSearchResult,
  OwnershipContext,
} from "@ringee/platform";

/**
 * ProspectDedupService — search deduplication, result memory and credit
 * protection for the Ringee prospecting agent.
 *
 * Two responsibilities:
 *  1. SEARCH-level dedup — before a provider is called, decide whether the
 *     normalized search intent matches (or is highly similar to) a recent
 *     search run, so the agent can reuse results instead of spending credits.
 *  2. LEAD-level dedup — after results come back, classify every candidate
 *     against existing Ringee contacts, the DNC list and earlier search runs
 *     so duplicates and already-revealed leads are surfaced clearly.
 *
 * No new persistence is introduced: a `LeadSearchJob` row already IS the
 * remembered search run. Similarity is computed in-memory over the owner's
 * recent runs.
 */

// ── Search-level types ─────────────────────────────────────────────────────

export type DedupAction =
  | "show_previous"
  | "next_page"
  | "broaden"
  | "narrow"
  | "refresh";

/** A previous search run, summarized for the agent and the decision UI. */
export interface SearchRunSummary {
  jobId: string;
  provider: string;
  page: number;
  perPage: number;
  /** Total results the provider reported for the run. */
  totalResults: number;
  /** Leads actually stored in the run snapshot. */
  leadCount: number;
  /** Leads in the snapshot that already have an email or phone revealed. */
  revealedCount: number;
  /** Normalized-intent overlap with the requested search (0..1). */
  similarity: number;
  /** True when this run used the same page as the requested search. */
  samePage: boolean;
  ageHours: number;
  /** True while the run is within the provider's freshness window. */
  fresh: boolean;
  ranAt: string;
  filtersSummary: string;
}

export interface SearchDedupInput {
  provider: EnrichmentProviderType;
  filters: LeadSearchFilters;
  page: number;
  perPage: number;
}

export interface SearchDedupResult {
  /** How the requested search relates to the closest previous run. */
  relationship: "identical" | "similar" | "none";
  /**
   * True when the agent should NOT silently call the provider — a fresh
   * identical/similar run exists and credits would be wasted.
   */
  shouldReuse: boolean;
  /** Provider freshness window applied, in hours. */
  freshnessWindowHours: number;
  match: SearchRunSummary | null;
  recommendedActions: DedupAction[];
  /** Human-readable explanation handed to the LLM. */
  message: string;
}

// ── Lead-level types ───────────────────────────────────────────────────────

export type LeadStatus =
  | "new"
  | "seen_before"
  | "already_saved"
  | "already_called"
  | "on_dnc"
  | "duplicate_provider";

export interface LeadDedupInfo {
  status: LeadStatus;
  reasons: string[];
  matchedContactId: string | null;
  /** True when Ringee already stores an email for this lead. */
  ringeeHasEmail: boolean;
  /** True when Ringee already stores a real (non-placeholder) phone. */
  ringeeHasPhone: boolean;
}

export interface LeadDedupSummary {
  total: number;
  new: number;
  seenBefore: number;
  alreadySaved: number;
  alreadyCalled: number;
  onDnc: number;
  duplicateProvider: number;
}

export interface LeadDedupReport {
  byExternalId: Record<string, LeadDedupInfo>;
  summary: LeadDedupSummary;
}

// ── Tuning constants ───────────────────────────────────────────────────────

/**
 * Per-provider freshness windows. An identical search inside this window is
 * treated as still-fresh: reuse the cached results instead of spending
 * credits. Prospeo data moves slowly and reveals are expensive, so it gets a
 * long window; Apollo's open index changes faster.
 */
const PROVIDER_FRESHNESS_HOURS: Record<string, number> = {
  prospeo: 7 * 24,
  apollo: 48,
};
const DEFAULT_FRESHNESS_HOURS = 72;

/** Jaccard overlap at/above which two searches are "highly similar". */
const SIMILARITY_THRESHOLD = 0.6;

/** Only runs completed within this window are considered for dedup at all. */
const LOOKBACK_DAYS = 30;

/** How many recent runs to scan per dedup check. */
const RECENT_RUN_LIMIT = 60;

/** Phone prefixes used as placeholders when no real number was available. */
const PLACEHOLDER_PHONE = /^(lead:|nophone:|prospeo:|apollo:)/i;

@Injectable()
export class ProspectDedupService {
  private readonly logger = new Logger(ProspectDedupService.name);

  constructor(
    private readonly leadJobs: LeadSearchJobRepository,
    private readonly contacts: ContactRepository,
    private readonly dnc: DNCEntryRepository,
  ) {}

  // ── Search-level dedup ───────────────────────────────────────────────────

  /**
   * Compare a requested search against the owner's recent runs. Returns the
   * closest match (identical or highly similar), whether it is still fresh,
   * and the actions the agent should offer instead of re-searching.
   */
  async checkSearch(
    ctx: OwnershipContext,
    input: SearchDedupInput,
  ): Promise<SearchDedupResult> {
    const freshnessWindowHours =
      PROVIDER_FRESHNESS_HOURS[input.provider] ?? DEFAULT_FRESHNESS_HOURS;

    let runs: LeadSearchJob[];
    try {
      runs = await this.leadJobs.listRecentForOwner({
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
        since: new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
        limit: RECENT_RUN_LIMIT,
      });
    } catch (err) {
      // Dedup is a best-effort optimization — never block a search on it.
      this.logger.warn(`search dedup lookup failed: ${asMessage(err)}`);
      return this.noMatch(freshnessWindowHours);
    }

    const requestedHash = hashFilters(input.filters);
    const requestedTokens = intentTokens(input.filters);

    let best:
      | { run: LeadSearchJob; kind: "identical" | "similar"; similarity: number }
      | null = null;

    for (const run of runs) {
      if (run.provider !== input.provider) continue;

      const identical = run.filtersHash === requestedHash;
      // Identical filters on a different page is normal pagination, not a
      // duplicate — leave it for the agent's "next page" flow.
      if (identical && run.page !== input.page) continue;

      const similarity = identical
        ? 1
        : jaccard(requestedTokens, intentTokens(asFilters(run.filters)));
      if (!identical && similarity < SIMILARITY_THRESHOLD) continue;

      const kind = identical ? "identical" : "similar";
      if (
        !best ||
        (kind === "identical" && best.kind !== "identical") ||
        (kind === best.kind && similarity > best.similarity)
      ) {
        best = { run, kind, similarity };
      }
      if (best.kind === "identical" && best.similarity === 1) break;
    }

    if (!best) return this.noMatch(freshnessWindowHours);

    const summary = this.summarizeRun(
      best.run,
      best.similarity,
      best.run.page === input.page,
      freshnessWindowHours,
    );
    const relationship = best.kind;
    const shouldReuse = summary.fresh;
    const recommendedActions: DedupAction[] =
      relationship === "identical"
        ? ["show_previous", "next_page", "broaden", "refresh"]
        : ["next_page", "narrow", "broaden", "show_previous", "refresh"];

    return {
      relationship,
      shouldReuse,
      freshnessWindowHours,
      match: summary,
      recommendedActions,
      message: this.buildMessage(relationship, summary, freshnessWindowHours),
    };
  }

  private noMatch(freshnessWindowHours: number): SearchDedupResult {
    return {
      relationship: "none",
      shouldReuse: false,
      freshnessWindowHours,
      match: null,
      recommendedActions: [],
      message: "No similar recent search — safe to run.",
    };
  }

  private summarizeRun(
    run: LeadSearchJob,
    similarity: number,
    samePage: boolean,
    freshnessWindowHours: number,
  ): SearchRunSummary {
    const snapshot = asResult(run.resultSnapshot);
    const leads = snapshot?.results ?? [];
    const revealedCount = leads.filter(
      (c) =>
        (c.person?.emails?.length ?? 0) > 0 ||
        (c.person?.phones?.length ?? 0) > 0,
    ).length;
    const ranAt = run.completedAt ?? run.createdAt;
    const ageHours = (Date.now() - ranAt.getTime()) / (60 * 60 * 1000);

    return {
      jobId: run.id,
      provider: run.provider,
      page: run.page,
      perPage: run.perPage,
      totalResults: run.totalResults ?? leads.length,
      leadCount: leads.length,
      revealedCount,
      similarity: Math.round(similarity * 100) / 100,
      samePage,
      ageHours: Math.round(ageHours * 10) / 10,
      fresh: ageHours <= freshnessWindowHours,
      ranAt: ranAt.toISOString(),
      filtersSummary: summarizeFilters(asFilters(run.filters)),
    };
  }

  private buildMessage(
    relationship: "identical" | "similar",
    m: SearchRunSummary,
    windowHours: number,
  ): string {
    const age = humanizeHours(m.ageHours);
    const provider = capitalize(m.provider);
    const revealed =
      m.revealedCount > 0
        ? ` ${m.revealedCount} of them already had contact data revealed.`
        : "";

    if (relationship === "identical") {
      if (m.fresh) {
        return (
          `The user already ran this exact search on ${provider} ${age} ago ` +
          `(${m.leadCount} leads).${revealed} It is still fresh — within the ` +
          `${humanizeHours(windowHours)} window for ${provider}. Do NOT spend ` +
          `credits re-running it. Offer to show the previous results, search ` +
          `the next page, broaden or narrow the filters, or refresh anyway.`
        );
      }
      return (
        `The user ran this exact search on ${provider} ${age} ago ` +
        `(${m.leadCount} leads), which is older than the ` +
        `${humanizeHours(windowHours)} freshness window. Tell them it is old ` +
        `enough to refresh, and offer to refresh or reuse the previous results.`
      );
    }

    // similar
    const pct = Math.round(m.similarity * 100);
    if (m.fresh) {
      return (
        `This search is ${pct}% similar to one the user ran on ${provider} ` +
        `${age} ago (${m.leadCount} leads).${revealed} It will likely return ` +
        `many of the same leads. Recommend searching the next page or ` +
        `adjusting the filters, and ask before spending credits.`
      );
    }
    return (
      `This search is ${pct}% similar to one the user ran on ${provider} ` +
      `${age} ago. That run is past its freshness window, so refreshing is ` +
      `reasonable — but a near-identical search may still repeat leads.`
    );
  }

  // ── Lead-level dedup ─────────────────────────────────────────────────────

  /**
   * Classify every candidate against existing Ringee contacts, the DNC list,
   * earlier search runs and the rest of the current result set.
   */
  async classifyCandidates(
    ctx: OwnershipContext,
    candidates: LeadCandidate[],
    opts: { excludeJobId?: string } = {},
  ): Promise<LeadDedupReport> {
    const byExternalId: Record<string, LeadDedupInfo> = {};
    for (const c of candidates) {
      byExternalId[c.externalId] = {
        status: "new",
        reasons: [],
        matchedContactId: null,
        ringeeHasEmail: false,
        ringeeHasPhone: false,
      };
    }

    const identities = new Map<string, LeadIdentity>();
    for (const c of candidates) identities.set(c.externalId, leadIdentity(c));

    // 1. Duplicate across providers / within this result set.
    const firstSeen = new Map<string, string>();
    for (const c of candidates) {
      const id = identities.get(c.externalId)!;
      const owner = byExternalId[c.externalId];
      for (const key of id.matchKeys) {
        const prior = firstSeen.get(key);
        if (prior && prior !== c.externalId) {
          owner.status = "duplicate_provider";
          owner.reasons.push("Same person already appears in this result set");
          break;
        }
      }
      for (const key of id.matchKeys) {
        if (!firstSeen.has(key)) firstSeen.set(key, c.externalId);
      }
    }

    // 2. Already in Ringee contacts (saved / called).
    await this.matchAgainstContacts(ctx, candidates, identities, byExternalId);

    // 3. Seen in earlier search runs.
    await this.matchAgainstHistory(
      ctx,
      candidates,
      identities,
      byExternalId,
      opts.excludeJobId,
    );

    // 4. On the DNC list.
    await this.matchAgainstDnc(ctx, candidates, identities, byExternalId);

    return { byExternalId, summary: summarize(byExternalId) };
  }

  private async matchAgainstContacts(
    ctx: OwnershipContext,
    candidates: LeadCandidate[],
    identities: Map<string, LeadIdentity>,
    byExternalId: Record<string, LeadDedupInfo>,
  ): Promise<void> {
    const emails = new Set<string>();
    const phones = new Set<string>();
    const linkedinUrls = new Set<string>();
    const externalIds = new Set<string>();
    for (const id of identities.values()) {
      id.emails.forEach((e) => emails.add(e));
      id.phones.forEach((p) => phones.add(p));
      if (id.linkedin) linkedinUrls.add(id.linkedin);
      externalIds.add(id.externalId);
    }
    if (
      emails.size + phones.size + linkedinUrls.size + externalIds.size ===
      0
    ) {
      return;
    }

    let matches: ContactDedupMatch[];
    try {
      matches = await this.contacts.findByDedupKeys(ctx, {
        emails: [...emails],
        phones: [...phones],
        linkedinUrls: [...linkedinUrls],
        externalIds: [...externalIds],
      });
    } catch (err) {
      this.logger.warn(`contact dedup lookup failed: ${asMessage(err)}`);
      return;
    }

    const index = new Map<string, ContactDedupMatch>();
    for (const contact of matches) {
      for (const key of contactKeys(contact)) {
        if (!index.has(key)) index.set(key, contact);
      }
    }

    for (const c of candidates) {
      const id = identities.get(c.externalId)!;
      let match: ContactDedupMatch | undefined;
      for (const key of id.contactProbeKeys) {
        match = index.get(key);
        if (match) break;
      }
      if (!match) continue;

      const info = byExternalId[c.externalId];
      info.matchedContactId = match.id;
      info.ringeeHasEmail =
        Boolean(match.email) || (match.emails?.length ?? 0) > 0;
      info.ringeeHasPhone = contactHasRealPhone(match);

      if (match.lastCallAt) {
        upgrade(info, "already_called", "Already a Ringee contact you've called");
      } else {
        upgrade(info, "already_saved", "Already saved as a Ringee contact");
      }
    }
  }

  private async matchAgainstHistory(
    ctx: OwnershipContext,
    candidates: LeadCandidate[],
    identities: Map<string, LeadIdentity>,
    byExternalId: Record<string, LeadDedupInfo>,
    excludeJobId?: string,
  ): Promise<void> {
    let runs: LeadSearchJob[];
    try {
      runs = await this.leadJobs.listRecentForOwner({
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
        since: new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
        limit: RECENT_RUN_LIMIT,
      });
    } catch (err) {
      this.logger.warn(`history dedup lookup failed: ${asMessage(err)}`);
      return;
    }

    const seenExternalIds = new Set<string>();
    const seenEmails = new Set<string>();
    for (const run of runs) {
      if (excludeJobId && run.id === excludeJobId) continue;
      const snapshot = asResult(run.resultSnapshot);
      for (const lead of snapshot?.results ?? []) {
        seenExternalIds.add(`${lead.provider}:${lead.externalId}`);
        for (const e of lead.person?.emails ?? []) {
          const v = e.value?.trim().toLowerCase();
          if (v) seenEmails.add(v);
        }
      }
    }
    if (seenExternalIds.size + seenEmails.size === 0) return;

    for (const c of candidates) {
      const id = identities.get(c.externalId)!;
      const seenById = seenExternalIds.has(`${c.provider}:${c.externalId}`);
      const seenByEmail = id.emails.some((e) => seenEmails.has(e));
      if (seenById || seenByEmail) {
        upgrade(
          byExternalId[c.externalId],
          "seen_before",
          "Returned by an earlier search",
        );
      }
    }
  }

  private async matchAgainstDnc(
    ctx: OwnershipContext,
    candidates: LeadCandidate[],
    identities: Map<string, LeadIdentity>,
    byExternalId: Record<string, LeadDedupInfo>,
  ): Promise<void> {
    const phones = new Set<string>();
    for (const id of identities.values()) {
      id.rawPhones.forEach((p) => phones.add(p));
    }
    if (phones.size === 0) return;

    const owner = { userId: ctx.userId, organizationId: ctx.organizationId };
    const onDnc = new Set<string>();
    for (const phone of phones) {
      try {
        if (await this.dnc.isOnDNC(owner, phone)) onDnc.add(phone);
      } catch (err) {
        this.logger.warn(`DNC lookup failed for ${phone}: ${asMessage(err)}`);
      }
    }
    if (onDnc.size === 0) return;

    for (const c of candidates) {
      const id = identities.get(c.externalId)!;
      if (id.rawPhones.some((p) => onDnc.has(p))) {
        upgrade(
          byExternalId[c.externalId],
          "on_dnc",
          "On your Do-Not-Contact list",
        );
      }
    }
  }
}

// ── Lead identity ──────────────────────────────────────────────────────────

interface LeadIdentity {
  externalId: string;
  emails: string[];
  /** Digit-normalized phones, used for contact matching. */
  phones: string[];
  /** Original phone strings, used for DNC matching. */
  rawPhones: string[];
  linkedin: string | null;
  /** Keys for within-result-set duplicate detection. */
  matchKeys: string[];
  /** Keys probed against the contact index. */
  contactProbeKeys: string[];
}

function leadIdentity(c: LeadCandidate): LeadIdentity {
  const emails = uniq(
    (c.person?.emails ?? [])
      .map((e) => e.value?.trim().toLowerCase())
      .filter((v): v is string => Boolean(v)),
  );
  const rawPhones = uniq(
    (c.person?.phones ?? [])
      .map((p) => p.value?.trim())
      .filter((v): v is string => Boolean(v)),
  );
  const phones = uniq(rawPhones.map(normalizePhone).filter(Boolean));
  const linkedin = normalizeLinkedin(personLinkedin(c));
  const nameKey = nameCompanyKey(c);

  const contactProbeKeys = [
    ...emails.map((e) => `email:${e}`),
    ...phones.map((p) => `phone:${p}`),
    ...(linkedin ? [`linkedin:${linkedin}`] : []),
    `ext:${c.provider}:${c.externalId}`,
  ];
  const matchKeys = [
    ...emails.map((e) => `email:${e}`),
    ...phones.map((p) => `phone:${p}`),
    ...(linkedin ? [`linkedin:${linkedin}`] : []),
    ...(nameKey ? [`name:${nameKey}`] : []),
  ];

  return {
    externalId: c.externalId,
    emails,
    phones,
    rawPhones,
    linkedin,
    matchKeys,
    contactProbeKeys,
  };
}

/** Identity keys a stored contact can be matched on. */
function contactKeys(contact: ContactDedupMatch): string[] {
  const keys: string[] = [];
  const pushEmail = (v?: string | null) => {
    const e = v?.trim().toLowerCase();
    if (e) keys.push(`email:${e}`);
  };
  const pushPhone = (v?: string | null) => {
    const p = normalizePhone(v ?? "");
    if (p) keys.push(`phone:${p}`);
  };
  pushEmail(contact.email);
  for (const e of contact.emails ?? []) pushEmail(e.email);
  pushPhone(contact.phoneNumber);
  for (const p of contact.phones ?? []) {
    pushPhone(p.phone);
    pushPhone(p.phoneE164);
  }
  const linkedin = normalizeLinkedin(contact.linkedinUrl);
  if (linkedin) keys.push(`linkedin:${linkedin}`);
  const meta = contact.enrichmentMetadata as Record<string, unknown> | null;
  const ext = meta && typeof meta.externalId === "string" ? meta.externalId : null;
  const provider =
    meta && typeof meta.provider === "string" ? meta.provider : null;
  if (ext && provider) keys.push(`ext:${provider}:${ext}`);
  return keys;
}

function contactHasRealPhone(contact: ContactDedupMatch): boolean {
  if (contact.phoneNumber && !PLACEHOLDER_PHONE.test(contact.phoneNumber)) {
    return true;
  }
  return (contact.phones ?? []).some(
    (p) => p.phone && !PLACEHOLDER_PHONE.test(p.phone),
  );
}

// ── Status precedence ──────────────────────────────────────────────────────

const STATUS_RANK: Record<LeadStatus, number> = {
  new: 0,
  seen_before: 1,
  duplicate_provider: 2,
  already_saved: 3,
  already_called: 4,
  on_dnc: 5,
};

/** Raise a lead's status only when the new status outranks the current one. */
function upgrade(info: LeadDedupInfo, status: LeadStatus, reason: string): void {
  if (!info.reasons.includes(reason)) info.reasons.push(reason);
  if (STATUS_RANK[status] > STATUS_RANK[info.status]) info.status = status;
}

function summarize(byExternalId: Record<string, LeadDedupInfo>): LeadDedupSummary {
  const s: LeadDedupSummary = {
    total: 0,
    new: 0,
    seenBefore: 0,
    alreadySaved: 0,
    alreadyCalled: 0,
    onDnc: 0,
    duplicateProvider: 0,
  };
  for (const info of Object.values(byExternalId)) {
    s.total += 1;
    switch (info.status) {
      case "new":
        s.new += 1;
        break;
      case "seen_before":
        s.seenBefore += 1;
        break;
      case "already_saved":
        s.alreadySaved += 1;
        break;
      case "already_called":
        s.alreadyCalled += 1;
        break;
      case "on_dnc":
        s.onDnc += 1;
        break;
      case "duplicate_provider":
        s.duplicateProvider += 1;
        break;
    }
  }
  return s;
}

// ── Normalization helpers ──────────────────────────────────────────────────

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}

/** Digits-only form of a phone number for fuzzy cross-source matching. */
function normalizePhone(value: string): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Canonical LinkedIn URL: lowercased, no protocol/www/query/trailing slash. */
function normalizeLinkedin(url: string | null | undefined): string | null {
  if (!url) return null;
  const cleaned = url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[?#]/)[0]
    .replace(/\/+$/, "");
  return cleaned.includes("linkedin.com/") ? cleaned : null;
}

function personLinkedin(c: LeadCandidate): string | null {
  if (c.person?.linkedinUrl) return c.person.linkedinUrl;
  const social = (c.person?.socialProfiles ?? []).find((s) =>
    /linkedin/i.test(s.platform),
  );
  return social?.url ?? null;
}

/** `name|company` key for within-result-set duplicate detection. */
function nameCompanyKey(c: LeadCandidate): string | null {
  const name = (
    c.person?.fullName ??
    [c.person?.firstName, c.person?.lastName].filter(Boolean).join(" ")
  )
    ?.trim()
    .toLowerCase();
  if (!name) return null;
  const company = (c.company?.domain ?? c.company?.name)
    ?.trim()
    .toLowerCase();
  if (!company) return null;
  const title = c.person?.jobTitle?.trim().toLowerCase() ?? "";
  return `${name}|${company}|${title}`;
}

// ── Filter intent / similarity ─────────────────────────────────────────────

/** Build the normalized-intent token set used for similarity comparison. */
function intentTokens(filters: LeadSearchFilters): Set<string> {
  const tokens = new Set<string>();
  const add = (prefix: string, values?: Array<string | number> | null) => {
    for (const v of values ?? []) {
      const s = String(v).trim().toLowerCase();
      if (s) tokens.add(`${prefix}:${s}`);
    }
  };
  add("title", filters.jobTitles);
  add("sen", filters.seniorities);
  add("dep", filters.departments);
  add("ind", filters.industries);
  add("size", filters.employeeCountRanges);
  add("rev", filters.revenueRanges);
  add("tech", filters.technologies);
  add("fund", filters.fundingStages);
  add("country", [
    ...(filters.personCountries ?? []),
    ...(filters.companyCountries ?? []),
  ]);
  add("loc", [
    ...(filters.personLocations ?? []),
    ...(filters.companyLocations ?? []),
    ...(filters.personCities ?? []),
  ]);
  add("domain", filters.companyDomains);
  add("co", filters.companyNames);
  if (filters.keywords) {
    for (const kw of filters.keywords.toLowerCase().split(/\bor\b|[,\s]+/i)) {
      const s = kw.trim();
      if (s) tokens.add(`kw:${s}`);
    }
  }
  if (filters.hasEmail) tokens.add("req:email");
  if (filters.hasPhone) tokens.add("req:phone");
  if (filters.emailVerified) tokens.add("req:verified");
  return tokens;
}

/** Jaccard overlap of two token sets (1 when both are empty). */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function summarizeFilters(filters: LeadSearchFilters): string {
  const parts: string[] = [];
  if (filters.jobTitles?.length)
    parts.push(`titles: ${filters.jobTitles.slice(0, 4).join(", ")}`);
  if (filters.industries?.length)
    parts.push(`industries: ${filters.industries.slice(0, 3).join(", ")}`);
  const countries = [
    ...(filters.personCountries ?? []),
    ...(filters.companyCountries ?? []),
  ];
  if (countries.length) parts.push(`countries: ${countries.slice(0, 4).join(", ")}`);
  if (filters.employeeCountRanges?.length)
    parts.push(`size: ${filters.employeeCountRanges.join(", ")}`);
  if (filters.keywords) parts.push(`keywords: ${filters.keywords}`);
  return parts.length ? parts.join(" · ") : "no specific filters";
}

// ── Stable hashing (kept byte-compatible with LeadSearchService) ───────────

/**
 * Deterministic JSON serializer: recursively sorts object keys so equal
 * filter objects hash identically regardless of key order. Must stay
 * byte-compatible with `LeadSearchService` so `LeadSearchJob.filtersHash`
 * comparisons hold.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

function hashFilters(filters: unknown): string {
  return createHash("sha256").update(stableStringify(filters)).digest("hex");
}

// ── Misc helpers ───────────────────────────────────────────────────────────

function asFilters(value: unknown): LeadSearchFilters {
  return (value ?? {}) as LeadSearchFilters;
}

function asResult(value: unknown): LeadSearchResult | null {
  if (!value || typeof value !== "object") return null;
  return value as LeadSearchResult;
}

function asMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function humanizeHours(hours: number): string {
  if (hours < 1) {
    const mins = Math.max(1, Math.round(hours * 60));
    return `${mins} minute${mins === 1 ? "" : "s"}`;
  }
  if (hours < 48) {
    const h = Math.round(hours);
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}
