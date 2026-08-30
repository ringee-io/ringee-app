import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { WorkspaceCompanyProfileRepository } from "@ringee/database";
import type { WorkspaceCompanyProfile } from "@ringee/database";
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

/**
 * The company context every AI voice agent in a workspace shares (§6).
 *
 * It lives at workspace level on purpose: an agent's prompt should not carry a
 * copy of the company description, and a caller should not have to pass it on
 * every call. Agents read it at save time and it is interpolated into their
 * instructions as dynamic variables.
 */
@Injectable()
export class CompanyProfileService {
  private readonly logger = new Logger(CompanyProfileService.name);

  constructor(
    private readonly repository: WorkspaceCompanyProfileRepository,
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
  async resolveContext(
    ctx: OwnershipContext,
  ): Promise<VoiceAgentCompanyContext> {
    const profile = await this.repository.find(ctx);
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
