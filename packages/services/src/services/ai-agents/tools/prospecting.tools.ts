import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import {
  AiConversationRepository,
  AiToolEventRepository,
  EnrichmentProviderType,
  TagRepository,
} from "@ringee/database";
import {
  EnrichedPerson,
  EnrichmentProviderRegistry,
  LeadCandidate,
  LeadSearchFilters,
  LeadSearchResult,
} from "@ringee/platform";
import {
  EnrichmentConnectionService,
  LeadSearchService,
} from "../../enrichment";
import { TagService } from "../../tag.service";
import { PastBuyerAnalyzerService } from "../past-buyer-analyzer.service";
import {
  LeadDedupSummary,
  LeadStatus,
  ProspectDedupService,
} from "../prospect-dedup.service";
import {
  BuyerSignals,
  ProspectScoringService,
} from "../prospect-scoring.service";
import {
  AgentTool,
  AgentToolContext,
  ProspectDetails,
  ProspectPreview,
} from "../tool.types";

/** Search intents recognized by the search_prospects tool. */
type SearchIntent = "auto" | "next_page" | "refresh" | "reuse";

function normalizeIntent(value: unknown): SearchIntent {
  return value === "next_page" || value === "refresh" || value === "reuse"
    ? value
    : "auto";
}

/**
 * Sort weight by dedup status — new and previously-seen leads surface above
 * duplicates and already-saved contacts so the user acts on fresh leads first.
 */
const STATUS_SORT: Record<LeadStatus, number> = {
  new: 0,
  seen_before: 1,
  duplicate_provider: 2,
  already_saved: 3,
  already_called: 3,
  on_dnc: 4,
};

const FILTERS_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    jobTitles: { type: "array", items: { type: "string" } },
    seniorities: { type: "array", items: { type: "string" } },
    departments: { type: "array", items: { type: "string" } },
    industries: { type: "array", items: { type: "string" } },
    industriesExclude: { type: "array", items: { type: "string" } },
    employeeCountRanges: {
      type: "array",
      items: { type: "string", description: 'e.g. "1-10", "11-50"' },
    },
    revenueRanges: { type: "array", items: { type: "string" } },
    technologies: { type: "array", items: { type: "string" } },
    fundingStages: { type: "array", items: { type: "string" } },
    personLocations: { type: "array", items: { type: "string" } },
    personCountries: {
      type: "array",
      items: { type: "string", description: "ISO 2-letter country code" },
    },
    companyLocations: { type: "array", items: { type: "string" } },
    companyCountries: { type: "array", items: { type: "string" } },
    hasEmail: { type: "boolean" },
    hasPhone: { type: "boolean" },
    keywords: { type: "string" },
  },
  additionalProperties: false,
};

@Injectable()
export class ProspectingTools {
  private readonly logger = new Logger(ProspectingTools.name);

  constructor(
    private readonly connections: EnrichmentConnectionService,
    private readonly leadSearch: LeadSearchService,
    private readonly registry: EnrichmentProviderRegistry,
    private readonly pastBuyers: PastBuyerAnalyzerService,
    private readonly scoring: ProspectScoringService,
    private readonly dedup: ProspectDedupService,
    private readonly tags: TagService,
    private readonly tagRepo: TagRepository,
    private readonly conversations: AiConversationRepository,
    private readonly toolEvents: AiToolEventRepository,
  ) {}

  /** Returns the full tool list to register with an agent. */
  all(): AgentTool[] {
    return [
      this.detectConnectedProviders(),
      this.analyzePastBuyers(),
      this.searchProspects(),
      this.requestRevealProspects(),
      this.requestSaveProspects(),
      this.requestCreateList(),
    ];
  }

