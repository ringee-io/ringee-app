import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  JourneyAchievementRepository,
  JourneyMetricsOptions,
  JourneyRawMetrics,
  JourneyRepository,
  JourneyRewardClaimRecord,
  JourneyRewardRepository,
  PrismaService,
} from "@ringee/database";
import { OwnershipContext, RedisService } from "@ringee/platform";
import {
  JourneyClaimAllResultDto,
  JourneyClaimResultDto,
  JourneyOverviewDto,
  JourneyRequirementDto,
  JourneyRewardStatus,
  JourneyReviewItemDto,
  JourneyStageDto,
} from "./journey.types";
import {
  JourneyEvaluation,
  JourneyStageState,
  evaluateJourney,
  newlyAchievedStages,
} from "./journey.evaluator";
import {
  getJourneyProgram,
  journeyLadder,
  ladderTotalCents,
  JourneyProgramDef,
  JourneyWorkspaceType,
} from "./program/journey.program";
import { toJourneyMetrics, JourneyMetrics } from "./program/journey.metrics";
import {
  JOURNEY_CAPABILITY_IDS,
  countUsedCapabilities,
  usedCapabilities,
} from "./program/journey.capabilities";
import { journeyRuleHash } from "./program/journey.hash";
import {
  hashIdentifier,
  resolveRollout,
  resolveWorkspaceTimezone,
} from "./journey.predicates";
import { JourneyRiskService } from "./journey-risk.service";
import { JourneyBudgetService } from "./journey-budget.service";
import {
  JourneyAnalyticsPort,
  JourneyEventProps,
} from "./journey-analytics.port";

/**
 * Ringee Journey — orchestration.
 *
 * Responsibilities, in order of importance:
 *
 * 1. **Authorisation is not this class's job** (the controller's guards own
 *    that), but *workspace scoping* is: every read here is workspace-wide and
 *    never member-scoped. The Journey describes the workspace, so narrowing it
 *    to one member would produce a different, wrong ladder.
 * 2. **The backend is the only source of truth.** Requirements, progress,
 *    eligibility, stage status, reward status, risk and amount are all decided
 *    here and shipped as data.
 * 3. **Reads are cheap, claims are exact.** The overview may be served from a
 *    short cache; the claim path always recomputes from the database.
 */
@Injectable()
export class JourneyService {
  private readonly logger = new Logger(JourneyService.name);

