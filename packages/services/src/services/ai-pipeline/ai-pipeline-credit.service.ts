import { Injectable } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  AiUsage,
  OwnershipContext,
  computeTokenCost,
  isModelPriced,
} from "@ringee/platform";
import { CreditService } from "../credit.service";
import { PipelineContext } from "./pipeline-context";

/** Billing failure that must not be downgraded to a successful AI run. */
export class AiPipelineChargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiPipelineChargeError";
  }
}

/** Prices and debits one provider call made by an AI pipeline. */
@Injectable()
export class AiPipelineCreditService {
  constructor(private readonly credits: CreditService) {}

  async chargeUsage(input: {
    context: PipelineContext;
    fallbackUserId: string | null | undefined;
    usage: AiUsage | undefined;
    operation: string;
  }): Promise<number> {
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

    const tokenCount =
      (usage.inputTokens ?? 0) +
      (usage.outputTokens ?? 0) +
      (usage.cachedInputTokens ?? 0) +
      (usage.cacheWriteTokens ?? 0);
    if (tokenCount <= 0) {
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
      await this.credits.consumeCredits(owner, cost);
    } catch (error) {
      throw new AiPipelineChargeError(
        `${operation} credit debit failed: ${errorMessage(error)}`,
      );
    }
    return cost;
  }
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
