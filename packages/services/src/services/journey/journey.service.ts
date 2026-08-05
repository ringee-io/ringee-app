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
  JourneyNodeDto,
  JourneyOverviewDto,
  JourneyRequirementDto,
  JourneyRewardStatus,
  JourneyReviewItemDto,
  JourneyTrackDto,
} from "./journey.types";
import {
  JourneyEvaluation,
  JourneyNodeState,
  evaluateJourney,
  newlyAchievedNodes,
  newlyCompletedTracks,
} from "./journey.evaluator";
import {
  findNode,
  getJourneyProgram,
  journeyNodes,
  programTotalCents,
  JourneyProgramDef,
} from "./program/journey.program";
import { JourneyWorkspaceType } from "./program/journey.workspace";
import { toJourneyMetrics, JourneyMetrics } from "./program/journey.metrics";
import {
  JOURNEY_CAPABILITY_IDS,
  countUsedCapabilities,
  usedCapabilities,
} from "./program/journey.capabilities";
import {
  JourneyLegacyNodeCredit,
  projectLegacyCredit,
} from "./program/journey.legacy";
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
 *    to one member would produce a different, wrong graph.
 * 2. **The backend is the only source of truth.** Requirements, progress,
 *    dependency verdicts, track completion, Journey completion, the
 *    recommendation, reward status, risk and amount are all decided here and
 *    shipped as data.
 * 3. **Reads are cheap, claims are exact.** The overview may be served from a
 *    short cache; the claim path always recomputes from the database.
 * 4. **v2 money is never paid twice.** Legacy achievements and claims are read
 *    through `projectLegacyCredit` and never mutated.
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
   * Writing achievements on a read is deliberate: it is the only way a node
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

    const state = await this.resolveState(ctx, program, workspaceType, metrics);

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
      ...state.achievedIds,
    ]);

    const nodes = state.evaluation.nodes.map((node) =>
      this.toNodeDto(
        node,
        state.achievedIds,
        state.achievedAt,
        state.legacy,
        claims,
        rewardsBlocked,
        celebrated,
      ),
    );

    const tracks: JourneyTrackDto[] = state.evaluation.tracks.map((track) => ({
      id: track.id,
      order: track.order,
      mode: track.mode,
      complete: track.complete,
      satisfied: track.satisfied,
      needed: track.needed,
      nodeIds: track.nodeIds,
      achievedNodes: track.achievedNodes,
      totalNodes: track.totalNodes,
    }));

    await this.announceTrackCompletions(
      ctx,
      program,
      workspaceType,
      state.evaluation,
    );

    this.track("journey_viewed", ctx, {
      workspaceType,
      programVersion: program.version,
      nodeId: state.evaluation.recommendedNodeId ?? undefined,
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
      tracks,
      nodes,
      completion: state.evaluation.completion,
      recommendedNodeId: state.evaluation.recommendedNodeId,
      recommendedRequirement: state.evaluation.recommendedRequirement
        ? this.toRequirementDto(state.evaluation.recommendedRequirement)
        : null,
      capabilities: JOURNEY_CAPABILITY_IDS.map((id) => ({
        id,
        used: usedCapabilities(metrics).includes(id),
      })),
      metrics: { ...metrics },
      totals: this.totals(nodes, program, workspaceType),
      balance: credit?.amount ?? 0,
    };
  }

  /**
   * The shared read path for the overview and the claim path.
   *
   * Both need exactly the same thing — legacy credit, the evaluation, the
   * persisted achievement set — and they must agree, or the page would offer a
   * button the claim endpoint then refuses.
   */
  private async resolveState(
    ctx: OwnershipContext,
    program: JourneyProgramDef,
    workspaceType: JourneyWorkspaceType,
    metrics: JourneyMetrics,
  ): Promise<{
    evaluation: JourneyEvaluation;
    achievedIds: Set<string>;
    achievedAt: Map<string, Date>;
    legacy: JourneyLegacyNodeCredit;
  }> {
    const [persisted, legacyAchievements, legacyClaims] = await Promise.all([
      this.achievements.list(ctx, program.version),
      this.achievements.listLegacy(ctx, program.version),
      this.rewards.listClaims(ctx),
    ]);

    const legacy = projectLegacyCredit(
      legacyAchievements,
      legacyClaims,
      program.version,
    );

    // Nodes credited by the v2 ladder count as achieved for unlocking purposes,
    // but they are NOT persisted as v3 achievements — the legacy row already is
    // the record, and re-recording it would misdate history.
    const achievedIds = new Set([
      ...persisted.map((a) => a.stageId),
      ...legacy.achievedAt.keys(),
    ]);

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
      new Set(persisted.map((a) => a.stageId)),
    );

    const achievedAt = new Map<string, Date>(legacy.achievedAt);
    for (const record of persisted) {
      achievedAt.set(record.stageId, record.achievedAt);
    }
    for (const nodeId of created) {
      if (!achievedAt.has(nodeId)) achievedAt.set(nodeId, new Date());
      achievedIds.add(nodeId);
    }

    return { evaluation, achievedIds, achievedAt, legacy };
  }

  // ── Claiming ───────────────────────────────────────────────────────────────

  /**
   * Redeems one node reward.
   *
   * Nothing sent by the client is trusted beyond the node id, and even that is
   * only used to look up a node in the server-side program. Amount, status,
   * dependencies, risk and progress are all re-derived here.
   */
  async claimReward(
    ctx: OwnershipContext,
    nodeId: string,
    userId: string,
  ): Promise<JourneyClaimResultDto> {
    const rateLimit = await this.budget.checkRateLimit(ctx, userId);
    if (!rateLimit.allowed) {
      return this.rateLimitedResult(ctx, nodeId, rateLimit.retryAfterSeconds);
    }
    return this.settleNode(ctx, nodeId, userId);
  }

  /**
   * Redeems every eligible node, server-side.
   *
   * Exists so the client never loops the single-claim endpoint. Three things
   * make this correct rather than merely convenient:
   *
   * - **the rate limit is charged once**, for the whole batch. Charging per
   *   node would let a workspace with more claimable nodes than
   *   `JOURNEY_CLAIM_MAX_PER_USER` cut itself off partway through;
   * - **metrics are evaluated once**, so every node in the batch is judged
   *   against the same snapshot;
   * - **each node still gets its own idempotency key, its own risk decision and
   *   its own transaction**, so one failure cannot double-pay or leave a hole.
   */
  async claimAll(
    ctx: OwnershipContext,
    userId: string,
  ): Promise<JourneyClaimAllResultDto> {
    const rateLimit = await this.budget.checkBatchRateLimit(ctx, userId);
    if (!rateLimit.allowed) {
      return {
        results: [],
        claimedCents: 0,
        balance: await this.balance(ctx),
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      };
    }

    if (!apiConfiguration.JOURNEY_V2_ENABLED) {
      return { results: [], claimedCents: 0, balance: await this.balance(ctx) };
    }

    const program = getJourneyProgram(apiConfiguration.JOURNEY_PROGRAM_VERSION);
    const workspaceType = this.workspaceType(ctx);

    // One evaluation for the whole batch: every node is judged against the same
    // snapshot, and the achievements it implies are persisted once.
    const options = await this.metricOptions(ctx);
    const metrics = this.toMetrics(
      await this.journeyRepo.getMetrics(ctx, options),
    );
    const state = await this.resolveState(ctx, program, workspaceType, metrics);

    const results: JourneyClaimResultDto[] = [];
    let claimedCents = 0;

    // Dependency order, so a partial failure leaves a prefix claimed rather
    // than a hole in the middle.
    const eligible = [...state.evaluation.nodes]
      .filter((node) => node.rewardCents > 0)
      .filter((node) => state.achievedIds.has(node.id))
      .filter((node) => !state.legacy.alreadyPaid.has(node.id))
      .filter((node) => !state.legacy.rewardCoveredByLegacy.has(node.id))
      .sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));

    for (const node of eligible) {
      const result = await this.settleNode(ctx, node.id, userId, {
        program,
        workspaceType,
        options,
        metrics,
        state,
      });
      results.push(result);
      if (result.outcome === "claimed") claimedCents += result.amountCents;
    }

    return { results, claimedCents, balance: await this.balance(ctx) };
  }

  /**
   * The settlement path for one node.
   *
   * `precomputed` lets `claimAll` reuse one metric snapshot across the batch.
   * When it is absent — the single-claim endpoint — everything is read fresh,
   * because a claim must never be decided from the cached overview.
   */
  private async settleNode(
    ctx: OwnershipContext,
    nodeId: string,
    userId: string,
    precomputed?: {
      program: JourneyProgramDef;
      workspaceType: JourneyWorkspaceType;
      options: JourneyMetricsOptions;
      metrics: JourneyMetrics;
      state: Awaited<ReturnType<JourneyService["resolveState"]>>;
    },
  ): Promise<JourneyClaimResultDto> {
    if (!apiConfiguration.JOURNEY_V2_ENABLED) {
      return this.unavailable(nodeId, 0, "journey.program_paused");
    }

    const program =
      precomputed?.program ??
      getJourneyProgram(apiConfiguration.JOURNEY_PROGRAM_VERSION);
    const workspaceType = precomputed?.workspaceType ?? this.workspaceType(ctx);

    const nodeDef = findNode(program, nodeId);
    const visible =
      nodeDef && nodeDef.appliesTo.includes(workspaceType)
        ? nodeDef
        : undefined;

    if (!visible) {
      throw new BadRequestException("Unknown node for this workspace.");
    }

    const amountCents = visible.rewardCents[workspaceType];
    if (amountCents <= 0) {
      throw new BadRequestException("This node does not carry a reward.");
    }

    const rollout = this.resolveRolloutFor(ctx, userId);
    if (rollout.holdout) {
      return this.unavailable(
        nodeId,
        amountCents,
        "journey.rewards_unavailable",
      );
    }

    const options = precomputed?.options ?? (await this.metricOptions(ctx));
    const metrics =
      precomputed?.metrics ??
      this.toMetrics(await this.journeyRepo.getMetrics(ctx, options));
    const state =
      precomputed?.state ??
      (await this.resolveState(ctx, program, workspaceType, metrics));

    // Money already paid under a previous program version is never paid again,
    // whether this node was the direct reward target or a sibling covered by
    // the same legacy settlement.
    const legacyPayment =
      state.legacy.alreadyPaid.get(nodeId) ??
      state.legacy.rewardCoveredByLegacy.get(nodeId);
    if (legacyPayment) {
      return {
        outcome: "already_claimed",
        nodeId,
        amountCents,
        currency: "USD",
        balance: await this.balance(ctx),
        messageCode: "journey.already_claimed_legacy",
        claimedAt: legacyPayment.claimedAt?.toISOString() ?? null,
      };
    }

    // Re-read rather than trust the in-memory set: this is the authorisation
    // check, and the database (plus the legacy lens) is the only thing that can
    // prove the node was earned.
    const persisted = await this.achievements.has(ctx, program.version, nodeId);
    const earned = persisted || state.legacy.achievedAt.has(nodeId);

    // Every dependency must be achieved too. This is what stops a crafted
    // request from claiming a node deep in the graph.
    const dependenciesMet = visible.dependsOn.every(
      (dependency) =>
        !journeyNodes(program, workspaceType).some(
          (n) => n.id === dependency,
        ) || state.achievedIds.has(dependency),
    );

    if (!earned || !dependenciesMet) {
      await this.risk.recordLockedStageAttempt(ctx);
      this.track("journey_reward_claim_clicked", ctx, {
        workspaceType,
        programVersion: program.version,
        nodeId,
        status: "not_eligible",
      });
      return {
        outcome: "not_eligible",
        nodeId,
        amountCents,
        currency: "USD",
        balance: await this.balance(ctx),
        messageCode: "journey.not_eligible",
        claimedAt: null,
      };
    }

    const budget = await this.budget.checkBudget(ctx, amountCents);
    if (!budget.allowed) {
      this.logger.warn(
        `Journey claim blocked workspace=${this.workspaceKey(ctx)} node=${nodeId} block=${budget.block}`,
      );
      return this.unavailable(
        nodeId,
        amountCents,
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

    const nodeState = state.evaluation.nodes.find((n) => n.id === nodeId);
    const eligibilitySnapshot = {
      programVersion: program.version,
      ruleHash: journeyRuleHash(program, workspaceType),
      track: visible.track,
      dependsOn: visible.dependsOn,
      requirements:
        nodeState?.requirements.map((r) => ({
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
        stageId: nodeId,
        amountCents,
        claimedByUserId: userId,
        idempotencyKey: this.idempotencyKey(ctx, program.version, nodeId),
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
          nodeId,
          riskBand: verdict.band,
        });
      }
      return {
        outcome: "rejected",
        nodeId,
        amountCents,
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
      stageId: nodeId,
      amountCents,
      claimedByUserId: userId,
      idempotencyKey: this.idempotencyKey(ctx, program.version, nodeId),
      riskScore: verdict.score,
      riskBand: verdict.band,
      riskReasons: verdict.reasons,
      riskVersion: verdict.version,
      eligibilitySnapshot,
      settleNow,
    });

    if (outcome.settled) {
      // After the commit, never inside it.
      await this.budget.recordSpend(amountCents);
      await this.invalidate(ctx);
      this.track("journey_reward_claimed", ctx, {
        workspaceType,
        programVersion: program.version,
        nodeId,
        riskBand: verdict.band,
        rewardAmountCents: amountCents,
      });
    } else if (!outcome.duplicate) {
      this.track("journey_reward_pending_review", ctx, {
        workspaceType,
        programVersion: program.version,
        nodeId,
        riskBand: verdict.band,
        rewardAmountCents: amountCents,
      });
    }

    return this.claimResult(outcome.claim, outcome.balance, outcome.duplicate);
  }

  // ── Celebration and client events ──────────────────────────────────────────

  /**
   * Marks a node celebration as shown so the animation never replays.
   *
   * Persisted in Redis rather than on the client: `localStorage` would replay
   * the confetti on every new device, which is exactly the kind of thing that
   * makes a product feel like a slot machine.
   */
  async markCelebrated(ctx: OwnershipContext, nodeId: string): Promise<void> {
    const program = apiConfiguration.JOURNEY_PROGRAM_VERSION;
    await this.redis.set(
      `ringee:journey:celebrated:${this.workspaceKey(ctx)}:${program}:${nodeId}`,
      1,
      365 * 24 * 60 * 60 * 1000,
    );
    await this.invalidate(ctx);
    this.track("journey_node_celebrated", ctx, {
      programVersion: program,
      nodeId,
    });
  }

  /**
   * The events only the browser can witness: landing on the page with intent,
   * clicking the recommended action, and opening a node.
   *
   * The client sends a name and at most a node id — every other property is
   * attached here from server-side context, so a crafted request cannot poison
   * the funnel. The node id is validated against the program before it is
   * recorded.
   */
  async recordClientEvent(
    ctx: OwnershipContext,
    userId: string,
    name:
      | "journey_started"
      | "journey_next_action_clicked"
      | "journey_node_viewed",
    nodeId?: string,
  ): Promise<void> {
    const rollout = this.resolveRolloutFor(ctx, userId);
    const workspaceType = this.workspaceType(ctx);
    const program = getJourneyProgram(apiConfiguration.JOURNEY_PROGRAM_VERSION);

    const node = nodeId ? findNode(program, nodeId) : undefined;
    const validNodeId =
      node && node.appliesTo.includes(workspaceType) ? node.id : undefined;

    this.track(name, ctx, {
      workspaceType,
      programVersion: program.version,
      experimentCohort: String(rollout.bucket),
      holdout: rollout.holdout,
      productSurface: "dashboard",
      nodeId: validNodeId,
      trackId: node?.track,
    });
  }

  /**
   * Emits `journey_track_completed` once per track, and `journey_completed`
   * once per workspace.
   *
   * The "already announced" set lives in Redis rather than being derived from
   * the evaluation, because completion is not a database row — without it the
   * event would fire on every page load for the rest of the workspace's life.
   */
  private async announceTrackCompletions(
    ctx: OwnershipContext,
    program: JourneyProgramDef,
    workspaceType: JourneyWorkspaceType,
    evaluation: JourneyEvaluation,
  ): Promise<void> {
    const prefix = `ringee:journey:track-done:${this.workspaceKey(ctx)}:${program.version}`;

    const announced = await Promise.all(
      evaluation.tracks.map((track) =>
        this.redis
          .has(`${prefix}:${track.id}`)
          // An unreachable Redis resolves to "already announced": a missed
          // analytics event is better than a duplicated one.
          .catch(() => true),
      ),
    );

    const alreadyAnnounced = new Set(
      evaluation.tracks
        .filter((_, index) => announced[index])
        .map((track) => track.id),
    );

    for (const track of newlyCompletedTracks(evaluation, alreadyAnnounced)) {
      await this.redis
        .set(`${prefix}:${track.id}`, 1, 365 * 24 * 60 * 60 * 1000)
        .catch(() => undefined);
      this.track("journey_track_completed", ctx, {
        workspaceType,
        programVersion: program.version,
        trackId: track.id,
        trackMode: track.mode,
      });
    }

    if (evaluation.completion.complete) {
      const key = `${prefix}:__journey__`;
      const seen = await this.redis.has(key).catch(() => true);
      if (!seen) {
        await this.redis
          .set(key, 1, 365 * 24 * 60 * 60 * 1000)
          .catch(() => undefined);
        this.track("journey_completed", ctx, {
          workspaceType,
          programVersion: program.version,
          electiveTracksCompleted: evaluation.completion.electiveComplete,
          completionPath: evaluation.tracks
            .filter((t) => t.complete)
            .map((t) => t.id)
            .join(","),
        });
      }
    }
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
    const pending = newlyAchievedNodes(evaluation, alreadyAchieved);
    if (!pending.length) return [];

    const ruleHash = journeyRuleHash(program, workspaceType);
    const created = await this.achievements.recordMany(
      ctx,
      pending.map((node) => ({
        stageId: node.id,
        programVersion: program.version,
        ruleVersion: program.version,
        ruleHash,
        eligibilitySnapshot: {
          track: node.track,
          dependsOn: node.dependsOn,
          requirements: node.requirements.map((r) => ({
            id: r.id,
            target: r.target,
            current: r.current,
            done: r.done,
          })),
        },
        metricsSnapshot: metrics,
      })),
    );

    for (const nodeId of created) {
      this.track("journey_node_achieved", ctx, {
        workspaceType,
        programVersion: program.version,
        nodeId,
      });
    }

    return created;
  }

  private toNodeDto(
    node: JourneyNodeState,
    achievedIds: ReadonlySet<string>,
    achievedAt: ReadonlyMap<string, Date>,
    legacy: JourneyLegacyNodeCredit,
    claims: JourneyRewardClaimRecord[],
    rewardsBlockedReason: string | null,
    celebrated: ReadonlySet<string>,
  ): JourneyNodeDto {
    const claim = claims.find((c) => c.stageId === node.id);
    const earned = achievedIds.has(node.id);
    const legacyPayment =
      legacy.alreadyPaid.get(node.id) ??
      legacy.rewardCoveredByLegacy.get(node.id);

    let rewardStatus: JourneyRewardStatus = "locked";
    // Legacy wins over everything: money that already moved cannot move again,
    // and showing a claimable button here would produce a guaranteed failure.
    if (legacyPayment) rewardStatus = "legacy_claimed";
    else if (claim?.status === "claimed") rewardStatus = "claimed";
    else if (claim?.status === "pending_review")
      rewardStatus = "pending_review";
    else if (claim?.status === "rejected") rewardStatus = "rejected";
    else if (earned) {
      rewardStatus = rewardsBlockedReason ? "unavailable" : "claimable";
    }

    return {
      id: node.id,
      track: node.track,
      status: node.status,
      optional: node.optional,
      depth: node.depth,
      requirements: node.requirements.map((r) => this.toRequirementDto(r)),
      completed: node.completed,
      total: node.total,
      progressPct: node.progressPct,
      dependsOn: node.dependsOn,
      unlocks: node.unlocks,
      blockedBy: node.blockedBy,
      reward:
        node.rewardCents > 0
          ? {
              amountCents: node.rewardCents,
              currency: "USD",
              status: rewardStatus,
              claimedAt:
                legacyPayment?.claimedAt?.toISOString() ??
                claim?.claimedAt?.toISOString() ??
                null,
              ...(legacyPayment
                ? { legacyProgramVersion: legacyPayment.legacyProgramVersion }
                : {}),
            }
          : null,
      achievedAt: achievedAt.get(node.id)?.toISOString() ?? null,
      // Earned but never celebrated. A failed Redis read resolves to "already
      // celebrated", so the worst case is a missed animation rather than
      // confetti on every visit.
      celebrationPending: earned && !celebrated.has(node.id),
    };
  }

  /**
   * Which achieved nodes have already had their moment.
   *
   * Server-side rather than `localStorage` so the celebration does not replay
   * on every new device — the difference between a product that acknowledges
   * progress and one that feels like a slot machine.
   */
  private async readCelebrated(
    ctx: OwnershipContext,
    programVersion: string,
    nodeIds: string[],
  ): Promise<Set<string>> {
    if (!nodeIds.length) return new Set();
    const prefix = `ringee:journey:celebrated:${this.workspaceKey(ctx)}:${programVersion}`;
    const flags = await Promise.all(
      nodeIds.map((nodeId) =>
        this.redis
          .has(`${prefix}:${nodeId}`)
          // Treat an unreachable Redis as "already celebrated".
          .catch(() => true),
      ),
    );
    return new Set(nodeIds.filter((_, index) => flags[index]));
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
    nodes: JourneyNodeDto[],
    program: JourneyProgramDef,
    workspaceType: JourneyWorkspaceType,
  ): JourneyOverviewDto["totals"] {
    const sum = (predicate: (n: JourneyNodeDto) => boolean) =>
      nodes
        .filter((n) => n.reward && predicate(n))
        .reduce((total, n) => total + (n.reward?.amountCents ?? 0), 0);

    return {
      earnedCents: sum((n) => n.status === "achieved"),
      claimableCents: sum((n) => n.reward?.status === "claimable"),
      claimedCents: sum((n) => n.reward?.status === "claimed"),
      pendingReviewCents: sum((n) => n.reward?.status === "pending_review"),
      legacyClaimedCents: sum((n) => n.reward?.status === "legacy_claimed"),
      possibleCents: programTotalCents(program, workspaceType),
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

  private async rateLimitedResult(
    ctx: OwnershipContext,
    nodeId: string,
    retryAfterSeconds?: number,
  ): Promise<JourneyClaimResultDto> {
    return {
      outcome: "rate_limited",
      nodeId,
      amountCents: 0,
      currency: "USD",
      balance: await this.balance(ctx),
      messageCode: "journey.rate_limited",
      claimedAt: null,
      retryAfterSeconds,
    };
  }

  private claimResult(
    claim: JourneyRewardClaimRecord,
    balance: number,
    duplicate: boolean,
  ): JourneyClaimResultDto {
    const base = {
      nodeId: claim.stageId,
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
    nodeId: string,
    amountCents: number,
    messageCode: string,
  ): JourneyClaimResultDto {
    return {
      outcome: "unavailable",
      nodeId,
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
   * version and node id. Nothing the client sends can influence it, which is
   * what makes "the same reward" mean the same thing to a retry, a second tab
   * and a second admin.
   */
  private idempotencyKey(
    ctx: OwnershipContext,
    programVersion: string,
    nodeId: string,
  ): string {
    return `journey:${this.workspaceKey(ctx)}:${programVersion}:${nodeId}`;
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
