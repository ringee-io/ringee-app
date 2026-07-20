/**
 * AI token pricing for Ringee AI.
 *
 * Prices are USD per 1,000,000 tokens. Ringee credits are 1:1 with USD
 * (Stripe top-ups add `amountUsd` credits), so the computed cost is debited
 * directly from the user's credit balance after the configured profit
 * margin is applied.
 *
 * To add a model, add an entry below — matching is done by exact id first,
 * then by longest-prefix so dated/full ids (e.g. `claude-haiku-4-5-20251001`)
 * resolve to the right row.
 */

export interface ModelPricing {
  /** USD per 1M fresh (uncached) input tokens. */
  inputPerMTok: number;
  /** USD per 1M output tokens. */
  outputPerMTok: number;
  /** USD per 1M cache-write tokens. 0 for providers that don't bill it. */
  cacheWritePerMTok: number;
  /** USD per 1M cache-read tokens. */
  cacheReadPerMTok: number;
}

/** Token counts for a single model turn, already split by kind. */
export interface UsageCounts {
  /** Fresh input tokens (excludes cache reads/writes). */
  inputTokens?: number;
  outputTokens?: number;
  /** Tokens served from the prompt cache. */
  cachedInputTokens?: number;
  /** Tokens written to the prompt cache (cache creation). */
  cacheWriteTokens?: number;
}

export interface ComputedCost {
  /** Raw provider cost in USD. */
  costUsd: number;
  /** Credits to debit: costUsd × margin. */
  chargedCredits: number;
}

const PRICING: Record<string, ModelPricing> = {
  // ── Anthropic (Claude) ──
  // Standard, first-party Claude API pricing. Do not use the 50%-discounted
  // Message Batches rates here: Ringee calls messages.stream/create.
  "claude-fable-5": {
    inputPerMTok: 10,
    outputPerMTok: 50,
    cacheWritePerMTok: 12.5,
    cacheReadPerMTok: 1,
  },
  "claude-opus-4-8": {
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheWritePerMTok: 6.25,
    cacheReadPerMTok: 0.5,
  },
  "claude-opus-4-7": {
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheWritePerMTok: 6.25,
    cacheReadPerMTok: 0.5,
  },
  "claude-sonnet-5": {
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheWritePerMTok: 3.75,
    cacheReadPerMTok: 0.3,
  },
  "claude-sonnet-4-6": {
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheWritePerMTok: 3.75,
    cacheReadPerMTok: 0.3,
  },
  "claude-haiku-4-5": {
    inputPerMTok: 1,
    outputPerMTok: 5,
    cacheWritePerMTok: 1.25,
    cacheReadPerMTok: 0.1,
  },
  // ── OpenAI (GPT) ──
  "gpt-5.6-sol": {
    inputPerMTok: 5,
    outputPerMTok: 30,
    cacheWritePerMTok: 6.25,
    cacheReadPerMTok: 0.5,
  },
  // The gpt-5.6 alias routes to GPT-5.6 Sol.
  "gpt-5.6": {
    inputPerMTok: 5,
    outputPerMTok: 30,
    cacheWritePerMTok: 6.25,
    cacheReadPerMTok: 0.5,
  },
  "gpt-5.6-terra": {
    inputPerMTok: 2.5,
    outputPerMTok: 15,
    cacheWritePerMTok: 3.125,
    cacheReadPerMTok: 0.25,
  },
  "gpt-5.6-luna": {
    inputPerMTok: 1,
    outputPerMTok: 6,
    cacheWritePerMTok: 1.25,
    cacheReadPerMTok: 0.1,
  },
  // Retained for deployments that explicitly pin the previous generation.
  "gpt-5.5": {
    inputPerMTok: 5.0,
    outputPerMTok: 30.0,
    cacheWritePerMTok: 0,
    cacheReadPerMTok: 0.5,
  },
  "gpt-5.4-mini": {
    inputPerMTok: 0.75,
    outputPerMTok: 4.5,
    cacheWritePerMTok: 0,
    cacheReadPerMTok: 0.075,
  },
  "gpt-5.4": {
    inputPerMTok: 2.5,
    outputPerMTok: 15.0,
    cacheWritePerMTok: 0,
    cacheReadPerMTok: 0.25,
  },
};

// Longest first so a family alias never shadows a more specific model id.
const KEYS_BY_SPECIFICITY = Object.keys(PRICING).sort(
  (a, b) => b.length - a.length,
);

/** Resolve a pricing row for a model id, or null if it's not in the table. */
export function resolveModelPricing(
  model?: string | null,
): ModelPricing | null {
  if (!model) return null;
  const id = model.toLowerCase().trim();
  if (PRICING[id]) return PRICING[id];
  for (const key of KEYS_BY_SPECIFICITY) {
    if (id.startsWith(key) || id.includes(key)) return PRICING[key];
  }
  return null;
}

/** True when we have a price for this model and can bill it. */
export function isModelPriced(model?: string | null): boolean {
  return resolveModelPricing(model) !== null;
}

/**
 * Compute the cost of a single model turn. Returns zero cost for unknown
 * models so an unpriced model never blocks the user (the caller should log
 * a warning instead).
 */
export function computeTokenCost(
  model: string | undefined | null,
  usage: UsageCounts,
  margin = 1,
): ComputedCost {
  const pricing = resolveModelPricing(model);
  if (!pricing) return { costUsd: 0, chargedCredits: 0 };

  const input = Math.max(0, usage.inputTokens ?? 0);
  const output = Math.max(0, usage.outputTokens ?? 0);
  const cacheRead = Math.max(0, usage.cachedInputTokens ?? 0);
  const cacheWrite = Math.max(0, usage.cacheWriteTokens ?? 0);

  const costUsd =
    (input * pricing.inputPerMTok +
      output * pricing.outputPerMTok +
      cacheRead * pricing.cacheReadPerMTok +
      cacheWrite * pricing.cacheWritePerMTok) /
    1_000_000;

  const safeMargin = margin > 0 ? margin : 1;
  return { costUsd, chargedCredits: costUsd * safeMargin };
}
