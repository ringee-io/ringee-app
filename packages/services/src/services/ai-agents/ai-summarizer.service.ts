import { Injectable, Logger } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  AiConversation,
  AiConversationRepository,
  AiMessageRepository,
} from "@ringee/database";
import {
  AiProviderRegistry,
  OwnershipContext,
  computeTokenCost,
} from "@ringee/platform";
import type { AiUsage } from "@ringee/platform";
import { CreditService, incurredCostDebitRef } from "../credit.service";

const SUMMARIZER_SYSTEM = `
You are a conversation summarizer for an outbound-sales AI assistant.

Compact the prior assistant/user exchange into a structured English summary
that the assistant can use to continue the conversation without loss of
critical context. Preserve:

- The user's selling goal and ICP assumptions.
- The selected prospecting provider (Apollo, Prospeo, or both) if chosen.
- Recommended segments and search strategies the assistant proposed.
- Decisions the user made.
- Revealed leads or saved contacts.
- Pending confirmations the user has not yet acted on.
- Concrete next recommended actions.

Skip pleasantries and meta-talk. Use short bullet-style lines under headings.
Maximum 250 words. Output plain text only.
`.trim();

@Injectable()
export class AiSummarizerService {
  private readonly logger = new Logger(AiSummarizerService.name);

  constructor(
    private readonly conversations: AiConversationRepository,
    private readonly messages: AiMessageRepository,
    private readonly providerRegistry: AiProviderRegistry,
    private readonly credits: CreditService,
  ) {}

  shouldSummarize(
    estimatedTokens: number,
    conversation: AiConversation,
  ): boolean {
    if (estimatedTokens < apiConfiguration.AI_SUMMARY_TRIGGER_TOKENS)
      return false;
    // Re-summarize at most every 10 messages to avoid loops.
    return true;
  }

  async summarize(conversation: AiConversation): Promise<void> {
    const provider = this.providerRegistry.get(apiConfiguration.AI_PROVIDER);
    const all = await this.messages.listForConversation(conversation.id, 200);
    if (all.length === 0) return;

    // Keep the most recent 10 messages out of the summary (they remain in the
    // recent window). Summarize everything before that, merging with the
    // existing summary if there is one.
    const keepTail = 10;
    const toSummarize = all.slice(0, Math.max(0, all.length - keepTail));
    if (toSummarize.length === 0) return;

    const transcript = toSummarize
      .map((m) => {
        if (m.role === "tool") {
          return `[tool result: ${m.toolName}] ${
            m.toolPayload ? JSON.stringify(m.toolPayload).slice(0, 500) : ""
          }`;
        }
        if (m.role === "assistant" && m.toolName) {
          return `[assistant called tool ${m.toolName}] ${JSON.stringify(m.toolPayload ?? {})}`;
        }
        return `${m.role}: ${m.content ?? ""}`;
      })
      .join("\n");

    const priorSummary = conversation.summary
      ? `Existing summary so far:\n${conversation.summary}\n\nNew transcript to fold in:\n${transcript}`
      : transcript;

    try {
      const res = await provider.summarize({
        system: SUMMARIZER_SYSTEM,
        messages: [{ role: "user", content: priorSummary }],
      });
      await this.conversations.setSummary(
        conversation.id,
        res.summary.trim(),
        res.usage?.outputTokens ?? null,
      );
      // Summarization is a real model call — bill it to the conversation
      // total so the displayed cost stays accurate.
      await this.chargeSummary(conversation, res.usage);
    } catch (err) {
      this.logger.warn(
        `Summarization failed for conversation ${conversation.id}: ${
          (err as Error).message
        }`,
      );
    }
  }

  private async chargeSummary(
    conversation: AiConversation,
    usage: AiUsage | undefined,
  ): Promise<void> {
    if (!usage) return;
    const { chargedCredits } = computeTokenCost(
      usage.model,
      {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
      },
      apiConfiguration.AI_TOKEN_MARGIN,
    );
    const cost = Math.round(chargedCredits * 1e6) / 1e6;
    if (cost <= 0) return;

    const ctx: OwnershipContext = {
      userId: conversation.userId,
      organizationId: conversation.organizationId,
    };
    try {
      await this.credits.consumeCredits(
        ctx,
        cost,
        incurredCostDebitRef(
          `ai-summary:${conversation.id}`,
          "ai.conversation.summary",
        ),
      );
      await this.conversations.incrementCost(conversation.id, cost);
    } catch (err) {
      this.logger.warn(
        `summary credit debit failed for ${conversation.id}: ${
          (err as Error).message
        }`,
      );
    }
  }
}
