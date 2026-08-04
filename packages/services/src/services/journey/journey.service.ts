import { Injectable } from "@nestjs/common";
import {
  JourneyRepository,
  JourneyProviderRef,
  JourneySnapshot,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import {
  JourneyIntegrationBaseDto,
  JourneyOverviewDto,
} from "./journey.types";

/** Rolling measurement window. Fixed on purpose: the journey is a stable read on
 * the operation, not a filterable analytics view. */
const WINDOW_DAYS = 30;

/** Statuses that mean an integration is actually usable right now. */
const LIVE_STATUSES = new Set(["active"]);

@Injectable()
export class JourneyService {
  constructor(private readonly journeyRepo: JourneyRepository) {}

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

    return {
      scope: hasOrg ? "organization" : "personal",
      campaignsAvailable: hasOrg,
      scopedToMember: Boolean(memberUserId),
      window: { start: start.toISOString(), end: end.toISOString(), days: WINDOW_DAYS },
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
        ...this.summarize(customCrm.integrations, (ref) => ref.label ?? "Custom"),
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