  // ── detect_connected_providers ─────────────────────────────────────
  private detectConnectedProviders(): AgentTool {
    return {
      name: "detect_connected_providers",
      description:
        "List which prospecting providers (Apollo, Prospeo) are currently connected for this user/organization, along with their capabilities. Always call this before recommending a provider.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: async (_args, rt) => {
        const conns = await this.connections.listActive(rt.ctx);
        return {
          providers: conns.map((c) => {
            const def = this.registry.tryGet(c.provider);
            return {
              type: c.provider,
              status: c.status,
              capabilities: def?.capabilities ?? null,
              accountName: c.externalAccountName,
              lastUsedAt: c.lastUsedAt,
            };
          }),
          anyConnected: conns.length > 0,
          bothConnected:
            conns.some((c) => c.provider === "apollo") &&
            conns.some((c) => c.provider === "prospeo"),
        };
      },
    };
  }

  // ── analyze_past_buyers ────────────────────────────────────────────
  private analyzePastBuyers(): AgentTool {
    return {
      name: "analyze_past_buyers",
      description:
        "Inspect the user's most recent calls whose outcome is a booked meeting or a closed sale, pull those contacts, and infer ICP signals (titles, seniorities, industries, countries, company sizes). Defaults to the last 25 such calls. Returns count: 0 when the user has no calls with those outcomes. Use the signals to recommend stronger searches and to score new prospects.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            description:
              "How many of the most recent booked-meeting / sale calls to inspect. Default 25.",
          },
        },
        additionalProperties: false,
      },
      execute: async (args, rt) => {
        const limit = Math.min(500, Math.max(1, Number(args?.limit) || 25));
        const analysis = await this.pastBuyers.analyze(rt.ctx, limit);

        // Cache signals on conversation state so subsequent searches can score.
        await this.conversations.mergeAgentState(rt.conversation.id, {
          ...(typeof rt.conversation.agentState === "object" &&
          rt.conversation.agentState !== null
            ? (rt.conversation.agentState as Record<string, unknown>)
            : {}),
          buyerSignals: analysis.signals,
          lastBuyerAnalysisAt: new Date().toISOString(),
        });

        return analysis;
      },
    };
  }

  // ── search_prospects ───────────────────────────────────────────────
  private searchProspects(): AgentTool {
    return {
      name: "search_prospects",
      description:
        "Search prospects across the user's connected prospecting providers using ICP-style filters. Returns a normalized, deduplicated, scored preview that does NOT yet reveal contact data. " +
        "CREDIT PROTECTION: with intent 'auto' (the default) this tool first checks whether the user already ran the same or a highly similar search recently. If a fresh match exists it does NOT call the provider, spends no credits, and instead returns status 'duplicate_search_detected' with the previous run and the actions to offer. " +
        "To act on the user's choice, call again with intent 'reuse' (re-show a previous run — pass previousJobId), 'next_page' (pass an incremented page), or 'refresh' (force a fresh provider call). Use 'auto' for genuinely new or broadened/narrowed filters. " +
        "Always present the results and reasons to the user before revealing emails or phones.",
      parameters: {
        type: "object",
        properties: {
          provider: {
            type: "string",
            enum: ["apollo", "prospeo"],
            description:
              "Optional provider preference. Omit to let the system pick the only connected one, or the most appropriate one.",
          },
          filters: FILTERS_SCHEMA,
          perPage: {
            type: "integer",
            description: "Results per page (max 50). Default 25.",
          },
          page: { type: "integer", description: "Page number (1-indexed)." },
          intent: {
            type: "string",
            enum: ["auto", "next_page", "refresh", "reuse"],
            description:
              "How to handle a possible duplicate search. 'auto' (default): run the dedup check first. 'next_page': skip the dedup gate and fetch the given page. 'refresh': force a fresh provider call even if a cached/recent run exists. 'reuse': re-show a previous run's results for free — requires previousJobId.",
          },
          previousJobId: {
            type: "string",
            description:
              "Required when intent is 'reuse'. The jobId of the previous search run to re-show (from a duplicate_search_detected match).",
          },
        },
        required: ["filters"],
        additionalProperties: false,
      },
      execute: async (args, rt) => {
        const filters = (args?.filters ?? {}) as LeadSearchFilters;
        const provider =
          (args?.provider as EnrichmentProviderType | undefined) ?? undefined;
        const intent = normalizeIntent(args?.intent);
        const page = Math.max(1, Number(args?.page) || 1);
        const perPage = Math.min(50, Math.max(1, Number(args?.perPage) || 25));

        // intent: reuse → re-show a stored run without spending credits.
        if (intent === "reuse" && typeof args?.previousJobId === "string") {
          return this.reusePreviousSearch(rt, args.previousJobId);
        }

        // intent: auto → dedup gate. A fresh identical/similar run means we
        // must NOT call the provider; surface the previous run instead.
        if (intent === "auto") {
          try {
            const resolvedProvider = await this.leadSearch.resolveProvider(
              rt.ctx,
              provider,
            );
            const verdict = await this.dedup.checkSearch(rt.ctx, {
              provider: resolvedProvider,
              filters,
              page,
              perPage,
            });
            if (verdict.shouldReuse && verdict.match) {
              await rt.emit({
                kind: "duplicate_search_detected",
                relationship: verdict.relationship as "identical" | "similar",
                match: verdict.match,
                recommendedActions: verdict.recommendedActions,
                message: verdict.message,
              });
              return {
                status: "duplicate_search_detected",
                relationship: verdict.relationship,
                previousRun: verdict.match,
                recommendedActions: verdict.recommendedActions,
                guidance:
                  verdict.message +
                  " IMPORTANT: no new search was run and no credits were spent. " +
                  "Present these options to the user and wait for their choice. " +
                  "To act on it, call search_prospects again with intent 'reuse' " +
                  "(pass previousJobId to show the previous results), 'next_page' " +
                  "(pass an incremented page), or 'refresh'.",
              };
            }
          } catch (err) {
            // Dedup is best-effort — never block a search because of it.
            this.logger.warn(
              `search dedup check skipped: ${(err as Error).message}`,
            );
          }
        }

        await rt.emit({
          kind: "tool_progress",
          toolName: "search_prospects",
          message: provider
            ? `Searching prospects via ${provider}...`
            : "Searching prospects...",
        });

        const response = await this.leadSearch.searchLeads(rt.ctx, filters, {
          provider,
          page,
          perPage,
          // 'refresh' bypasses even the exact-hash result cache.
          useCache: intent !== "refresh",
        });

        const { previews, dedupSummary } = await this.emitProspectResults(rt, {
          jobId: response.job.id,
          provider: response.job.provider,
          candidates: response.result.results,
          filters,
          excludeJobId: response.job.id,
        });

        // Persist the lastSearch reference into agent state.
        await this.conversations.mergeAgentState(rt.conversation.id, {
          ...(typeof rt.conversation.agentState === "object" &&
          rt.conversation.agentState !== null
            ? (rt.conversation.agentState as Record<string, unknown>)
            : {}),
          lastSearch: {
            jobId: response.job.id,
            provider: response.job.provider,
            filters,
            totalResults: response.result.total,
            cached: response.cached,
            at: new Date().toISOString(),
          },
        });

        return {
          jobId: response.job.id,
          provider: response.job.provider,
          totalResults: response.result.total,
          page: response.result.page,
          perPage: response.result.perPage,
          hasMore: response.result.hasMore,
          cached: response.cached,
          dedupSummary,
          previews,
        };
      },
    };
  }

  /**
   * Re-show a previous search run's results without calling the provider —
   * the "show previous results" path of the duplicate-search decision UI.
   * Spends no credits.
   */
  private async reusePreviousSearch(
    rt: AgentToolContext,
    jobId: string,
  ): Promise<unknown> {
    let job;
    try {
      job = await this.leadSearch.getJob(jobId, rt.ctx);
    } catch (err) {
      return {
        status: "error",
        error: `Could not load the previous search: ${(err as Error).message}`,
      };
    }
    const snapshot = job.resultSnapshot as LeadSearchResult | null;
    const candidates = snapshot?.results ?? [];
    const filters = (job.filters ?? {}) as LeadSearchFilters;

    const { previews, dedupSummary } = await this.emitProspectResults(rt, {
      jobId: job.id,
      provider: job.provider,
      candidates,
      filters,
      excludeJobId: job.id,
    });

    return {
      status: "reused_previous_search",
      jobId: job.id,
      provider: job.provider,
      cached: true,
      dedupSummary,
      previews,
      guidance:
        "These are the previous run's results, re-shown for free. No credits were spent.",
    };
  }

  /**
   * Score + dedup-classify a candidate set, build previews (new leads first),
   * and emit them as a prospect_results event. Shared by the fresh-search and
   * reuse-previous paths.
   */
  private async emitProspectResults(
    rt: AgentToolContext,
    params: {
      jobId: string;
      provider: string;
      candidates: LeadCandidate[];
      filters: LeadSearchFilters;
      excludeJobId?: string;
    },
  ): Promise<{ previews: ProspectPreview[]; dedupSummary: LeadDedupSummary }> {
    const stateSignals = this.readBuyerSignals(rt);
    const scored = this.scoring.scoreMany(params.candidates, stateSignals);

    const report = await this.dedup.classifyCandidates(
      rt.ctx,
      params.candidates,
      { excludeJobId: params.excludeJobId },
    );

    const previews: ProspectPreview[] = scored.map((s) => {
      const info = report.byExternalId[s.candidate.externalId];
      return {
        externalId: s.candidate.externalId,
        jobId: params.jobId,
        provider: s.candidate.provider,
        fullName:
          s.candidate.person.fullName ??
          ([s.candidate.person.firstName, s.candidate.person.lastName]
            .filter(Boolean)
            .join(" ") ||
            null),
        jobTitle: s.candidate.person.jobTitle ?? null,
        company: s.candidate.company?.name ?? null,
        location:
          [
            s.candidate.person.location?.city,
            s.candidate.person.location?.country,
          ]
            .filter(Boolean)
            .join(", ") || null,
        hasEmail: s.candidate.person.emails.some((e) => Boolean(e.value)),
        hasPhone: s.candidate.person.phones.some((p) => Boolean(p.value)),
        fitScore: s.score,
        confidence: s.candidate.confidence ?? null,
        reasons: s.reasons,
        linkedinUrl: personLinkedinUrl(s.candidate.person),
        details: buildProspectDetails(s.candidate),
        status: info?.status ?? "new",
        dedupReasons: info?.reasons ?? [],
        ringeeHasEmail: info?.ringeeHasEmail ?? false,
        ringeeHasPhone: info?.ringeeHasPhone ?? false,
      };
    });

    // Surface new and previously-seen leads above duplicates / saved contacts;
    // within a status band keep the highest fit score first.
    previews.sort((a, b) => {
      const rank = STATUS_SORT[a.status] - STATUS_SORT[b.status];
      return rank !== 0 ? rank : b.fitScore - a.fitScore;
    });

    await rt.emit({
      kind: "prospect_results",
      jobId: params.jobId,
      provider: params.provider,
      results: previews,
      filtersSummary: summarizeFilters(params.filters),
      dedupSummary: report.summary,
    });

    return { previews, dedupSummary: report.summary };
  }

  // ── request_reveal_prospects (requires explicit user confirmation) ─
  private requestRevealProspects(): AgentTool {
    return {
      name: "request_reveal_prospects",
      description:
        "Ask the user for confirmation before revealing email and/or phone for one or more prospects from the latest search. This never reveals data on its own — it emits a confirmation_request that the UI surfaces to the user. The user confirms via the UI and a separate flow finalizes the reveal.",
      parameters: {
        type: "object",
        properties: {
          jobId: {
            type: "string",
            description: "Lead search job id returned by search_prospects.",
          },
          externalIds: {
            type: "array",
            items: { type: "string" },
            description: "Provider external ids of prospects to reveal.",
          },
          revealEmail: { type: "boolean", description: "Default true." },
          revealPhone: {
            type: "boolean",
            description:
              "Default false — phone reveal is usually more expensive than email.",
          },
        },
        required: ["jobId", "externalIds"],
        additionalProperties: false,
      },
      execute: async (args, rt) => {
        const requestId = randomUUID();
        const revealEmail = args?.revealEmail !== false;
        const revealPhone = args?.revealPhone === true;
        const requestedIds: string[] = Array.isArray(args?.externalIds)
          ? args.externalIds
          : [];

        // Reveal dedup — drop prospects whose requested contact data Ringee
        // already has, so the user is never charged for a re-reveal.
        let ids = requestedIds;
        let alreadyAvailable = 0;
        try {
          const job = await this.leadSearch.getJob(args.jobId, rt.ctx);
          const snapshot = job.resultSnapshot as LeadSearchResult | null;
          const candidates = (snapshot?.results ?? []).filter((c) =>
            requestedIds.includes(c.externalId),
          );
          if (candidates.length > 0) {
            const report = await this.dedup.classifyCandidates(
              rt.ctx,
              candidates,
            );
            const needReveal: string[] = [];
            for (const id of requestedIds) {
              const info = report.byExternalId[id];
              if (!info) {
                // Not found in the snapshot — cannot verify, so reveal it.
                needReveal.push(id);
                continue;
              }
              const emailCovered = !revealEmail || info.ringeeHasEmail;
              const phoneCovered = !revealPhone || info.ringeeHasPhone;
              if (emailCovered && phoneCovered) alreadyAvailable += 1;
              else needReveal.push(id);
            }
            ids = needReveal;
          }
        } catch (err) {
          // On any dedup failure, fall back to revealing everything asked for.
          this.logger.warn(`reveal dedup skipped: ${(err as Error).message}`);
          ids = requestedIds;
          alreadyAvailable = 0;
        }

        if (ids.length === 0) {
          return {
            status: "already_revealed",
            alreadyAvailable,
            instruction:
              "Every selected prospect already has the requested contact data stored in Ringee. Tell the user no reveal is needed — the data is already available and no credits will be spent.",
          };
        }

        const skippedNote =
          alreadyAvailable > 0
            ? ` (${alreadyAvailable} skipped — already in Ringee)`
            : "";
        const summary = `Reveal ${revealEmail ? "email" : ""}${
          revealEmail && revealPhone ? " + " : ""
        }${revealPhone ? "phone" : ""} for ${ids.length} prospect${
          ids.length === 1 ? "" : "s"
        }${skippedNote}.`;

        // The persisted row is the single source of truth the UI re-reads on
        // reload, so it must carry `summary` — the SSE event alone is not
        // replayed.
        const event = await this.toolEvents.create({
          conversationId: rt.conversation.id,
          kind: "confirmation_request",
          payload: {
            requestId,
            action: "reveal",
            jobId: args.jobId,
            externalIds: ids,
            revealEmail,
            revealPhone,
            summary,
          },
        });

        await rt.emit({
          kind: "confirmation_request",
          requestId: event.id,
          action: "reveal",
          payload: {
            jobId: args.jobId,
            externalIds: ids,
            revealEmail,
            revealPhone,
          },
          summary,
          estimatedCreditCost: null,
        });

        return {
          status: "awaiting_confirmation",
          confirmationId: event.id,
          instruction:
            "Tell the user that reveal will run only after they confirm in the UI. Do not call reveal until then.",
        };
      },
    };
  }

  // ── request_save_prospects ────────────────────────────────────────
  private requestSaveProspects(): AgentTool {
    return {
      name: "request_save_prospects",
      description:
        "Ask the user for confirmation before saving selected prospects to Ringee contacts. Like reveal, this emits a confirmation_request — saving happens after the user accepts in the UI.",
      parameters: {
        type: "object",
        properties: {
          jobId: { type: "string" },
          externalIds: { type: "array", items: { type: "string" } },
          listName: {
            type: "string",
            description:
              "Optional name of a list (Tag) to assign the saved contacts to.",
          },
        },
        required: ["jobId", "externalIds"],
        additionalProperties: false,
      },
      execute: async (args, rt) => {
        const ids: string[] = Array.isArray(args?.externalIds)
          ? args.externalIds
          : [];
        const summary = `Save ${ids.length} prospect${
          ids.length === 1 ? "" : "s"
        } to Ringee${
          args.listName ? ` and add to list "${args.listName}"` : ""
        }.`;

        // The persisted row is the single source of truth the UI re-reads on
        // reload, so it must carry `summary` — the SSE event alone is not
        // replayed.
        const event = await this.toolEvents.create({
          conversationId: rt.conversation.id,
          kind: "confirmation_request",
          payload: {
            action: "save",
            jobId: args.jobId,
            externalIds: ids,
            listName: args.listName ?? null,
            summary,
          },
        });

        await rt.emit({
          kind: "confirmation_request",
          requestId: event.id,
          action: "save",
          payload: {
            jobId: args.jobId,
            externalIds: ids,
            listName: args.listName ?? null,
          },
          summary,
        });

        return {
          status: "awaiting_confirmation",
          confirmationId: event.id,
          instruction:
            "Saving runs after the user confirms in the UI. Do not call save again until they do.",
        };
      },
    };
  }

  // ── request_create_list ────────────────────────────────────────────
  private requestCreateList(): AgentTool {
    return {
      name: "request_create_list",
      description:
        "Create a Ringee list (Tag) and attach saved contacts to it. Use only after at least one batch of prospects has been saved.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          contactIds: { type: "array", items: { type: "string" } },
        },
        required: ["name", "contactIds"],
        additionalProperties: false,
      },
      execute: async (args, rt) => {
        const name = String(args.name).trim();
        if (!name) {
          return { ok: false, error: "List name is required." };
        }
        const ids: string[] = Array.isArray(args?.contactIds)
          ? args.contactIds
          : [];
        if (ids.length === 0) {
          return { ok: false, error: "At least one contact is required." };
        }

        const tag = await this.tags.createTag(rt.ctx, { name });
        for (const cid of ids) {
          await this.tagRepo
            .assignToContact(cid, [tag.id])
            .catch((err) =>
              this.logger.warn(
                `failed to attach tag ${tag.id} to ${cid}: ${err}`,
              ),
            );
        }

        await rt.emit({
          kind: "list_created",
          tagId: tag.id,
          tagName: tag.name,
          contactCount: ids.length,
        });

        return {
          ok: true,
          tagId: tag.id,
          name: tag.name,
          contactCount: ids.length,
        };
      },
    };
  }

  private readBuyerSignals(rt: AgentToolContext): BuyerSignals | null {
    const state = rt.conversation.agentState as Record<string, unknown> | null;
    const sig = state?.buyerSignals;
    if (!sig || typeof sig !== "object") return null;
    return sig as BuyerSignals;
  }
}

