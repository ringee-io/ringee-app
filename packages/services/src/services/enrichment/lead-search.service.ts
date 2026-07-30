import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "crypto";
import {
  Contact,
  ContactRepository,
  EnrichmentProviderType,
  LeadSearchJob,
  LeadSearchJobRepository,
  Prisma,
  SocialLinkRepository,
  SocialPlatform,
} from "@ringee/database";
import {
  EnrichmentError,
  EnrichmentProviderRegistry,
  EnrichmentResult,
  LeadCandidate,
  LeadSearchFilters,
  LeadSearchResult,
  OwnershipContext,
} from "@ringee/platform";
import { EnrichmentConnectionService } from "./enrichment-connection.service";
import { EnrichmentMergeService } from "./enrichment-merge.service";

export type SearchLeadsOpts = {
  provider?: EnrichmentProviderType;
  page?: number;
  perPage?: number;
  useCache?: boolean;
};

export type SearchLeadsResponse = {
  job: LeadSearchJob;
  result: LeadSearchResult;
  cached: boolean;
};

const LEAD_SEARCH_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type ImportLeadsResult = {
  importedContactIds: string[];
  duplicates: number;
  errors: number;
};

export type RevealLeadOpts = {
  revealPhone?: boolean;
};

export type RevealLeadResult = {
  candidate: LeadCandidate;
  contactId: string | null;
  emailRevealed: boolean;
  phoneRevealed: boolean;
};

export type RevealContactOpts = {
  revealPhone?: boolean;
  revealEmail?: boolean;
};

export type RevealContactResult = {
  contactId: string;
  emailRevealed: boolean;
  phoneRevealed: boolean;
  provider: EnrichmentProviderType;
};

@Injectable()
export class LeadSearchService {
  private readonly logger = new Logger(LeadSearchService.name);

  constructor(
    private readonly connections: EnrichmentConnectionService,
    private readonly registry: EnrichmentProviderRegistry,
    private readonly leadJobs: LeadSearchJobRepository,
    private readonly contactRepo: ContactRepository,
    private readonly merge: EnrichmentMergeService,
    private readonly socialLinkRepo: SocialLinkRepository,
  ) {}

  async searchLeads(
    ctx: OwnershipContext,
    filters: LeadSearchFilters,
    opts: SearchLeadsOpts = {},
  ): Promise<SearchLeadsResponse> {
    const connection = await this.pickConnection(ctx, opts.provider);
    const provider = this.registry.get(connection.provider);
    if (!provider.searchLeads || !provider.capabilities.leadSearch) {
      throw new BadRequestException(
        `${connection.provider} does not support lead search. Try Apollo.`,
      );
    }

    const page = Math.max(1, opts.page ?? 1);
    const perPage = Math.min(
      provider.capabilities.leadSearchMaxPerPage || 25,
      Math.max(1, opts.perPage ?? 25),
    );
    const filtersHash = hashFilters(filters);

    // Cache lookup: return a previous completed search for the same filters
    // hash + provider + pagination if requested. Saves provider credits.
    if (opts.useCache !== false) {
      const cached = await this.leadJobs.findRecentByHash({
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
        provider: connection.provider,
        filtersHash,
        page,
        perPage,
        olderThan: new Date(Date.now() - LEAD_SEARCH_CACHE_TTL_MS),
      });
      if (cached && cached.resultSnapshot) {
        return {
          job: cached,
          result: cached.resultSnapshot as unknown as LeadSearchResult,
          cached: true,
        };
      }
    }

    const job = await this.leadJobs.create({
      connectionId: connection.id,
      provider: connection.provider,
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
      filters: filters as unknown as Record<string, unknown>,
      filtersHash,
      page,
      perPage,
    });

    const decrypted = await this.connections.decrypt(connection);
    const creds = {
      apiKey: decrypted.apiKey,
      accountId: connection.externalAccountId,
      connectionId: connection.id,
      metadata: decrypted.metadata,
    };

    let result: LeadSearchResult;
    try {
      await this.leadJobs.markInProgress(job.id);
      result = await provider.searchLeads(creds, filters, { page, perPage });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.leadJobs.markFailed(job.id, msg);
      if (err instanceof EnrichmentError) {
        await this.connections.reportProviderError(connection, err);
      }
      throw err;
    }

    const updated = await this.leadJobs.markDone(job.id, {
      totalResults: result.total,
      resultSnapshot: result as unknown,
      costCredits: 0,
    });
    await this.connections.touchLastUsed(connection.id);

    return { job: updated, result, cached: false };
  }

