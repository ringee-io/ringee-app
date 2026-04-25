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
  EnrichmentConnection,
  EnrichmentJob,
  EnrichmentJobRepository,
  EnrichmentProviderType,
  EnrichmentQueryKind,
} from "@ringee/database";
import {
  EnrichmentError,
  EnrichmentProviderRegistry,
  EnrichmentResult,
  OwnershipContext,
} from "@ringee/platform";
import { CreditService } from "../credit.service";
import { EnrichmentConnectionService } from "./enrichment-connection.service";
import { EnrichmentMergeService } from "./enrichment-merge.service";

const PROVIDER_PRIORITY: EnrichmentProviderType[] = [
  EnrichmentProviderType.apollo,
  EnrichmentProviderType.prospeo,
];

const PROVIDER_COST: Record<EnrichmentProviderType, number> = {
  prospeo: apiConfiguration.ENRICHMENT_COST_PROSPEO,
  apollo: apiConfiguration.ENRICHMENT_COST_APOLLO,
};

export type EnrichContactOpts = {
  providerPreference?: EnrichmentProviderType;
  waterfall?: boolean;
  idempotencyKey?: string | null;
  triggeredBy?: string | null;
  revealPhone?: boolean;
  revealEmail?: boolean;
};

export type EnrichResolvedQuery = {
  kind: EnrichmentQueryKind;
  hash: string;
  payload: Record<string, unknown>;
};