/** Best-effort LinkedIn URL: explicit field, else a linkedin social profile. */
function personLinkedinUrl(person: EnrichedPerson): string | null {
  if (person.linkedinUrl) return person.linkedinUrl;
  const social = person.socialProfiles?.find((s) =>
    /linkedin/i.test(s.platform),
  );
  return social?.url ?? null;
}

/**
 * Project a provider lead candidate into the normalized detail payload the
 * UI modal renders. Email/phone VALUES are never included — only counts —
 * so the reveal-confirmation gate is never bypassed.
 */
function buildProspectDetails(c: LeadCandidate): ProspectDetails {
  const p = c.person;
  const co = c.company;
  return {
    person: {
      firstName: p.firstName ?? null,
      lastName: p.lastName ?? null,
      headline: p.headline ?? null,
      summary: p.summary ?? null,
      jobTitle: p.jobTitle ?? null,
      seniority: p.seniority ?? null,
      department: p.department ?? null,
      yearsExperience: p.yearsExperience ?? null,
      linkedinUrl: personLinkedinUrl(p),
      twitterUrl: p.twitterUrl ?? null,
      githubUrl: p.githubUrl ?? null,
      facebookUrl: p.facebookUrl ?? null,
      websiteUrl: p.websiteUrl ?? null,
      city: p.location?.city ?? null,
      region: p.location?.region ?? null,
      country: p.location?.country ?? null,
      timezone: p.timezone ?? null,
      languages: p.languages ?? [],
      skills: p.skills ?? [],
      emailCount: p.emails.length,
      verifiedEmailCount: p.emails.filter((e) => e.verified).length,
      phoneCount: p.phones.length,
      workHistory: (p.workHistory ?? []).slice(0, 8).map((w) => ({
        company: w.company ?? null,
        title: w.title ?? null,
        current: w.current ?? null,
      })),
      education: (p.education ?? []).slice(0, 6).map((e) => ({
        school: e.school ?? null,
        degree: e.degree ?? null,
        field: e.field ?? null,
      })),
    },
    company: co
      ? {
          name: co.name ?? null,
          legalName: co.legalName ?? null,
          domain: co.domain ?? null,
          website: co.website ?? null,
          description: co.description ?? null,
          industry: co.industry ?? null,
          subIndustry: co.subIndustry ?? null,
          size: co.size ?? null,
          employeeCount: co.employeeCount ?? null,
          employeeCountRange: co.employeeCountRange ?? null,
          revenueRange: co.revenueRange ?? null,
          fundingStage: co.fundingStage ?? null,
          foundedYear: co.foundedYear ?? null,
          companyType: co.companyType ?? null,
          linkedinUrl: co.linkedinUrl ?? null,
          logoUrl: co.logoUrl ?? null,
          location:
            [co.hq?.city, co.hq?.region, co.hq?.country]
              .filter(Boolean)
              .join(", ") || null,
          technologies: co.technologies ?? [],
          keywords: co.keywords ?? [],
        }
      : null,
  };
}

function summarizeFilters(filters: LeadSearchFilters): string {
  const parts: string[] = [];
  if (filters.jobTitles?.length)
    parts.push(`titles: ${filters.jobTitles.join(", ")}`);
  if (filters.industries?.length)
    parts.push(`industries: ${filters.industries.join(", ")}`);
  if (filters.personCountries?.length)
    parts.push(`countries: ${filters.personCountries.join(", ")}`);
  if (filters.employeeCountRanges?.length)
    parts.push(`size: ${filters.employeeCountRanges.join(", ")}`);
  if (filters.keywords) parts.push(`keywords: ${filters.keywords}`);
  if (parts.length === 0) return "no specific filters";
  return parts.join(" · ");
}