  constructor(
    private readonly journeyRepo: JourneyRepository,
    private readonly achievements: JourneyAchievementRepository,
    private readonly rewards: JourneyRewardRepository,
    private readonly risk: JourneyRiskService,
    private readonly budget: JourneyBudgetService,
    private readonly analytics: JourneyAnalyticsPort,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Overview ───────────────────────────────────────────────────────────────

  async getOverview(
    ctx: OwnershipContext,
    userId: string,
  ): Promise<JourneyOverviewDto> {
    const cacheKey = `ringee:journey:overview:${this.workspaceKey(ctx)}`;
    const ttlSeconds = apiConfiguration.JOURNEY_OVERVIEW_CACHE_SECONDS;

    if (ttlSeconds > 0) {
      const cached = await this.redis
        .get<JourneyOverviewDto>(cacheKey)
        .catch(() => undefined);
      if (cached) return cached;
    }

    const overview = await this.buildOverview(ctx, userId);

    if (ttlSeconds > 0) {
      // RedisService.set takes milliseconds.
      await this.redis
        .set(cacheKey, overview, ttlSeconds * 1000)
        .catch(() => undefined);
    }
    return overview;
  }

  /**
   * Recomputes everything from the database and persists any newly earned
   * achievements as a side effect.
   *
   * Writing achievements on a read is deliberate: it is the only way a stage
   * earned in March survives into a quiet April, and the unique constraint
   * makes it idempotent and concurrency-safe.
   */
  private async buildOverview(
    ctx: OwnershipContext,
    userId: string,
  ): Promise<JourneyOverviewDto> {
    const workspaceType = this.workspaceType(ctx);
    const program = getJourneyProgram(apiConfiguration.JOURNEY_PROGRAM_VERSION);
    const rollout = this.resolveRolloutFor(ctx, userId);

    const options = await this.metricOptions(ctx);
    const raw = await this.journeyRepo.getMetrics(ctx, options);
    const metrics = this.toMetrics(raw);

    const persisted = await this.achievements.list(ctx, program.version);
    const achievedIds = new Set(persisted.map((a) => a.stageId));

    const evaluation = evaluateJourney(
      program,
      workspaceType,
      metrics,
      achievedIds,
    );

    const created = await this.persistAchievements(
      ctx,
      program,
      workspaceType,
      evaluation,
      metrics,
      achievedIds,
    );

    const achievedAtByStage = new Map(
      persisted.map((a) => [a.stageId, a.achievedAt]),
    );
    for (const stageId of created) {
      if (!achievedAtByStage.has(stageId)) {
        achievedAtByStage.set(stageId, new Date());
        achievedIds.add(stageId);
      }
    }

    const [claims, credit] = await Promise.all([
      this.rewards.listClaims(ctx, program.version),
      this.prisma.credit.findFirst({
        where: ctx.organizationId
          ? { organizationId: ctx.organizationId }
          : { userId: ctx.userId, organizationId: null },
        select: { amount: true },
      }),
    ]);

    const rewardsBlocked = await this.rewardsBlockedReason(rollout.holdout);
    const celebrated = await this.readCelebrated(ctx, program.version, [
      ...achievedIds,
    ]);

    const stages = evaluation.stages.map((stage) =>
      this.toStageDto(
        stage,
        achievedIds,
        achievedAtByStage,
        claims,
        rewardsBlocked,
        celebrated,
      ),
    );

    const totals = this.totals(stages, program, workspaceType);

    this.track("journey_viewed", ctx, {
      workspaceType,
      programVersion: program.version,
      stageId: evaluation.currentStageId ?? undefined,
      experimentCohort: String(rollout.bucket),
      holdout: rollout.holdout,
      productSurface: "dashboard",
    });

    return {
      workspaceType,
      program: {
        version: program.version,
        active: apiConfiguration.JOURNEY_V2_ENABLED && rollout.enabled,
        rewardsAvailable: rewardsBlocked === null,
        rewardsBlockedReason: rewardsBlocked,
      },
      window: {
        start: options.start.toISOString(),
        end: options.end.toISOString(),
        days: Math.max(
          1,
          Math.round(
            (options.end.getTime() - options.start.getTime()) / 86_400_000,
          ),
        ),
        timeZone: options.timeZone,
      },
      stages,
      currentStageId: evaluation.currentStageId,
      nextRequirement: evaluation.nextRequirement
        ? this.toRequirementDto(evaluation.nextRequirement)
        : null,
      completed: evaluation.completed,
      capabilities: JOURNEY_CAPABILITY_IDS.map((id) => ({
        id,
        used: usedCapabilities(metrics).includes(id),
      })),
      metrics: { ...metrics },
      totals,
      balance: credit?.amount ?? 0,
    };
  }

  // ── Claiming ───────────────────────────────────────────────────────────────

  /**
   * Redeems one stage reward.
   *
   * Nothing sent by the client is trusted beyond the stage id, and even that is
   * only used to look up a stage in the server-side program. Amount, status,
   * risk and progress are all re-derived here.
   */
  async claimReward(
    ctx: OwnershipContext,
    stageId: string,
    userId: string,
  ): Promise<JourneyClaimResultDto> {
    if (!apiConfiguration.JOURNEY_V2_ENABLED) {
      return this.unavailable(stageId, 0, "journey.program_paused");
    }

    const rateLimit = await this.budget.checkRateLimit(ctx, userId);
    if (!rateLimit.allowed) {
      return {
        outcome: "rate_limited",
        stageId,
        amountCents: 0,
        currency: "USD",
        balance: await this.balance(ctx),
        messageCode: "journey.rate_limited",
        claimedAt: null,
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      };
    }

    const program = getJourneyProgram(apiConfiguration.JOURNEY_PROGRAM_VERSION);
    const workspaceType = this.workspaceType(ctx);
    const ladder = journeyLadder(program, workspaceType);
    const stageDef = ladder.find((s) => s.id === stageId);

    if (!stageDef) {
      throw new BadRequestException("Unknown stage for this workspace.");
    }
    if (stageDef.rewardCents <= 0) {
      throw new BadRequestException("This stage does not carry a reward.");
    }

    const rollout = this.resolveRolloutFor(ctx, userId);
    if (rollout.holdout) {
      return this.unavailable(
        stageId,
        stageDef.rewardCents,
        "journey.rewards_unavailable",
      );
    }

    // A fresh snapshot. The cached overview is never consulted on this path.
    const options = await this.metricOptions(ctx);
    const raw = await this.journeyRepo.getMetrics(ctx, options);
    const metrics = this.toMetrics(raw);

    const persisted = await this.achievements.list(ctx, program.version);
    const achievedIds = new Set(persisted.map((a) => a.stageId));
    const evaluation = evaluateJourney(
      program,
      workspaceType,
      metrics,
      achievedIds,
    );

    await this.persistAchievements(
      ctx,
      program,
      workspaceType,
      evaluation,
      metrics,
      achievedIds,
    );

    // Re-read rather than trust the in-memory set: this is the authorisation
    // check, and the database is the only thing that can prove the sequence.
    const hasStage = await this.achievements.has(ctx, program.version, stageId);
    const predecessor = ladder.find((s) => s.order === stageDef.order - 1);
    const hasPredecessor =
      !predecessor ||
      (await this.achievements.has(ctx, program.version, predecessor.id));

    if (!hasStage || !hasPredecessor) {
      await this.risk.recordLockedStageAttempt(ctx);
      this.track("journey_reward_claim_clicked", ctx, {
        workspaceType,
        programVersion: program.version,
        stageId,
        status: "not_eligible",
      });
      return {
        outcome: "not_eligible",
        stageId,
        amountCents: stageDef.rewardCents,
        currency: "USD",
        balance: await this.balance(ctx),
        messageCode: "journey.not_eligible",
        claimedAt: null,
      };
    }

    const budget = await this.budget.checkBudget(ctx, stageDef.rewardCents);
    if (!budget.allowed) {
      this.logger.warn(
        `Journey claim blocked workspace=${this.workspaceKey(ctx)} stage=${stageId} block=${budget.block}`,
      );
      return this.unavailable(
        stageId,
        stageDef.rewardCents,
        budget.block === "workspace_cap"
          ? "journey.workspace_cap_reached"
          : "journey.rewards_unavailable",
      );
    }

    const verdict = await this.risk.assess(ctx, options, {
      attemptedCalls: metrics.attemptedCalls,
      connectedCalls: metrics.connectedCalls,
      connectedMinutes: metrics.connectedMinutes,
    });

    const stageState = evaluation.stages.find((s) => s.id === stageId);
    const eligibilitySnapshot = {
      programVersion: program.version,
      ruleHash: journeyRuleHash(program, workspaceType),
      requirements:
        stageState?.requirements.map((r) => ({
          id: r.id,
          target: r.target,
          current: r.current,
          done: r.done,
        })) ?? [],
    };

    // High risk never pays. Medium risk waits for a human. Dry run and
    // manual-approval mode both route through pending_review so nothing is lost.
    if (verdict.band === "high") {
      const rejected = await this.rewards.claim(ctx, {
        programVersion: program.version,
        stageId,
        amountCents: stageDef.rewardCents,
        claimedByUserId: userId,
        idempotencyKey: this.idempotencyKey(ctx, program.version, stageId),
        riskScore: verdict.score,
        riskBand: verdict.band,
        riskReasons: verdict.reasons,
        riskVersion: verdict.version,
        eligibilitySnapshot,
        settleNow: false,
      });
      if (!rejected.duplicate) {
        await this.rewards.reject(
          rejected.claim.id,
          userId,
          "automatic_risk_high",
        );
        this.track("journey_reward_rejected", ctx, {
          workspaceType,
          programVersion: program.version,
          stageId,
          riskBand: verdict.band,
        });
      }
      return {
        outcome: "rejected",
        stageId,
        amountCents: stageDef.rewardCents,
        currency: "USD",
        balance: await this.balance(ctx),
        // Deliberately neutral: the user is not told they were flagged, and no
        // anti-fraud detail leaves the server.
        messageCode: "journey.needs_more_activity",
        claimedAt: null,
      };
    }

    const settleNow =
      verdict.band === "low" &&
      apiConfiguration.JOURNEY_AUTO_APPROVE_ENABLED &&
      !apiConfiguration.JOURNEY_DRY_RUN;

    const outcome = await this.rewards.claim(ctx, {
      programVersion: program.version,
      stageId,
      amountCents: stageDef.rewardCents,
      claimedByUserId: userId,
      idempotencyKey: this.idempotencyKey(ctx, program.version, stageId),
      riskScore: verdict.score,
      riskBand: verdict.band,
      riskReasons: verdict.reasons,
      riskVersion: verdict.version,
      eligibilitySnapshot,
      settleNow,
    });

    if (outcome.settled) {
      // After the commit, never inside it.
      await this.budget.recordSpend(stageDef.rewardCents);
      await this.invalidate(ctx);
      this.track("journey_reward_claimed", ctx, {
        workspaceType,
        programVersion: program.version,
        stageId,
        riskBand: verdict.band,
        rewardAmountCents: stageDef.rewardCents,
      });
    } else if (!outcome.duplicate) {
      this.track("journey_reward_pending_review", ctx, {
        workspaceType,
        programVersion: program.version,
        stageId,
        riskBand: verdict.band,
        rewardAmountCents: stageDef.rewardCents,
      });
    }

    return this.claimResult(outcome.claim, outcome.balance, outcome.duplicate);
  }

  /**
   * Claims every eligible stage, server-side.
   *
   * Exists so the client never loops the single-claim endpoint: each stage gets
   * its own idempotency key and its own risk decision, and one failure does not
   * abort the rest.
   */
  async claimAll(
    ctx: OwnershipContext,
    userId: string,
  ): Promise<JourneyClaimAllResultDto> {
    const program = getJourneyProgram(apiConfiguration.JOURNEY_PROGRAM_VERSION);
    const ladder = journeyLadder(program, this.workspaceType(ctx));

    const results: JourneyClaimResultDto[] = [];
    let claimedCents = 0;

    // Ladder order, so a partial failure leaves a prefix claimed rather than
    // a hole in the middle.
    for (const stage of ladder) {
      if (stage.rewardCents <= 0) continue;
      if (!(await this.achievements.has(ctx, program.version, stage.id))) {
        continue;
      }
      const result = await this.claimReward(ctx, stage.id, userId);
      results.push(result);
      if (result.outcome === "claimed") claimedCents += result.amountCents;
      if (result.outcome === "rate_limited") break;
    }

    return { results, claimedCents, balance: await this.balance(ctx) };
  }

  // ── Celebration bookkeeping ────────────────────────────────────────────────

  /**
   * Marks a stage celebration as shown so the animation never replays.
   *
   * Persisted in Redis rather than on the client: `localStorage` would replay
   * the confetti on every new device, which is exactly the kind of thing that
   * makes a product feel like a slot machine.
   */
  async markCelebrated(ctx: OwnershipContext, stageId: string): Promise<void> {
    const program = apiConfiguration.JOURNEY_PROGRAM_VERSION;
    await this.redis.set(
      `ringee:journey:celebrated:${this.workspaceKey(ctx)}:${program}:${stageId}`,
      1,
      365 * 24 * 60 * 60 * 1000,
    );
    await this.invalidate(ctx);
    this.track("journey_stage_celebrated", ctx, {
      programVersion: program,
      stageId,
    });
  }

  /**
   * The two events only the browser can witness: the user landing on the page
   * with intent, and clicking the recommended next action.
   *
   * The client sends a name and nothing else — every property is attached here
   * from server-side context, so a crafted request cannot poison the funnel.
   */
  async recordClientEvent(
    ctx: OwnershipContext,
    userId: string,
    name: "journey_started" | "journey_next_action_clicked",
  ): Promise<void> {
    const rollout = this.resolveRolloutFor(ctx, userId);
    this.track(name, ctx, {
      workspaceType: this.workspaceType(ctx),
      programVersion: apiConfiguration.JOURNEY_PROGRAM_VERSION,
      experimentCohort: String(rollout.bucket),
      holdout: rollout.holdout,
      productSurface: "dashboard",
    });
  }

  // ── Backoffice review ──────────────────────────────────────────────────────

  async listPendingReview(limit = 100): Promise<JourneyReviewItemDto[]> {
    const claims = await this.rewards.listPendingReview(limit);
    return claims.map((claim) => ({
      id: claim.id,
      workspaceType: claim.organizationId ? "organization" : "personal",
      workspaceId: claim.organizationId ?? claim.userId ?? "",
      programVersion: claim.programVersion,
      stageId: claim.stageId,
      amountCents: claim.amountCents,
      riskScore: claim.riskScore,
      riskBand: claim.riskBand,
      riskReasons: claim.riskReasons,
      claimedByUserId: claim.claimedByUserId,
      createdAt: claim.createdAt.toISOString(),
    }));
  }

  async approveClaim(
    claimId: string,
    reviewerUserId: string,
    note?: string,
  ): Promise<JourneyRewardClaimRecord> {
    const claim = await this.rewards.approve(claimId, reviewerUserId, note);
    if (!claim) {
      throw new BadRequestException("This claim is no longer awaiting review.");
    }
    await this.budget.recordSpend(claim.amountCents);
    await this.invalidate({
      userId: claim.userId ?? "",
      organizationId: claim.organizationId,
    });
    this.logger.log(
      `Journey claim approved id=${claimId} reviewer=${reviewerUserId} cents=${claim.amountCents}`,
    );
    return claim;
  }

  async rejectClaim(
    claimId: string,
    reviewerUserId: string,
    reason: string,
  ): Promise<JourneyRewardClaimRecord> {
    const claim = await this.rewards.reject(claimId, reviewerUserId, reason);
    if (!claim) {
      throw new BadRequestException("This claim is no longer awaiting review.");
    }
    this.logger.log(
      `Journey claim rejected id=${claimId} reviewer=${reviewerUserId}`,
    );
    return claim;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /**
   * The measurement window: the whole life of the workspace, capped at
   * `JOURNEY_WINDOW_DAYS`.
   *
   * Not a rolling 30 days like v1 — a rolling window makes achievements
   * evaporate. The cap keeps the aggregate queries bounded.
   */
  private async metricOptions(
    ctx: OwnershipContext,
  ): Promise<JourneyMetricsOptions> {
    const [rawTimezone, createdAt] = await Promise.all([
      this.journeyRepo.getWorkspaceTimezone(ctx),
      this.journeyRepo.getWorkspaceCreatedAt(ctx),
    ]);

    const end = new Date();
    const capped = new Date(
      end.getTime() - apiConfiguration.JOURNEY_WINDOW_DAYS * 86_400_000,
    );
    const start = createdAt && createdAt > capped ? createdAt : capped;

    return {
      start,
      end,
      timeZone: resolveWorkspaceTimezone(rawTimezone),
      minConnectedSeconds: apiConfiguration.JOURNEY_MIN_CONNECTED_SECONDS,
      meaningfulSeconds: apiConfiguration.JOURNEY_MEANINGFUL_SECONDS,
      campaignMinCalls: apiConfiguration.JOURNEY_CAMPAIGN_MIN_CALLS,
      testDestinations: apiConfiguration.JOURNEY_TEST_DESTINATIONS.split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    };
  }

  /** Raw repository counts → the evaluator's metric bag, with derived keys. */
  private toMetrics(raw: JourneyRawMetrics): JourneyMetrics {
    const base = toJourneyMetrics(raw);
    base.advancedCapabilitiesUsed = countUsedCapabilities(base);
    return base;
  }

  private async persistAchievements(
    ctx: OwnershipContext,
    program: JourneyProgramDef,
    workspaceType: JourneyWorkspaceType,
    evaluation: JourneyEvaluation,
    metrics: JourneyMetrics,
    alreadyAchieved: ReadonlySet<string>,
  ): Promise<string[]> {
    const pending = newlyAchievedStages(evaluation, alreadyAchieved);
    if (!pending.length) return [];

    const ruleHash = journeyRuleHash(program, workspaceType);
    const created = await this.achievements.recordMany(
      ctx,
      pending.map((stage) => ({
        stageId: stage.id,
        programVersion: program.version,
        ruleVersion: program.version,
        ruleHash,
        eligibilitySnapshot: {
          requirements: stage.requirements.map((r) => ({
            id: r.id,
            target: r.target,
            current: r.current,
            done: r.done,
          })),
        },
        metricsSnapshot: metrics,
      })),
    );

    for (const stageId of created) {
      this.track("journey_stage_achieved", ctx, {
        workspaceType,
        programVersion: program.version,
        stageId,
      });
    }
    if (created.length && evaluation.completed) {
      this.track("journey_completed", ctx, {
        workspaceType,
        programVersion: program.version,
      });
    }

    return created;
  }

  private toStageDto(
    stage: JourneyStageState,
    achievedIds: ReadonlySet<string>,
    achievedAt: Map<string, Date>,
    claims: JourneyRewardClaimRecord[],
    rewardsBlockedReason: string | null,
    celebrated: ReadonlySet<string>,
  ): JourneyStageDto {
    const claim = claims.find((c) => c.stageId === stage.id);
    const earned = achievedIds.has(stage.id);

    let rewardStatus: JourneyRewardStatus = "locked";
    if (claim?.status === "claimed") rewardStatus = "claimed";
    else if (claim?.status === "pending_review")
      rewardStatus = "pending_review";
    else if (claim?.status === "rejected") rewardStatus = "rejected";
    else if (earned) {
      rewardStatus = rewardsBlockedReason ? "unavailable" : "claimable";
    }

    return {
      id: stage.id,
      order: stage.order,
      status: stage.status,
      requirements: stage.requirements.map((r) => this.toRequirementDto(r)),
      completed: stage.completed,
      total: stage.total,
      progressPct: stage.progressPct,
      reward:
        stage.rewardCents > 0
          ? {
              amountCents: stage.rewardCents,
              currency: "USD",
              status: rewardStatus,
              claimedAt: claim?.claimedAt?.toISOString() ?? null,
            }
          : null,
      achievedAt: achievedAt.get(stage.id)?.toISOString() ?? null,
      // Earned but never celebrated. A failed Redis read resolves to "already
      // celebrated", so the worst case is a missed animation rather than
      // confetti on every visit.
      celebrationPending: earned && !celebrated.has(stage.id),
    };
  }

  /**
   * Which achieved stages have already had their moment.
   *
   * Server-side rather than `localStorage` so the celebration does not replay
   * on every new device — the difference between a product that acknowledges
   * progress and one that feels like a slot machine.
   */
  private async readCelebrated(
    ctx: OwnershipContext,
    programVersion: string,
    stageIds: string[],
  ): Promise<Set<string>> {
    if (!stageIds.length) return new Set();
    const prefix = `ringee:journey:celebrated:${this.workspaceKey(ctx)}:${programVersion}`;
    const flags = await Promise.all(
      stageIds.map((stageId) =>
        this.redis
          .has(`${prefix}:${stageId}`)
          // Treat an unreachable Redis as "already celebrated".
          .catch(() => true),
      ),
    );
    return new Set(stageIds.filter((_, index) => flags[index]));
  }

  private toRequirementDto(requirement: {
    id: string;
    metric: string;
    target: number;
    current: number;
    done: boolean;
    progressPct: number;
    actionKey: string;
  }): JourneyRequirementDto {
    return {
      id: requirement.id,
      metric: requirement.metric as JourneyRequirementDto["metric"],
      target: requirement.target,
      current: requirement.current,
      done: requirement.done,
      progressPct: requirement.progressPct,
      actionKey: requirement.actionKey,
    };
  }

  private totals(
    stages: JourneyStageDto[],
    program: JourneyProgramDef,
    workspaceType: JourneyWorkspaceType,
  ): JourneyOverviewDto["totals"] {
    const sum = (predicate: (s: JourneyStageDto) => boolean) =>
      stages
        .filter((s) => s.reward && predicate(s))
        .reduce((total, s) => total + (s.reward?.amountCents ?? 0), 0);

    return {
      earnedCents: sum((s) => s.status === "achieved"),
      claimableCents: sum((s) => s.reward?.status === "claimable"),
      claimedCents: sum((s) => s.reward?.status === "claimed"),
      pendingReviewCents: sum((s) => s.reward?.status === "pending_review"),
      possibleCents: ladderTotalCents(program, workspaceType),
      currency: "USD",
    };
  }

  /** Why rewards cannot be paid right now, as a stable code, or null. */
  private async rewardsBlockedReason(holdout: boolean): Promise<string | null> {
    if (!apiConfiguration.JOURNEY_REWARDS_ENABLED) return "disabled";
    if (holdout) return "holdout";
    if (apiConfiguration.JOURNEY_DRY_RUN) return "paused";
    const remaining = await this.budget.remaining().catch(() => null);
    if (remaining && remaining.dayCents <= 0) return "budget";
    return null;
  }

  private resolveRolloutFor(ctx: OwnershipContext, userId: string) {
    return resolveRollout({
      workspaceType: this.workspaceType(ctx),
      workspaceId: ctx.organizationId ?? ctx.userId,
      userId,
      rolloutPercent: apiConfiguration.JOURNEY_ROLLOUT_PERCENT,
      holdoutPercent: apiConfiguration.JOURNEY_HOLDOUT_PERCENT,
      internalUserIds: new Set(
        apiConfiguration.JOURNEY_INTERNAL_USER_IDS.split(",")
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    });
  }

  private claimResult(
    claim: JourneyRewardClaimRecord,
    balance: number,
    duplicate: boolean,
  ): JourneyClaimResultDto {
    const base = {
      stageId: claim.stageId,
      amountCents: claim.amountCents,
      currency: "USD" as const,
      balance,
      claimedAt: claim.claimedAt?.toISOString() ?? null,
    };

    switch (claim.status) {
      case "claimed":
        return {
          ...base,
          outcome: duplicate ? "already_claimed" : "claimed",
          messageCode: duplicate
            ? "journey.already_claimed"
            : "journey.claimed",
        };
      case "rejected":
        return {
          ...base,
          outcome: "rejected",
          messageCode: "journey.needs_more_activity",
        };
      default:
        return {
          ...base,
          outcome: "pending_review",
          messageCode: "journey.pending_review",
        };
    }
  }

  private unavailable(
    stageId: string,
    amountCents: number,
    messageCode: string,
  ): JourneyClaimResultDto {
    return {
      outcome: "unavailable",
      stageId,
      amountCents,
      currency: "USD",
      balance: 0,
      messageCode,
      claimedAt: null,
    };
  }

  private async balance(ctx: OwnershipContext): Promise<number> {
    const credit = await this.prisma.credit.findFirst({
      where: ctx.organizationId
        ? { organizationId: ctx.organizationId }
        : { userId: ctx.userId, organizationId: null },
      select: { amount: true },
    });
    return credit?.amount ?? 0;
  }

  private async invalidate(ctx: OwnershipContext): Promise<void> {
    await this.redis
      .del(`ringee:journey:overview:${this.workspaceKey(ctx)}`)
      .catch(() => undefined);
  }

  private workspaceType(ctx: OwnershipContext): JourneyWorkspaceType {
    return ctx.organizationId ? "organization" : "personal";
  }

  private workspaceKey(ctx: OwnershipContext): string {
    return ctx.organizationId
      ? `organization:${ctx.organizationId}`
      : `personal:${ctx.userId}`;
  }

  /**
   * The claim lock.
   *
   * Built only from server-side facts — workspace type, workspace id, program
   * version and stage id. Nothing the client sends can influence it, which is
   * what makes "the same reward" mean the same thing to a retry, a second tab
   * and a second admin.
   */
  private idempotencyKey(
    ctx: OwnershipContext,
    programVersion: string,
    stageId: string,
  ): string {
    return `journey:${this.workspaceKey(ctx)}:${programVersion}:${stageId}`;
  }

  private track(
    name: Parameters<JourneyAnalyticsPort["track"]>[0],
    ctx: OwnershipContext,
    props: JourneyEventProps,
  ): void {
    this.analytics.track(name, {
      ...props,
      // Correlatable across events, not reversible to a workspace.
      workspaceRef: hashIdentifier(this.workspaceKey(ctx)),
    });
  }
}
