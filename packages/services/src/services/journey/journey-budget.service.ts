import { Injectable, Logger } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { JourneyRewardRepository } from "@ringee/database";
import { OwnershipContext, RedisService } from "@ringee/platform";

/**
 * Spend control for the Journey: rate limits, budgets and the circuit breaker.
 *
 * These are three different jobs and are kept apart on purpose:
 *
 * - **Rate limits** stop a client hammering the endpoint. Redis counters,
 *   same shape as `StripeAbuseProtectionService`.
 * - **Budgets** stop the *program* from spending more than it is allowed to,
 *   whoever is asking. Redis counters for speed, reconciled against the claim
 *   table so a Redis flush cannot reopen the tap.
 * - **The circuit breaker** (`JOURNEY_REWARDS_ENABLED=false`) stops everything
 *   instantly without touching data.
 */

const KEY_PREFIX = "ringee:journey";

export type JourneyBudgetBlock =
  | "rewards_disabled"
  | "daily_budget"
  | "monthly_budget"
  | "workspace_cap"
  | "rate_limited";

export interface JourneyBudgetDecision {
  allowed: boolean;
  block?: JourneyBudgetBlock;
  /** Seconds until a rate-limited caller may retry. */
  retryAfterSeconds?: number;
}

@Injectable()
export class JourneyBudgetService {
  private readonly logger = new Logger(JourneyBudgetService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly rewards: JourneyRewardRepository,
  ) {}

  /**
   * Per-user and per-workspace claim velocity.
   *
   * Both counters are incremented on every attempt — including ones that go on
   * to fail — so probing for a locked node is itself throttled.
   *
   * This is the *endpoint* rate limit: one call, one unit of budget. A batch
   * redeem must not spend one unit per node, or a workspace with more claimable
   * nodes than `JOURNEY_CLAIM_MAX_PER_USER` could never redeem them all — see
   * `checkBatchRateLimit`.
   */
  async checkRateLimit(
    ctx: OwnershipContext,
    userId: string,
  ): Promise<JourneyBudgetDecision> {
    const window = apiConfiguration.JOURNEY_CLAIM_RATE_WINDOW_SECONDS;
    const workspaceKey = this.workspaceKey(ctx);

    const [userCount, workspaceCount] = await Promise.all([
      this.redis.incrementWithExpiry(`${KEY_PREFIX}:rl:user:${userId}`, window),
      this.redis.incrementWithExpiry(
        `${KEY_PREFIX}:rl:ws:${workspaceKey}`,
        window,
      ),
    ]);

    const exceeded =
      userCount > apiConfiguration.JOURNEY_CLAIM_MAX_PER_USER ||
      workspaceCount > apiConfiguration.JOURNEY_CLAIM_MAX_PER_WORKSPACE;

    if (!exceeded) return { allowed: true };

    return this.rateLimited(workspaceKey, userId);
  }

  /**
   * The rate limit for "redeem everything", checked exactly once.
   *
   * A batch is one user action and costs one unit however many nodes it
   * settles. The v3 graph has up to 25 rewarded nodes against a default limit
   * of 10 claims per window, so charging per node would make a legitimate
   * "Redeem all" cut itself off partway through and leave money stranded.
   *
   * Safety is unaffected: the batch still re-derives eligibility per node,
   * still risk-scores per node, and still writes one idempotency key per node.
   * The budget and the workspace cap — not this counter — are what bound the
   * money.
   */
  async checkBatchRateLimit(
    ctx: OwnershipContext,
    userId: string,
  ): Promise<JourneyBudgetDecision> {
    const window = apiConfiguration.JOURNEY_CLAIM_RATE_WINDOW_SECONDS;
    const workspaceKey = this.workspaceKey(ctx);

    // Batches get their own counters so a burst of them is still throttled,
    // without a batch and a single claim cannibalising each other's budget.
    const [userCount, workspaceCount] = await Promise.all([
      this.redis.incrementWithExpiry(
        `${KEY_PREFIX}:rl:batch:user:${userId}`,
        window,
      ),
      this.redis.incrementWithExpiry(
        `${KEY_PREFIX}:rl:batch:ws:${workspaceKey}`,
        window,
      ),
    ]);

    const exceeded =
      userCount > apiConfiguration.JOURNEY_CLAIM_MAX_PER_USER ||
      workspaceCount > apiConfiguration.JOURNEY_CLAIM_MAX_PER_WORKSPACE;

    if (!exceeded) return { allowed: true };

    return this.rateLimited(workspaceKey, userId, "batch:");
  }

  private async rateLimited(
    workspaceKey: string,
    userId: string,
    scope = "",
  ): Promise<JourneyBudgetDecision> {
    const retryAfterSeconds = await this.redis.ttlSeconds(
      `${KEY_PREFIX}:rl:${scope}ws:${workspaceKey}`,
    );
    this.logger.warn(
      `Journey claim rate limited workspace=${workspaceKey} user=${userId} scope=${scope || "single"}`,
    );
    return {
      allowed: false,
      block: "rate_limited",
      retryAfterSeconds: Math.max(retryAfterSeconds, 1),
    };
  }