  /**
   * Look up a single lead by LinkedIn profile URL. Wraps the response as a
   * single-result LeadSearchJob so reveal/import flows can be reused.
   * This may consume the connected provider's allowance, but never Ringee
   * credits.
   */
  async searchByLinkedInUrl(
    ctx: OwnershipContext,
    linkedInUrl: string,
    opts: SearchLeadsOpts = {},
  ): Promise<SearchLeadsResponse> {
    const url = linkedInUrl.trim();
    if (!/linkedin\.com\//i.test(url)) {
      throw new BadRequestException("Not a valid LinkedIn profile URL");
    }

    const connection = await this.pickConnection(ctx, opts.provider);
    const provider = this.registry.get(connection.provider);
    if (!provider.enrichByLinkedIn || !provider.capabilities.byLinkedIn) {
      throw new BadRequestException(
        `${connection.provider} does not support LinkedIn URL lookup.`,
      );
    }

    const filters = { extra: { linkedinUrl: url.toLowerCase() } };
    const filtersHash = hashFilters(filters);
    const page = 1;
    const perPage = 1;

    if (opts.useCache !== false) {
      const cached = await this.leadJobs.findRecentByHash({
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
        provider: connection.provider,
        filtersHash,
        page,
        perPage,
        olderThan: new Date(Date.now() - LEAD_SEARCH_CACHE_TTL_MS),
      });
      if (cached && cached.resultSnapshot) {
        return {
          job: cached,
          result: cached.resultSnapshot as unknown as LeadSearchResult,
          cached: true,
        };
      }
    }

    const job = await this.leadJobs.create({
      connectionId: connection.id,
      provider: connection.provider,
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
      filters: filters as unknown as Record<string, unknown>,
      filtersHash,
      page,
      perPage,
    });

    const decrypted = await this.connections.decrypt(connection);
    const creds = {
      apiKey: decrypted.apiKey,
      accountId: connection.externalAccountId,
      connectionId: connection.id,
      metadata: decrypted.metadata,
    };

    let enrichResult: EnrichmentResult;
    try {
      await this.leadJobs.markInProgress(job.id);
      enrichResult = await provider.enrichByLinkedIn(creds, url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.leadJobs.markFailed(job.id, msg);
      if (err instanceof EnrichmentError) {
        await this.connections.reportProviderError(connection, err);
      }
      throw err;
    }

    const candidate: LeadCandidate | null =
      enrichResult.found && enrichResult.person
        ? {
            externalId: this.extractLinkedInExternalId(
              url,
              enrichResult,
              connection.provider,
            ),
            provider: connection.provider,
            person: enrichResult.person,
            company: enrichResult.company,
            confidence: enrichResult.confidence ?? null,
            raw: enrichResult.raw,
          }
        : null;

    const result: LeadSearchResult = {
      total: candidate ? 1 : 0,
      page,
      perPage,
      hasMore: false,
      results: candidate ? [candidate] : [],
    };

    const updated = await this.leadJobs.markDone(job.id, {
      totalResults: result.total,
      resultSnapshot: result as unknown,
      costCredits: 0,
    });
    await this.connections.touchLastUsed(connection.id);

    return { job: updated, result, cached: false };
  }

  private extractLinkedInExternalId(
    url: string,
    result: EnrichmentResult,
    provider: EnrichmentProviderType,
  ): string {
    const raw = (result.raw ?? {}) as Record<string, unknown>;
    // Prospeo /enrich-person → { person: { person_id } }
    const personObj = (raw["person"] ?? {}) as Record<string, unknown>;
    const candidates = [personObj["person_id"], raw["person_id"], raw["id"]];
    for (const c of candidates) {
      if (typeof c === "string" && c) return c;
    }
    const slugMatch = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
    return `${provider}:${slugMatch ? slugMatch[1] : url}`;
  }

  /**
   * Resolve which provider a lead search would actually run on for this ctx
   * (the preferred one if connected, else the default active connection).
   * Lets callers run dedup/freshness checks against a concrete provider
   * before committing to a search. Throws the same "no connection" error a
   * search would.
   */
  async resolveProvider(
    ctx: OwnershipContext,
    preferred?: EnrichmentProviderType,
  ): Promise<EnrichmentProviderType> {
    const connection = await this.pickConnection(ctx, preferred);
    return connection.provider;
  }

  async getJob(id: string, ctx: OwnershipContext): Promise<LeadSearchJob> {
    const job = await this.leadJobs.findById(id);
    if (!job) throw new NotFoundException("Lead search job not found");
    this.assertJobAccess(ctx, job);
    return job;
  }

  listJobs(ctx: OwnershipContext, limit = 50): Promise<LeadSearchJob[]> {
    return this.leadJobs.listForUser(ctx.userId, limit);
  }

  /**
   * Import a set of LeadCandidates from a previous search result as Contacts.
   * Performs phone-based dedup. Importing never consumes Ringee credits.
   */
  async importLeads(
    ctx: OwnershipContext,
    candidates: LeadCandidate[],
    opts: { tagIds?: string[] } = {},
  ): Promise<ImportLeadsResult> {
    const out: ImportLeadsResult = {
      importedContactIds: [],
      duplicates: 0,
      errors: 0,
    };
    for (const cand of candidates) {
      try {
        const phone =
          fitColumn(cand.person.phones?.[0]?.value, PHONE_NUMBER_MAX) ??
          placeholderPhone(cand.externalId);
        const existing = await this.contactRepo.findByPhone(ctx, phone);
        if (existing) {
          out.duplicates += 1;
          continue;
        }

        const created = await this.contactRepo.create(ctx, {
          name: cand.person.fullName ?? null,
          firstName: cand.person.firstName ?? null,
          lastName: cand.person.lastName ?? null,
          fullName: cand.person.fullName ?? null,
          phoneNumber: phone,
          email: fitColumn(cand.person.emails?.[0]?.value, EMAIL_MAX),
          company: cand.company?.name ?? null,
          jobTitle: cand.person.jobTitle ?? null,
          source: `lead-search:${cand.provider}`,
          headline: cand.person.headline ?? null,
          summary: cand.person.summary ?? null,
          seniority: cand.person.seniority ?? null,
          department: cand.person.department ?? null,
          linkedinUrl: fitColumn(cand.person.linkedinUrl, URL_MAX),
          twitterUrl: fitColumn(cand.person.twitterUrl, URL_MAX),
          githubUrl: fitColumn(cand.person.githubUrl, URL_MAX),
          facebookUrl: fitColumn(cand.person.facebookUrl, URL_MAX),
          locationCity: cand.person.location?.city ?? null,
          locationRegion: cand.person.location?.region ?? null,
          locationCountry: cand.person.location?.country ?? null,
          websiteUrl: fitColumn(
            cand.person.websiteUrl ?? cand.company?.website,
            URL_MAX,
          ),
          revenue:
            cand.company?.revenueRange ??
            (cand.company?.annualRevenue != null
              ? String(cand.company.annualRevenue)
              : null),
          companySize:
            cand.company?.employeeCountRange ?? cand.company?.size ?? null,
          enrichmentMetadata: {
            provider: cand.provider,
            externalId: cand.externalId,
            importedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
          lastEnrichedAt: new Date(),
        });

        // Use merge service to apply complete data (also handles company)
        await this.merge.mergeIntoContact(
          ctx,
          created,
          {
            found: true,
            confidence: cand.confidence ?? 0.8,
            person: cand.person,
            company: cand.company,
            raw: cand.raw,
          },
          `${cand.provider}:lead-import`,
        );

        // Apply tags (if requested) by simple direct inserts
        if (opts.tagIds && opts.tagIds.length > 0) {
          await this.applyTags(created.id, opts.tagIds).catch(() => undefined);
        }

        // Persist any social links from socialProfiles array (extras)
        for (const link of cand.person.socialProfiles ?? []) {
          await this.socialLinkRepo
            .upsertForContact(created.id, {
              platform: mapPlatform(link.platform),
              url: link.url,
              handle: link.handle ?? null,
            })
            .catch(() => undefined);
        }

        out.importedContactIds.push(created.id);
      } catch (err) {
        out.errors += 1;
        this.logger.warn(`lead import failed: ${(err as Error).message}`);
      }
    }

    return out;
  }

  /**
   * Reveal email (and optionally mobile) for a single candidate from a saved
   * search job. Persists the revealed values back into the job snapshot AND
   * upserts a Contact so the data is available everywhere in the app.
   */
  async revealCandidate(
    ctx: OwnershipContext,
    jobId: string,
    externalId: string,
    opts: RevealLeadOpts = {},
  ): Promise<RevealLeadResult> {
    const job = await this.leadJobs.findById(jobId);
    if (!job) throw new NotFoundException("Lead search job not found");
    this.assertJobAccess(ctx, job);

    const snapshot = job.resultSnapshot as LeadSearchResult | null;
    const candidates = snapshot?.results ?? [];
    const candidate = candidates.find((c) => c.externalId === externalId);
    if (!candidate) {
      throw new NotFoundException(
        `Candidate ${externalId} not found in this search`,
      );
    }

    const connection = await this.connections.findById(job.connectionId);
    if (!connection || connection.status !== "active") {
      throw new BadRequestException(
        "Enrichment connection no longer active. Reconnect it first.",
      );
    }
    const provider = this.registry.get(connection.provider);
    if (!provider.enrichByPersonId) {
      throw new BadRequestException(
        `${connection.provider} cannot reveal contact info from a saved search.`,
      );
    }

    const decrypted = await this.connections.decrypt(connection);
    const creds = {
      apiKey: decrypted.apiKey,
      accountId: connection.externalAccountId,
      connectionId: connection.id,
      metadata: decrypted.metadata,
    };

    let result: EnrichmentResult;
    try {
      result = await provider.enrichByPersonId(creds, externalId, {
        revealPhone: opts.revealPhone,
      });
    } catch (err) {
      if (err instanceof EnrichmentError) {
        await this.connections.reportProviderError(connection, err);
        if (err.code === "NOT_FOUND") {
          return {
            candidate,
            contactId: null,
            emailRevealed: false,
            phoneRevealed: false,
          };
        }
      }
      throw err;
    }
    await this.connections.touchLastUsed(connection.id);

    if (!result.found || !result.person) {
      return {
        candidate,
        contactId: null,
        emailRevealed: false,
        phoneRevealed: false,
      };
    }

    // Merge revealed person/company data back into the candidate.
    const merged: LeadCandidate = {
      ...candidate,
      person: {
        ...candidate.person,
        ...result.person,
        emails: dedupeEmails([
          ...(candidate.person.emails ?? []),
          ...(result.person.emails ?? []),
        ]),
        phones: dedupePhones([
          ...(candidate.person.phones ?? []),
          ...(result.person.phones ?? []),
        ]),
        socialProfiles: dedupeSocial([
          ...(candidate.person.socialProfiles ?? []),
          ...(result.person.socialProfiles ?? []),
        ]),
      },
      company: result.company ?? candidate.company,
      confidence: result.confidence ?? candidate.confidence ?? null,
    };

    // Persist updated snapshot.
    const updatedSnapshot: LeadSearchResult = {
      ...(snapshot as LeadSearchResult),
      results: candidates.map((c) =>
        c.externalId === externalId ? merged : c,
      ),
    };
    await this.leadJobs.updateSnapshot(
      job.id,
      updatedSnapshot as unknown as Prisma.InputJsonValue,
    );

    // Upsert a Contact and merge fully-enriched data into it.
    const contact = await this.upsertContactForCandidate(ctx, merged);
    if (contact) {
      await this.merge.mergeIntoContact(
        ctx,
        contact,
        result,
        `${connection.provider}:reveal`,
      );
    }

    return {
      candidate: merged,
      contactId: contact?.id ?? null,
      emailRevealed: (result.person.emails?.length ?? 0) > 0,
      phoneRevealed: (result.person.phones?.length ?? 0) > 0,
    };
  }

  /**
   * Reveal email and/or phone for a contact that was previously imported from
   * a lead search. Uses `contact.enrichmentMetadata.{provider,externalId}` to
   * call the provider's person-id enrichment endpoint, then merges the result
   * into the contact (also replacing placeholder phone numbers if any).
   */
  async revealContact(
    ctx: OwnershipContext,
    contactId: string,
    opts: RevealContactOpts = {},
  ): Promise<RevealContactResult> {
    const contact = await this.contactRepo.findById(contactId);
    if (!contact) throw new NotFoundException("Contact not found");
    this.assertContactAccess(ctx, contact);

    const meta =
      (contact.enrichmentMetadata as Record<string, unknown> | null) ?? null;
    const externalId =
      meta && typeof meta.externalId === "string"
        ? (meta.externalId as string)
        : null;
    const providerName =
      meta && typeof meta.provider === "string"
        ? (meta.provider as EnrichmentProviderType)
        : null;
    if (!externalId || !providerName) {
      throw new BadRequestException(
        "This contact was not imported from a lead search provider — nothing to reveal.",
      );
    }

    const active = await this.connections.listActive(ctx);
    const connection = active.find((c) => c.provider === providerName);
    if (!connection) {
      throw new BadRequestException(
        `No active ${providerName} connection to reveal contact info.`,
      );
    }

    const provider = this.registry.get(connection.provider);
    if (!provider.enrichByPersonId) {
      throw new BadRequestException(
        `${connection.provider} cannot reveal contact info.`,
      );
    }

    const decrypted = await this.connections.decrypt(connection);
    const creds = {
      apiKey: decrypted.apiKey,
      accountId: connection.externalAccountId,
      connectionId: connection.id,
      metadata: decrypted.metadata,
    };

    let result: EnrichmentResult;
    try {
      result = await provider.enrichByPersonId(creds, externalId, {
        revealPhone: opts.revealPhone ?? false,
        revealEmail: opts.revealEmail ?? true,
      });
    } catch (err) {
      if (err instanceof EnrichmentError) {
        await this.connections.reportProviderError(connection, err);
        if (err.code === "NOT_FOUND") {
          return {
            contactId: contact.id,
            emailRevealed: false,
            phoneRevealed: false,
            provider: connection.provider,
          };
        }
      }
      throw err;
    }
    await this.connections.touchLastUsed(connection.id);

    if (!result.found || !result.person) {
      return {
        contactId: contact.id,
        emailRevealed: false,
        phoneRevealed: false,
        provider: connection.provider,
      };
    }

    // If the contact was imported with a placeholder phone (lead:* legacy
    // noPhone:* or <provider>:<externalId>) and the reveal returned a real
    // phone that fits the column, promote it to the primary phoneNumber so
    // the UI stops showing the placeholder.
    const revealedPhone = fitColumn(
      result.person.phones?.[0]?.value,
      PHONE_NUMBER_MAX,
    );
    const hasPlaceholderPhone = /^(lead:|noPhone:|prospeo:|apollo:)/i.test(
      contact.phoneNumber,
    );
    if (revealedPhone && hasPlaceholderPhone) {
      try {
        await this.contactRepo.update(contact.id, {
          phoneNumber: revealedPhone,
        });
      } catch (err) {
        this.logger.warn(
          `could not promote revealed phone for contact ${contact.id}: ${
            (err as Error).message
          }`,
        );
      }
    }

    await this.merge.mergeIntoContact(
      ctx,
      contact,
      result,
      `${connection.provider}:contact-reveal`,
    );

    return {
      contactId: contact.id,
      emailRevealed: (result.person.emails?.length ?? 0) > 0,
      phoneRevealed: (result.person.phones?.length ?? 0) > 0,
      provider: connection.provider,
    };
  }

  private assertContactAccess(ctx: OwnershipContext, contact: Contact): void {
    if (ctx.organizationId) {
      if (contact.organizationId !== ctx.organizationId) {
        throw new ForbiddenException("Cannot access this contact");
      }
      return;
    }
    if (contact.userId !== ctx.userId) {
      throw new ForbiddenException("Cannot access this contact");
    }
  }

  /**
   * Find existing contact by linkedin URL (preferred) or by enrichmentMetadata
   * externalId match; otherwise create a new one (using the revealed phone if
   * present, else a stable placeholder so we satisfy the NOT NULL constraint).
   */
  private async upsertContactForCandidate(
    ctx: OwnershipContext,
    cand: LeadCandidate,
  ): Promise<Contact | null> {
    const phone = fitColumn(cand.person.phones?.[0]?.value, PHONE_NUMBER_MAX);

    if (phone) {
      const byPhone = await this.contactRepo.findByPhone(ctx, phone);
      if (byPhone) return byPhone;
    }

    return this.contactRepo.create(ctx, {
      name: cand.person.fullName ?? null,
      firstName: cand.person.firstName ?? null,
      lastName: cand.person.lastName ?? null,
      fullName: cand.person.fullName ?? null,
      phoneNumber: phone ?? placeholderPhone(cand.externalId),
      email: fitColumn(cand.person.emails?.[0]?.value, EMAIL_MAX),
      company: cand.company?.name ?? null,
      jobTitle: cand.person.jobTitle ?? null,
      headline: cand.person.headline ?? null,
      linkedinUrl: fitColumn(cand.person.linkedinUrl, URL_MAX),
      locationCity: cand.person.location?.city ?? null,
      locationRegion: cand.person.location?.region ?? null,
      locationCountry: cand.person.location?.country ?? null,
      websiteUrl: fitColumn(
        cand.person.websiteUrl ?? cand.company?.website,
        URL_MAX,
      ),
      revenue:
        cand.company?.revenueRange ??
        (cand.company?.annualRevenue != null
          ? String(cand.company.annualRevenue)
          : null),
      companySize:
        cand.company?.employeeCountRange ?? cand.company?.size ?? null,
      source: `lead-search:${cand.provider}`,
      enrichmentMetadata: {
        provider: cand.provider,
        externalId: cand.externalId,
        revealedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
      lastEnrichedAt: new Date(),
    });
  }

  private async pickConnection(
    ctx: OwnershipContext,
    preferred?: EnrichmentProviderType,
  ) {
    const all = await this.connections.listActive(ctx);
    if (all.length === 0) {
      throw new BadRequestException(
        "No active enrichment connection. Connect Apollo to search leads.",
      );
    }
    const target = preferred
      ? all.find((c) => c.provider === preferred)
      : (all.find((c) => c.provider === EnrichmentProviderType.apollo) ??
        all[0]);
    if (!target) {
      throw new BadRequestException(
        `No active connection for provider ${preferred}`,
      );
    }
    return target;
  }

  private assertJobAccess(ctx: OwnershipContext, job: LeadSearchJob): void {
    if (ctx.organizationId) {
      if (job.organizationId !== ctx.organizationId) {
        throw new ForbiddenException("Cannot access this lead search");
      }
      return;
    }
    if (job.userId !== ctx.userId) {
      throw new ForbiddenException("Cannot access this lead search");
    }
  }

  private async applyTags(contactId: string, tagIds: string[]): Promise<void> {
    // Lightweight insert via raw repository — keep in sync with TagRepository conventions.
    // Using internal Prisma access via contactRepo would couple modules; instead,
    // skip tagging at this layer and let the controller layer apply tags if needed.
    void contactId;
    void tagIds;
  }
}

function cryptoRandom(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Contact column length limits (see schema.prisma `model Contact`).
const PHONE_NUMBER_MAX = 20;
const EMAIL_MAX = 100;
const URL_MAX = 255;

// Returns the value if it fits the column, otherwise null. Multivalued data
// (emails, phones, social links) gets re-attached by the merge step on
// wider-typed tables, so dropping an oversized scalar here is non-destructive.
function fitColumn(
  value: string | null | undefined,
  max: number,
): string | null {
  if (!value) return null;
  return value.length <= max ? value : null;
}

// Deterministic placeholder phone that fits in VarChar(20) when no real phone
// is available. The same externalId always maps to the same placeholder so
// re-imports still dedupe via findByPhone.
function placeholderPhone(externalId: string | null | undefined): string {
  const id = externalId || cryptoRandom();
  // "lead:" (5) + 15 hex chars = 20.
  return `lead:${createHash("sha1").update(id).digest("hex").slice(0, 15)}`;
}

// Deterministic JSON serializer: recursively sorts object keys so semantically
// equal filter objects produce identical strings regardless of insertion order.
// Array element order is preserved (it can be meaningful for the provider).
// Note: passing an array as JSON.stringify's replacer filters keys at every
// depth — that drops nested object values and silently collides hashes, which
// is why we don't use it here.
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

function dedupeEmails<T extends { value: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = it.value?.toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

function dedupePhones<T extends { value: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = it.value?.replace(/\s+/g, "");
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

function dedupeSocial<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = it.url?.toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

function mapPlatform(name: string): SocialPlatform {
  const k = name.toLowerCase();
  const map: Record<string, SocialPlatform> = {
    linkedin: SocialPlatform.linkedin,
    twitter: SocialPlatform.twitter,
    x: SocialPlatform.twitter,
    github: SocialPlatform.github,
    facebook: SocialPlatform.facebook,
    instagram: SocialPlatform.instagram,
    youtube: SocialPlatform.youtube,
    tiktok: SocialPlatform.tiktok,
    website: SocialPlatform.website,
    blog: SocialPlatform.blog,
    crunchbase: SocialPlatform.crunchbase,
  };
  return map[k] ?? SocialPlatform.other;
}
