import { BadRequestException, Injectable } from "@nestjs/common";
import {
  JourneyRepository,
  JourneyRewardRepository,
  JourneyRewardClaimRecord,
  JourneyProviderRef,
  JourneySnapshot,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import {
  JourneyClaimResultDto,
  JourneyIntegrationBaseDto,
  JourneyOverviewDto,
  JourneyOverviewFactsDto,
  JourneyRewardsDto,
} from "./journey.types";
import {
  JOURNEY_STAGE_REWARDS,
  JourneyStageId,
  classifyStage,
  journeyLadderFor,
} from "./journey-rewards";

/** Rolling measurement window. Fixed on purpose: the journey is a stable read on
 * the operation, not a filterable analytics view. */
const WINDOW_DAYS = 30;

/** Statuses that mean an integration is actually usable right now. */
const LIVE_STATUSES = new Set(["active"]);

@Injectable()
export class JourneyService {
  constructor(
    private readonly journeyRepo: JourneyRepository,
    private readonly rewardRepo: JourneyRewardRepository,
  ) {}

  /**
   * The workspace's journey snapshot over the last {@link WINDOW_DAYS} days.
   *
   * @param memberUserId when set (a plain org member), activity and outcome
   *        metrics are narrowed to that user — the workspace inventory
   *        (numbers, devices, integrations) stays workspace-wide, exactly like
   *        the Infra usage view.
   */
  async getOverview(
    ctx: OwnershipContext,
    memberUserId?: string,
  ): Promise<JourneyOverviewDto> {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - (WINDOW_DAYS - 1));
    start.setHours(0, 0, 0, 0);
    const previousStart = new Date(start);
    previousStart.setDate(previousStart.getDate() - WINDOW_DAYS);

    const snapshot = await this.journeyRepo.getSnapshot(
      ctx,
      { start, end, previousStart },
      memberUserId,
    );

    const hasOrg = Boolean(ctx.organizationId);

    const facts: JourneyOverviewFactsDto = {
      scope: hasOrg ? "organization" : "personal",
      campaignsAvailable: hasOrg,
      scopedToMember: Boolean(memberUserId),
      window: {
        start: start.toISOString(),
        end: end.toISOString(),
        days: WINDOW_DAYS,
      },
      foundation: snapshot.foundation,
      activity: this.mapActivity(snapshot.activity),
      outcomes: snapshot.outcomes,
      campaigns: snapshot.campaigns,
      intelligence: {
        recordingEnabled: snapshot.intelligence.recordAllCalls,
        transcriptionEnabled:
          snapshot.intelligence.transcribeRealtime ||
          snapshot.intelligence.transcribeRecordings,
        transcriptions: snapshot.intelligence.transcriptions,
        aiEnabled: snapshot.intelligence.aiPipelinesEnabled > 0,
        aiPipelinesEnabled: snapshot.intelligence.aiPipelinesEnabled,
      },
      integrations: this.mapIntegrations(snapshot.integrations),
    };

    const claims = await this.rewardRepo.listClaims(ctx);
    return { ...facts, rewards: this.buildRewards(facts, claims) };
  }

  /**
   * Redeems one stage reward into the workspace wallet.
   *
   * The stage is re-derived here from a fresh, workspace-wide snapshot — never
   * trusted from the client — and the repository's unique constraint makes the
   * payment idempotent, so a replayed request reports `claimed: false` instead
   * of paying twice. The route is admin-gated: freelancers redeem into their
   * own wallet, org admins into the organization's.
   */
  async claimReward(
    ctx: OwnershipContext,
    stageId: string,
    claimedByUserId: string,
  ): Promise<JourneyClaimResultDto> {
    const amount = JOURNEY_STAGE_REWARDS[stageId as JourneyStageId];
    const ladder = journeyLadderFor(
      ctx.organizationId ? "organization" : "personal",
    );
    if (!amount || !ladder.includes(stageId as JourneyStageId)) {
      throw new BadRequestException(
        "This stage has no reward on your journey.",
      );
    }

    const overview = await this.getOverview(ctx);
    const item = overview.rewards.items.find((r) => r.stageId === stageId);
    if (!item || item.status === "locked") {
      throw new BadRequestException(
        "This reward is not unlocked yet — reach the stage first.",
      );
    }

    // Idempotent either way: a stage already claimed (here or in a racing
    // request) leaves the balance untouched and reports `claimed: false`.
    const { claimed, balance } = await this.rewardRepo.claimOnce(ctx, {
      stageId,
      amount,
      claimedByUserId,
    });

    const items = overview.rewards.items.map((r) =>
      r.stageId === stageId
        ? {
            ...r,
            status: "claimed" as const,
            claimedAt: r.claimedAt ?? new Date().toISOString(),
          }
        : r,
    );
    const rewards: JourneyRewardsDto = {
      ...overview.rewards,
      items,
      claimableTotal: items
        .filter((r) => r.status === "claimable")
        .reduce((sum, r) => sum + r.amount, 0),
      claimedTotal: items
        .filter((r) => r.status === "claimed")
        .reduce((sum, r) => sum + r.amount, 0),
    };

    return { claimed, stageId, amount, balance, rewards };
  }

  /**
   * Reward states for every paying stage on this workspace's ladder. A stage
   * counts as reached when it sits at or below the classified stage — reaching
   * a higher rung unlocks any skipped rewards beneath it too.
   */
  private buildRewards(
    facts: JourneyOverviewFactsDto,
    claims: JourneyRewardClaimRecord[],
  ): JourneyRewardsDto {
    const ladder = journeyLadderFor(facts.scope);
    const stageId = classifyStage(facts);
    const reachedIndex = ladder.indexOf(stageId);

    const items = ladder
      .map((id, index) => ({ id, index, amount: JOURNEY_STAGE_REWARDS[id] }))
      .filter(
        (
          entry,
        ): entry is { id: JourneyStageId; index: number; amount: number } =>
          typeof entry.amount === "number",
      )
      .map(({ id, index, amount }) => {
        const claim = claims.find((c) => c.stageId === id);
        return {
          stageId: id,
          amount,
          status: claim
            ? ("claimed" as const)
            : index <= reachedIndex
              ? ("claimable" as const)
              : ("locked" as const),
          claimedAt: claim?.createdAt.toISOString() ?? null,
        };
      });

    return {
      currency: "USD",
      stageId,
      items,
      claimableTotal: items
        .filter((r) => r.status === "claimable")
        .reduce((sum, r) => sum + r.amount, 0),
      claimedTotal: items
        .filter((r) => r.status === "claimed")
        .reduce((sum, r) => sum + r.amount, 0),
      totalPossible: items.reduce((sum, r) => sum + r.amount, 0),
    };
  }

  private mapActivity(
    activity: JourneySnapshot["activity"],
  ): JourneyOverviewDto["activity"] {
    const { calls, connectedCalls, previousCalls } = activity;

    return {
      calls,
      connectedCalls,
      connectRate: calls > 0 ? Math.round((connectedCalls / calls) * 100) : 0,
      minutes: activity.minutes,
      previousCalls,
      // With no previous activity there is no meaningful percentage to show —
      // "+∞%" on the first month would be noise, not insight.
      callsTrendPct:
        previousCalls > 0
          ? Math.round(((calls - previousCalls) / previousCalls) * 100)
          : null,
      activeDays: activity.activeDays,
      activeCallers: activity.activeCallers,
      firstCallAt: activity.firstCallAt?.toISOString() ?? null,
      bySource: activity.bySource,
    };
  }

  private mapIntegrations(
    integrations: JourneySnapshot["integrations"],
  ): JourneyOverviewDto["integrations"] {
    const { crm, customCrm, calendar, enrichment, mcp } = integrations;

    return {
      crm: {
        ...this.summarize(crm.connections),
        syncedCalls: crm.syncedCalls,
      },
      customCrm: {
        ...this.summarize(
          customCrm.integrations,
          (ref) => ref.label ?? "Custom",
        ),
        inboundEvents: customCrm.inboundEvents,
        deliveries: customCrm.deliveries,
      },
      meetings: {
        ...this.summarize(calendar.integrations),
        syncedMeetings: calendar.syncedMeetings,
      },
      enrichment: {
        ...this.summarize(enrichment.connections),
        searches: enrichment.searches,
        enrichedContacts: enrichment.enrichedContacts,
      },
      mcp: {
        // MCP has no connection record — a workspace is "agent-connected" once
        // an agent has actually created a call session through it.
        connected: mcp.sessions > 0,
        count: mcp.sessions,
        providers: mcp.sessions > 0 ? ["mcp"] : [],
        lastActivityAt: null,
        sessions: mcp.sessions,
        sessionsInWindow: mcp.sessionsInWindow,
        callsInWindow: mcp.callsInWindow,
      },
    };
  }

  /** Collapses a list of provider records into the shared connected/count shape. */
  private summarize(
    refs: JourneyProviderRef[],
    label: (ref: JourneyProviderRef) => string = (ref) => ref.provider,
  ): JourneyIntegrationBaseDto {
    const live = refs.filter((ref) => LIVE_STATUSES.has(ref.status));
    const lastActivity = refs
      .map((ref) => ref.lastActivityAt)
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => b.getTime() - a.getTime())[0];

    return {
      connected: live.length > 0,
      count: live.length,
      providers: live.map(label),
      lastActivityAt: lastActivity?.toISOString() ?? null,
    };
  }
}
