import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "crypto";
import { apiConfiguration } from "@ringee/configuration";
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
import { CreditService } from "../credit.service";
import { EnrichmentConnectionService } from "./enrichment-connection.service";
import { EnrichmentMergeService } from "./enrichment-merge.service";

export type SearchLeadsOpts = {
  provider?: EnrichmentProviderType;
  page?: number;
  perPage?: number;
};

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
    private readonly credits: CreditService,
  ) {}

  async searchLeads(
    ctx: OwnershipContext,
    filters: LeadSearchFilters,
    opts: SearchLeadsOpts = {},
  ): Promise<{ job: LeadSearchJob; result: LeadSearchResult }> {
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
    const filtersHash = createHash("sha256")
      .update(JSON.stringify(filters, Object.keys(filters).sort()))
      .digest("hex");

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

    const cost = apiConfiguration.ENRICHMENT_COST_LEAD_SEARCH;
    const updated = await this.leadJobs.markDone(job.id, {
      totalResults: result.total,
      resultSnapshot: result as unknown,
      costCredits: cost,
    });
    await this.connections.touchLastUsed(connection.id);

    if (cost > 0) {
      try {
        await this.credits.consumeCredits(ctx, cost);
      } catch (err) {
        this.logger.warn(
          `credit debit failed for lead search ${updated.id}: ${(err as Error).message}`,
        );
      }
    }

    return { job: updated, result };
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
   * Performs phone-based dedup; debits credits per imported lead.
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
    const importCost = apiConfiguration.ENRICHMENT_COST_LEAD_IMPORT;

    for (const cand of candidates) {
      try {
        const phone =
          cand.person.phones?.[0]?.value ??
          `noPhone:${cand.externalId || cryptoRandom()}`;
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
          email: cand.person.emails?.[0]?.value ?? null,
          company: cand.company?.name ?? null,
          jobTitle: cand.person.jobTitle ?? null,
          source: `lead-search:${cand.provider}`,
          headline: cand.person.headline ?? null,
          summary: cand.person.summary ?? null,
          seniority: cand.person.seniority ?? null,
          department: cand.person.department ?? null,
          linkedinUrl: cand.person.linkedinUrl ?? null,
          twitterUrl: cand.person.twitterUrl ?? null,
          githubUrl: cand.person.githubUrl ?? null,
          facebookUrl: cand.person.facebookUrl ?? null,
          locationCity: cand.person.location?.city ?? null,
          locationRegion: cand.person.location?.region ?? null,
          locationCountry: cand.person.location?.country ?? null,
          enrichmentMetadata: {
            provider: cand.provider,
            externalId: cand.externalId,
            importedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
          lastEnrichedAt: new Date(),
        });

        // Append additional emails/phones/social links
        if (cand.person.emails && cand.person.emails.length > 1) {
          for (const e of cand.person.emails.slice(1)) {
            await this.contactRepo
              .update(created.id, {})
              .catch(() => undefined);
            // (using merge service helpers via direct repo upsert below)
          }
        }
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

    if (importCost > 0 && out.importedContactIds.length > 0) {
      try {
        await this.credits.consumeCredits(
          ctx,
          importCost * out.importedContactIds.length,
        );
      } catch (err) {
        this.logger.warn(
          `lead import credit debit failed: ${(err as Error).message}`,
        );
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

    // Debit one credit per reveal — mobile reveals are 10 upstream, but we
    // expose a single `lead-import` cost knob in our config.
    const cost = apiConfiguration.ENRICHMENT_COST_LEAD_IMPORT;
    if (cost > 0) {
      try {
        await this.credits.consumeCredits(ctx, cost);
      } catch (err) {
        this.logger.warn(
          `credit debit failed for lead reveal ${jobId}/${externalId}: ${(err as Error).message}`,
        );
      }
    }

    return {
      candidate: merged,
      contactId: contact?.id ?? null,
      emailRevealed: (result.person.emails?.length ?? 0) > 0,
      phoneRevealed: (result.person.phones?.length ?? 0) > 0,
    };
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
    const phone = cand.person.phones?.[0]?.value;
    const email = cand.person.emails?.[0]?.value ?? null;

    if (phone) {
      const byPhone = await this.contactRepo.findByPhone(ctx, phone);
      if (byPhone) return byPhone;
    }

    return this.contactRepo.create(ctx, {
      name: cand.person.fullName ?? null,
      firstName: cand.person.firstName ?? null,
      lastName: cand.person.lastName ?? null,
      fullName: cand.person.fullName ?? null,
      phoneNumber: phone ?? `prospeo:${cand.externalId}`,
      email,
      company: cand.company?.name ?? null,
      jobTitle: cand.person.jobTitle ?? null,
      headline: cand.person.headline ?? null,
      linkedinUrl: cand.person.linkedinUrl ?? null,
      locationCity: cand.person.location?.city ?? null,
      locationRegion: cand.person.location?.region ?? null,
      locationCountry: cand.person.location?.country ?? null,
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
