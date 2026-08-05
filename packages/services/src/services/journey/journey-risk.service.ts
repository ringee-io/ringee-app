import { Injectable, Logger } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { JourneyRepository, JourneyMetricsOptions } from "@ringee/database";
import { OwnershipContext, RedisService } from "@ringee/platform";
import {
  JourneyRiskSnapshot,
  JourneyRiskVerdict,
  evaluateJourneyRisk,
  JOURNEY_RISK_VERSION,
} from "./journey.risk";

/**
 * Assembles the risk snapshot and scores it.
 *
 * The scoring itself is pure (`journey.risk.ts`); this class only gathers
 * facts. Keeping the split means the whole fraud model is unit-testable without
 * a database, and a stored `riskReasons` array can be replayed against a newer
 * rule version to audit an old decision.
 */
@Injectable()
export class JourneyRiskService {
  private readonly logger = new Logger(JourneyRiskService.name);

  constructor(
    private readonly journeyRepo: JourneyRepository,
    private readonly redis: RedisService,
  ) {}

  async assess(
    ctx: OwnershipContext,
    options: JourneyMetricsOptions,
    metrics: {
      attemptedCalls: number;
      connectedCalls: number;
      connectedMinutes: number;
    },
  ): Promise<JourneyRiskVerdict> {
    if (!apiConfiguration.JOURNEY_RISK_REVIEW_ENABLED) {
      // Local development only. Explicitly labelled so a claim settled this way
      // is never mistaken for one that passed real checks.
      return {
        score: 0,
        band: "low",
        reasons: [],
        version: `${JOURNEY_RISK_VERSION}-disabled`,
      };
    }

    const [facts, lockedStageAttempts24h, hasActivePaymentBlock] =
      await Promise.all([
        this.journeyRepo.getRiskFacts(ctx, options),
        this.readLockedStageProbes(ctx),
        this.hasActivePaymentBlock(ctx.userId),
      ]);

    const now = Date.now();
    const hours = (from: Date | null) =>
      from ? Math.max(0, (now - from.getTime()) / 3_600_000) : 0;

    const snapshot: JourneyRiskSnapshot = {
      accountAgeHours: hours(facts.userCreatedAt),
      // A personal workspace has no separate birthday; 0 means "same as the
      // account", which the rule reads as not-applicable.
      workspaceAgeHours: ctx.organizationId
        ? hours(facts.workspaceCreatedAt)
        : 0,
      emailVerified: facts.emailVerified,
      phoneVerified: facts.phoneVerified,
      userBlocked: facts.userBlocked,
      usersSharingPhone: facts.usersSharingPhone,
      workspacesSharingPaymentMethod: facts.workspacesSharingPaymentMethod,
      relatedRewardedWorkspaces: facts.relatedRewardedWorkspaces,
      workspacesCreatedLast7Days: facts.workspacesCreatedLast7Days,
      hoursSinceSignupAtClaim: hours(facts.userCreatedAt),
      attemptedCalls: metrics.attemptedCalls,
      failedCalls: facts.failedCalls,
      veryShortCalls: facts.veryShortCalls,
      connectedCalls: metrics.connectedCalls,
      topDestinationCalls: facts.topDestinationCalls,
      selfDialedCalls: facts.selfDialedCalls,
      connectedMinutes: metrics.connectedMinutes,
      premiumRateMinutes: facts.premiumRateMinutes,
      burstConcentration: facts.burstConcentration,
      lockedStageAttempts24h,
      hasActivePaymentBlock,
    };

    const verdict = evaluateJourneyRisk(snapshot, {
      minAccountAgeHours: apiConfiguration.JOURNEY_MIN_ACCOUNT_AGE_HOURS,
      maxRewardedWorkspacesPerUser:
        apiConfiguration.JOURNEY_MAX_REWARDED_WORKSPACES_PER_USER,
      mediumThreshold: apiConfiguration.JOURNEY_RISK_MEDIUM_THRESHOLD,
      highThreshold: apiConfiguration.JOURNEY_RISK_HIGH_THRESHOLD,
    });

    if (verdict.band !== "low") {
      // Reason codes only — never the underlying values, which are the PII.
      this.logger.warn(
        `Journey risk ${verdict.band} (${verdict.score}) workspace=${this.key(ctx)} reasons=${verdict.reasons.join(",")}`,
      );
    }

    return verdict;
  }

  /**
   * Records an attempt to claim a stage the workspace has not reached.
   *
   * Individually harmless — the API says no. Repeated, it is someone walking
   * the ladder looking for a hole, which is exactly what the
   * `locked_stage_probing` rule is for.
   */
  async recordLockedStageAttempt(ctx: OwnershipContext): Promise<void> {
    await this.redis.incrementWithExpiry(
      `ringee:journey:probe:${this.key(ctx)}`,
      24 * 60 * 60,
    );
  }

  private async readLockedStageProbes(ctx: OwnershipContext): Promise<number> {
    const value = await this.redis.get<number>(
      `ringee:journey:probe:${this.key(ctx)}`,
    );
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }

  /**
   * Whether the Stripe abuse protection currently holds a block for this user.
   * Reads the same key namespace that `StripeAbuseProtectionService` writes, so
   * a payment-abuse signal carries into the reward decision without coupling
   * the two services.
   */
  private async hasActivePaymentBlock(userId: string): Promise<boolean> {
    const ttl = await this.redis.ttlSeconds(
      `stripe-abuse:v1:blocked:user:${userId}`,
    );
    return ttl > 0;
  }

  private key(ctx: OwnershipContext): string {
    return ctx.organizationId
      ? `organization:${ctx.organizationId}`
      : `personal:${ctx.userId}`;
  }
}
