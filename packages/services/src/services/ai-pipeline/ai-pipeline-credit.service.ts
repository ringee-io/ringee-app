import { Injectable } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  AiUsage,
  OwnershipContext,
  computeTokenCost,
  isModelPriced,
} from "@ringee/platform";
import { CreditService, incurredCostDebitRef } from "../credit.service";
import { contextKey, PipelineContext } from "./pipeline-context";

/** Billing failure that must not be downgraded to a successful AI run. */
export class AiPipelineChargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiPipelineChargeError";
  }
}

/**
 * A provider reply the pipeline rejects after it consumed tokens — a required
 * tool call answered in plain text. Raised by `chargeFailedReply` once those
 * tokens are billed; `chargedCredits` is what they cost, so a run that fails on
 * it still reports the charge.
 */
export class AiPipelineReplyError extends Error {
  constructor(
    message: string,
    readonly chargedCredits: number,
  ) {
    super(message);
    this.name = "AiPipelineReplyError";
  }
}

export interface AiPipelineChargeInput {
  context: PipelineContext;
  fallbackUserId: string | null | undefined;
  usage: AiUsage | undefined;
  operation: string;
}

/** Prices and debits one provider call made by an AI pipeline. */
@Injectable()
export class AiPipelineCreditService {
  constructor(private readonly credits: CreditService) {}

  /**
   * Bills the tokens a failed reply consumed, then raises the provider's error
   * as an `AiPipelineReplyError`: the run fails as before, but nothing it
   * consumed goes unbilled. A failure without usage (the request never got a
   * reply) has nothing to bill and is raised with a zero charge.
   */
  async chargeFailedReply(
    input: AiPipelineChargeInput & { error: string },
  ): Promise<never> {
    const { error, ...charge } = input;
    const chargedCredits =
      tokenCount(charge.usage) > 0 ? await this.chargeUsage(charge) : 0;
    throw new AiPipelineReplyError(error, chargedCredits);
  }

  async chargeUsage(input: AiPipelineChargeInput): Promise<number> {
    const { usage, operation } = input;
    if (!usage?.model) {
      throw new AiPipelineChargeError(
        `${operation} completed without a billable model id`,
      );
    }
    if (!isModelPriced(usage.model)) {
      throw new AiPipelineChargeError(
        `${operation} used unpriced model "${usage.model}"`,
      );
    }

    if (tokenCount(usage) <= 0) {
      throw new AiPipelineChargeError(
        `${operation} completed without token usage`,
      );
    }

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
    if (cost <= 0) {
      throw new AiPipelineChargeError(
        `${operation} produced a zero credit charge`,
      );
    }

    const owner = billingOwner(input.context, input.fallbackUserId, operation);
    try {
      await this.credits.consumeCredits(
        owner,
        cost,
        incurredCostDebitRef(
          `ai-pipeline:${contextKey(input.context)}`,
          "ai.pipeline.run",
        ),
      );
    } catch (error) {
      throw new AiPipelineChargeError(
        `${operation} credit debit failed: ${errorMessage(error)}`,
      );
    }
    return cost;
  }
}

function tokenCount(usage: AiUsage | undefined): number {
  return (
    (usage?.inputTokens ?? 0) +
    (usage?.outputTokens ?? 0) +
    (usage?.cachedInputTokens ?? 0) +
    (usage?.cacheWriteTokens ?? 0)
  );
}

function billingOwner(
  context: PipelineContext,
  fallbackUserId: string | null | undefined,
  operation: string,
): OwnershipContext {
  if (context.type === "personal") {
    return { userId: context.userId, organizationId: null };
  }
  if (!fallbackUserId) {
    throw new AiPipelineChargeError(
      `${operation} has no user available for billing ownership`,
    );
  }
  if (context.type === "organization_outside_campaign") {
    return {
      userId: fallbackUserId,
      organizationId: context.organizationId,
    };
  }
  return {
    userId: fallbackUserId,
    organizationId: context.organizationId,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