  /**
   * Whether the program can afford this reward right now.
   *
   * Checked before the claim is written, and the counters are only advanced
   * once the money actually moves (`recordSpend`) — a claim held for review
   * must not consume budget it may never spend.
   */
  async checkBudget(
    ctx: OwnershipContext,
    amountCents: number,
  ): Promise<JourneyBudgetDecision> {
    if (!apiConfiguration.JOURNEY_REWARDS_ENABLED) {
      return { allowed: false, block: "rewards_disabled" };
    }

    const granted = await this.rewards.totalGrantedCents(
      ctx,
      apiConfiguration.JOURNEY_PROGRAM_VERSION,
    );
    if (
      granted + amountCents >
      apiConfiguration.JOURNEY_MAX_TOTAL_CENTS_PER_WORKSPACE
    ) {
      this.logger.warn(
        `Journey workspace cap reached workspace=${this.workspaceKey(ctx)} granted=${granted}`,
      );
      return { allowed: false, block: "workspace_cap" };
    }

    const [daySpent, monthSpent] = await Promise.all([
      this.spent("day"),
      this.spent("month"),
    ]);

    if (
      apiConfiguration.JOURNEY_DAILY_BUDGET_CENTS > 0 &&
      daySpent + amountCents > apiConfiguration.JOURNEY_DAILY_BUDGET_CENTS
    ) {
      this.logger.warn(`Journey daily budget exhausted spent=${daySpent}`);
      return { allowed: false, block: "daily_budget" };
    }

    if (
      apiConfiguration.JOURNEY_MONTHLY_BUDGET_CENTS > 0 &&
      monthSpent + amountCents > apiConfiguration.JOURNEY_MONTHLY_BUDGET_CENTS
    ) {
      this.logger.warn(`Journey monthly budget exhausted spent=${monthSpent}`);
      return { allowed: false, block: "monthly_budget" };
    }

    return { allowed: true };
  }

  /** Advances the budget counters. Called only after a successful settlement. */
  async recordSpend(amountCents: number): Promise<void> {
    const now = new Date();
    await Promise.all([
      this.redis.incrementBy(
        `${KEY_PREFIX}:budget:day:${this.dayKey(now)}`,
        amountCents,
        2 * 24 * 60 * 60,
      ),
      this.redis.incrementBy(
        `${KEY_PREFIX}:budget:month:${this.monthKey(now)}`,
        amountCents,
        40 * 24 * 60 * 60,
      ),
    ]);
  }

  /** Remaining headroom, for the backoffice and for observability. */
  async remaining(): Promise<{ dayCents: number; monthCents: number }> {
    const [daySpent, monthSpent] = await Promise.all([
      this.spent("day"),
      this.spent("month"),
    ]);
    return {
      dayCents: Math.max(
        0,
        apiConfiguration.JOURNEY_DAILY_BUDGET_CENTS - daySpent,
      ),
      monthCents: Math.max(
        0,
        apiConfiguration.JOURNEY_MONTHLY_BUDGET_CENTS - monthSpent,
      ),
    };
  }

  /**
   * Spend so far in the current day or month.
   *
   * Redis is the fast path; when the counter is missing (cold start, flush,
   * eviction) the claim table is the authority and the counter is rebuilt.
   * Without this, losing Redis would silently reset the budget to zero.
   */
  private async spent(period: "day" | "month"): Promise<number> {
    const now = new Date();
    const key =
      period === "day"
        ? `${KEY_PREFIX}:budget:day:${this.dayKey(now)}`
        : `${KEY_PREFIX}:budget:month:${this.monthKey(now)}`;

    const cached = await this.redis.get<number>(key);
    if (typeof cached === "number" && Number.isFinite(cached)) return cached;

    const start =
      period === "day"
        ? new Date(
            Date.UTC(
              now.getUTCFullYear(),
              now.getUTCMonth(),
              now.getUTCDate(),
              0,
              0,
              0,
            ),
          )
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const actual = await this.rewards.grantedCentsBetween(start, now);
    // RedisService.set takes MILLISECONDS (PX), unlike incrementBy/ttlSeconds.
    await this.redis.set(
      key,
      actual,
      (period === "day" ? 2 * 24 * 60 * 60 : 40 * 24 * 60 * 60) * 1000,
    );
    return actual;
  }

  private workspaceKey(ctx: OwnershipContext): string {
    return ctx.organizationId
      ? `organization:${ctx.organizationId}`
      : `personal:${ctx.userId}`;
  }

  private dayKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private monthKey(date: Date): string {
    return date.toISOString().slice(0, 7);
  }
}