@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);
  private readonly dedupTtlMs =
    apiConfiguration.ENRICHMENT_DEDUP_TTL_DAYS * 24 * 60 * 60 * 1000;

  constructor(
    private readonly connections: EnrichmentConnectionService,
    private readonly jobs: EnrichmentJobRepository,
    private readonly registry: EnrichmentProviderRegistry,
    private readonly contactRepo: ContactRepository,
    private readonly merge: EnrichmentMergeService,
    private readonly credits: CreditService,
  ) {}

  async getJob(id: string): Promise<EnrichmentJob | null> {
    return this.jobs.findById(id);
  }

  listJobsForContact(contactId: string, limit = 25): Promise<EnrichmentJob[]> {
    return this.jobs.listByContact(contactId, limit);
  }

  /**
   * Enrich a single contact synchronously. Returns the persisted job.
   * Used by the "Enrich" button on the contact detail UI.
   */
  async enrichContact(
    ctx: OwnershipContext,
    contactId: string,
    opts: EnrichContactOpts = {},
  ): Promise<EnrichmentJob> {
    const contact = await this.contactRepo.findById(contactId);
    if (!contact) throw new NotFoundException("Contact not found");
    this.assertContactAccess(ctx, contact);

    const triedProviders = new Set<EnrichmentProviderType>();
    const candidates = await this.candidateConnections(
      ctx,
      opts.providerPreference,
    );
    if (candidates.length === 0) {
      throw new BadRequestException(
        "No active enrichment connection. Connect Prospeo or Apollo first.",
      );
    }

    let lastJob: EnrichmentJob | null = null;
    for (const connection of candidates) {
      if (triedProviders.has(connection.provider)) continue;
      triedProviders.add(connection.provider);

      const query = this.resolveQuery(contact, connection.provider);
      if (!query) {
        this.logger.debug(
          `skip ${connection.provider}: insufficient input on contact ${contact.id}`,
        );
        continue;
      }

      const dedupeKey = this.buildDedupeKey(connection.id, query.hash);
      const cached = await this.jobs.findRecentByQueryHash(
        connection.id,
        query.hash,
        this.dedupTtlMs,
      );
      if (
        cached &&
        (cached.status === "done" || cached.status === "not_found")
      ) {
        lastJob = await this.jobs.createSkipped({
          connectionId: connection.id,
          provider: connection.provider,
          contactId: contact.id,
          userId: ctx.userId,
          organizationId: ctx.organizationId ?? null,
          queryKind: query.kind,
          queryHash: query.hash,
          dedupeKey: `${dedupeKey}:skip:${Date.now()}`,
          triggeredBy: opts.triggeredBy ?? "user",
          resultSnapshot: cached.resultSnapshot ?? null,
        });
        if (cached.status === "done") return lastJob;
        // not_found in cache → if waterfall, continue
        if (!opts.waterfall) return lastJob;
        continue;
      }

      const job = await this.jobs.enqueue({
        connectionId: connection.id,
        provider: connection.provider,
        contactId: contact.id,
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
        queryKind: query.kind,
        queryHash: query.hash,
        dedupeKey,
        idempotencyKey: opts.idempotencyKey ?? null,
        triggeredBy: opts.triggeredBy ?? "user",
      });

      const processed = await this.processOne(
        connection,
        job,
        contact,
        query,
        opts,
      );
      lastJob = processed;
      if (processed.status === "done") return processed;
      if (!opts.waterfall) return processed;
    }

    if (lastJob) return lastJob;
    throw new BadRequestException(
      "No enrichment provider had enough information to look up this contact.",
    );
  }

  /**
   * Enqueue many enrichment jobs for asynchronous processing by the worker.
   * Returns the created job ids in the same order as input.
   */
  async enrichContactsBulk(
    ctx: OwnershipContext,
    contactIds: string[],
    opts: EnrichContactOpts = {},
  ): Promise<{ jobIds: string[] }> {
    if (contactIds.length === 0) return { jobIds: [] };
    const candidates = await this.candidateConnections(
      ctx,
      opts.providerPreference,
    );
    if (candidates.length === 0) {
      throw new BadRequestException(
        "No active enrichment connection. Connect Prospeo or Apollo first.",
      );
    }

    const jobIds: string[] = [];
    for (const contactId of contactIds) {
      const contact = await this.contactRepo.findById(contactId);
      if (!contact) continue;
      try {
        this.assertContactAccess(ctx, contact);
      } catch {
        continue;
      }

      // Always pick the first candidate; the worker drain handles waterfall later
      // by running the contact through processOne and seeing whether it fails.
      const connection = candidates[0];
      const query = this.resolveQuery(contact, connection.provider);
      if (!query) continue;

      const dedupeKey = this.buildDedupeKey(connection.id, query.hash);
      const job = await this.jobs.enqueue({
        connectionId: connection.id,
        provider: connection.provider,
        contactId: contact.id,
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
        queryKind: query.kind,
        queryHash: query.hash,
        dedupeKey,
        triggeredBy: opts.triggeredBy ?? "bulk",
      });
      jobIds.push(job.id);
    }
    return { jobIds };
  }

  /**
   * Worker-side drain. Claims a batch of pending jobs and processes each.
   * Returns the number of jobs touched in this tick.
   */
  async drain(batchSize: number): Promise<number> {
    const due = await this.jobs.claimDueBatch(new Date(), batchSize);
    if (due.length === 0) return 0;

    for (const job of due) {
      try {
        const connection = await this.connections.findById(job.connectionId);
        if (!connection || connection.status !== "active") {
          await this.jobs.markFailed(job.id, "connection inactive");
          continue;
        }
        const contact = job.contactId
          ? await this.contactRepo.findById(job.contactId)
          : null;
        if (!contact) {
          await this.jobs.markFailed(job.id, "contact not found");
          continue;
        }
        const query = this.resolveQuery(contact, job.provider);
        if (!query) {
          await this.jobs.markFailed(job.id, "insufficient input on contact");
          continue;
        }

        const ctx: OwnershipContext = {
          userId: job.userId,
          organizationId: job.organizationId ?? undefined,
        };
        await this.processOne(connection, job, contact, query, {
          triggeredBy: job.triggeredBy ?? "drain",
        });
      } catch (err) {
        const msg = (err as Error).message ?? String(err);
        this.logger.error(`drain job ${job.id} failed: ${msg}`);
        try {
          await this.jobs.markFailed(job.id, msg);
        } catch {
          /* swallow */
        }
      }
    }
    return due.length;
  }

  // ── Internals ──

  private async processOne(
    connection: EnrichmentConnection,
    job: EnrichmentJob,
    contact: Contact,
    query: EnrichResolvedQuery,
    opts: EnrichContactOpts,
  ): Promise<EnrichmentJob> {
    const provider = this.registry.tryGet(connection.provider);
    if (!provider) {
      return this.jobs.markFailed(
        job.id,
        `provider not registered: ${connection.provider}`,
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
      result = await this.callProvider(provider, creds, query, opts);
    } catch (err) {
      if (err instanceof EnrichmentError) {
        if (err.code === "NOT_FOUND") {
          await this.connections.touchLastUsed(connection.id);
          return this.jobs.markNotFound(job.id, {
            resultSnapshot: { error: err.code },
          });
        }
        const terminal = await this.connections.reportProviderError(
          connection,
          err,
        );
        if (terminal)
          return this.jobs.markFailed(job.id, `${err.code}: ${err.message}`);

        // retryable?
        if (err.retryable && job.attemptCount < 9) {
          return this.jobs.scheduleRetry(
            job.id,
            job.attemptCount + 1,
            `${err.code}: ${err.message}`,
          );
        }
        return this.jobs.markFailed(job.id, `${err.code}: ${err.message}`);
      }
      const msg = (err as Error).message ?? String(err);
      return this.jobs.markFailed(job.id, msg);
    }

    if (!result.found) {
      await this.connections.touchLastUsed(connection.id);
      return this.jobs.markNotFound(job.id, { resultSnapshot: result });
    }

    const ctx: OwnershipContext = {
      userId: job.userId,
      organizationId: job.organizationId ?? undefined,
    };
    const providerLabel = `${connection.provider}:${connection.externalAccountId}`;
    await this.merge.mergeIntoContact(ctx, contact, result, providerLabel);

    const cost = PROVIDER_COST[connection.provider] ?? 0;
    const done = await this.jobs.markDone(job.id, {
      resultSnapshot: result,
      providerCredits: result.providerCost ?? null,
      costCredits: cost,
    });
    await this.connections.touchLastUsed(connection.id);

    // Debit credits post-merge (best-effort, mirrors call.service pattern).
    if (cost > 0) {
      try {
        await this.credits.consumeCredits(ctx, cost);
      } catch (err) {
        this.logger.warn(
          `credit debit failed for enrichment job ${done.id} (${cost} credits): ${(err as Error).message}`,
        );
      }
    }
    return done;
  }

  private async callProvider(
    provider: ReturnType<EnrichmentProviderRegistry["get"]>,
    creds: {
      apiKey: string;
      accountId: string;
      connectionId: string;
      metadata?: Record<string, unknown>;
    },
    query: EnrichResolvedQuery,
    opts: EnrichContactOpts,
  ): Promise<EnrichmentResult> {
    const enrichOpts = {
      revealPhone: opts.revealPhone ?? true,
      revealEmail: opts.revealEmail ?? true,
    };
    switch (query.kind) {
      case "email":
        if (!provider.enrichByEmail) throw notSupported(query.kind);
        return provider.enrichByEmail(
          creds,
          query.payload.email as string,
          enrichOpts,
        );
      case "linkedin":
        if (!provider.enrichByLinkedIn) throw notSupported(query.kind);
        return provider.enrichByLinkedIn(
          creds,
          query.payload.url as string,
          enrichOpts,
        );
      case "name_company":
        if (!provider.enrichByNameCompany) throw notSupported(query.kind);
        return provider.enrichByNameCompany(creds, query.payload, enrichOpts);
      case "domain":
        if (!provider.enrichByDomain) throw notSupported(query.kind);
        return provider.enrichByDomain(
          creds,
          query.payload.domain as string,
          enrichOpts,
        );
      case "phone":
        if (!provider.enrichByPhone) throw notSupported(query.kind);
        return provider.enrichByPhone(
          creds,
          query.payload.phone as string,
          enrichOpts,
        );
    }
  }

  private resolveQuery(
    contact: Contact,
    provider: EnrichmentProviderType,
  ): EnrichResolvedQuery | null {
    const providerImpl = this.registry.tryGet(provider);
    const caps = providerImpl?.capabilities;

    if (contact.linkedinUrl && caps?.byLinkedIn) {
      return this.buildQuery("linkedin", { url: contact.linkedinUrl });
    }
    if (contact.email && caps?.byEmail) {
      return this.buildQuery("email", { email: contact.email.toLowerCase() });
    }
    if (caps?.byNameCompany && contact.company && hasUsableName(contact)) {
      return this.buildQuery("name_company", {
        firstName: contact.firstName,
        lastName: contact.lastName,
        fullName: contact.fullName ?? contact.name,
        company: contact.company,
        domain: extractDomain(contact.email),
      });
    }
    const domain = extractDomain(contact.email);
    if (domain && caps?.byDomain) {
      return this.buildQuery("domain", { domain });
    }
    if (contact.phoneNumber && caps?.byPhone) {
      return this.buildQuery("phone", { phone: contact.phoneNumber });
    }
    return null;
  }

  private buildQuery(
    kind: EnrichmentQueryKind,
    payload: Record<string, unknown>,
  ): EnrichResolvedQuery {
    const normalized = JSON.stringify(payload, Object.keys(payload).sort());
    const hash = createHash("sha256")
      .update(`${kind}|${normalized}`)
      .digest("hex");
    return { kind, hash, payload };
  }

  private buildDedupeKey(connectionId: string, queryHash: string): string {
    const bucket = Math.floor(Date.now() / this.dedupTtlMs);
    return `${connectionId}:${queryHash}:${bucket}`;
  }

  private async candidateConnections(
    ctx: OwnershipContext,
    preferred?: EnrichmentProviderType,
  ): Promise<EnrichmentConnection[]> {
    const all = await this.connections.listActive(ctx);
    if (preferred) {
      const found = all.find((c) => c.provider === preferred);
      return found ? [found] : [];
    }
    return [...all].sort((a, b) => priority(a.provider) - priority(b.provider));
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
}

function priority(p: EnrichmentProviderType): number {
  const idx = PROVIDER_PRIORITY.indexOf(p);
  return idx === -1 ? 999 : idx;
}

function notSupported(kind: string): EnrichmentError {
  return new EnrichmentError(
    "VALIDATION",
    false,
    `provider does not support query kind: ${kind}`,
  );
}

function extractDomain(email: string | null | undefined): string | undefined {
  if (!email) return undefined;
  const parts = email.split("@");
  return parts[1]?.toLowerCase();
}

function hasUsableName(contact: Contact): boolean {
  if (contact.firstName && contact.lastName) return true;
  const combined = contact.fullName ?? contact.name;
  if (!combined) return false;
  // Need at least two whitespace-separated parts so we can split into first/last.
  return combined.trim().split(/\s+/).length >= 2;
}
