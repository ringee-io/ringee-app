import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  AiVoiceAgentRepository,
  WorkspaceCompanyProfileRepository,
} from "@ringee/database";
import type { AiVoiceAgent, WorkspaceCompanyProfile } from "@ringee/database";
import {
  AiProviderRegistry,
  type AiUsage,
  computeTokenCost,
  isModelPriced,
  type OwnershipContext,
} from "@ringee/platform";
import { CreditService, incurredCostDebitRef } from "../credit.service";
import { requirePublicUrl } from "./public-url";
import type { VoiceAgentCompanyContext } from "./voice-agent.types";

/** How much of a fetched page is worth sending to the model. */
const MAX_PAGE_CHARACTERS = 12_000;

/** The company context of one agent, offered for another agent to adopt. */
export interface ReusableCompanyContext {
  /** The agent this context was written on, or null for the workspace one. */
  agentId: string | null;
  /** What the picker shows: the agent's name, or "Workspace default". */
  label: string;
  companyName: string | null;
  companyWebsite: string | null;
  companyDescription: string | null;
}

/** A company context as an agent's prompt needs it: no holes, ever. */
type ResolvedContext = VoiceAgentCompanyContext;

/**
 * The company context an AI voice agent speaks with (§6).
 *
 * It lives on the agent, because one workspace runs agents for several brands,
 * products or clients. The workspace-level profile stays as the fallback for an
 * agent that carries none of its own, so nothing an earlier agent was built
 * with changes underneath it. Agents read the context at save time and it is
 * interpolated into their instructions as dynamic variables.
 */
@Injectable()
export class CompanyProfileService {
  private readonly logger = new Logger(CompanyProfileService.name);

  constructor(
    private readonly repository: WorkspaceCompanyProfileRepository,
    private readonly agents: AiVoiceAgentRepository,
    private readonly providers: AiProviderRegistry,
    private readonly credits: CreditService,
  ) {}

  get(ctx: OwnershipContext): Promise<WorkspaceCompanyProfile | null> {
    return this.repository.find(ctx);
  }

  save(
    ctx: OwnershipContext,
    dto: {
      companyName?: string | null;
      companyWebsite?: string | null;
      companyDescription?: string | null;
    },
  ): Promise<WorkspaceCompanyProfile> {
    return this.repository.upsert(ctx, {
      companyName: dto.companyName?.trim() || null,
      companyWebsite: dto.companyWebsite?.trim() || null,
      companyDescription: dto.companyDescription?.trim() || null,
    });
  }

  /**
   * Resolves the context an agent's prompt interpolates. Falls back to neutral
   * text rather than leaving a template hole, so an agent whose workspace never
   * filled the profile in still speaks a coherent sentence.
   */
  async resolveContext(ctx: OwnershipContext): Promise<ResolvedContext> {
    return this.toContext(await this.repository.find(ctx));
  }

  /**
   * The context one agent speaks with: its own when it has one, the workspace
   * profile otherwise. An agent counts as having its own as soon as it names a
   * company — a blank description is a choice, not a reason to inherit.
   */
  async resolveForAgent(
    ctx: OwnershipContext,
    agent: Pick<
      AiVoiceAgent,
      "companyName" | "companyWebsite" | "companyDescription"
    >,
  ): Promise<ResolvedContext> {
    const own = agent.companyName?.trim() || agent.companyDescription?.trim();
    return own ? this.toContext(agent) : this.resolveContext(ctx);
  }

  /**
   * Every company context already written in this workspace, so a new agent can
   * adopt one instead of retyping it. The workspace profile comes first because
   * it is what every agent without its own already speaks with.
   */
  async listReusable(ctx: OwnershipContext): Promise<ReusableCompanyContext[]> {
    const [workspace, agents] = await Promise.all([
      this.repository.find(ctx),
      this.agents.listCompanyContextsForOwner(ctx),
    ]);

    const contexts: ReusableCompanyContext[] = [];
    if (
      workspace?.companyName?.trim() ||
      workspace?.companyDescription?.trim()
    ) {
      contexts.push({
        agentId: null,
        label: "Workspace default",
        companyName: workspace.companyName,
        companyWebsite: workspace.companyWebsite,
        companyDescription: workspace.companyDescription,
      });
    }
    for (const agent of agents) {
      contexts.push({
        agentId: agent.id,
        label: agent.name,
        companyName: agent.companyName,
        companyWebsite: agent.companyWebsite,
        companyDescription: agent.companyDescription,
      });
    }
    return contexts;
  }

  private toContext(
    profile: {
      companyName: string | null;
      companyWebsite: string | null;
      companyDescription: string | null;
    } | null,
  ): ResolvedContext {
    return {
      name: profile?.companyName?.trim() || "our company",
      description:
        profile?.companyDescription?.trim() ||
        "No additional company details were provided.",
      website: profile?.companyWebsite?.trim() || "",
    };
  }

  /**
   * Drafts a company description from the company's own website, so the user
   * does not have to write one. The draft is returned, not saved — the user
   * confirms it.
   */
  async generateDescription(
    ctx: OwnershipContext,
    website: string,
  ): Promise<{ description: string }> {
    const url = requirePublicUrl(website);
    const page = await this.fetchPageText(url);
    if (!page) {
      throw new BadRequestException(
        "Could not read that website. Check the address, or write the description yourself.",
      );
    }

    const provider = this.providers.get(apiConfiguration.AI_PROVIDER);
    const { summary, usage } = await provider.summarize({
      system: [
        "You write the company context an AI phone agent is given before it",
        "calls someone. Describe what this company does, who it serves and what",
        "it offers, in three to five plain sentences. No marketing language, no",
        "bullet points, no headings. Write only facts the page supports.",
      ].join(" "),
      messages: [
        {
          role: "user",
          content: `Website: ${url.href}\n\nPage content:\n${page}`,
        },
      ],
    });

    await this.chargeGeneration(ctx, usage);

    const description = summary.trim();
    if (!description) {
      throw new BadRequestException(
        "The model returned an empty description. Try again or write one yourself.",
      );
    }
    return { description };
  }

  private async fetchPageText(url: URL): Promise<string | null> {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "text/html,application/xhtml+xml" },
      });
      if (!response.ok) return null;
      const html = await response.text();
      return this.stripHtml(html).slice(0, MAX_PAGE_CHARACTERS) || null;
    } catch (error) {
      this.logger.warn(
        `Could not fetch ${url.href}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * The draft costs real tokens, so it is billed like every other AI call
   * (BILL-015). The cost was already incurred, so the debit ref is unique per
   * invocation rather than idempotent.
   */
  private async chargeGeneration(
    ctx: OwnershipContext,
    usage: AiUsage | undefined,
  ): Promise<void> {
    const model = usage?.model;
    if (!model || !isModelPriced(model)) {
      this.logger.warn(
        `Company context generation returned an unpriced model (${model ?? "none"}); not charged`,
      );
      return;
    }
    const { chargedCredits } = computeTokenCost(
      model,
      {
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        cachedInputTokens: usage?.cachedInputTokens,
        cacheWriteTokens: usage?.cacheWriteTokens,
      },
      apiConfiguration.AI_TOKEN_MARGIN,
    );
    const cost = Math.round(chargedCredits * 1e6) / 1e6;
    if (cost <= 0) return;

    await this.credits.consumeCredits(
      ctx,
      cost,
      incurredCostDebitRef(
        "ai-voice-agent-company-context",
        "ai.voice_agent.company_context",
      ),
    );
  }
}
