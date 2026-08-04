import { Injectable } from "@nestjs/common";
import {
  Prisma,
  CallOutcome,
  CrmSyncStatus,
  CallSessionSource,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";

/**
 * Journey — the workspace maturity snapshot behind `/dashboard/journey`.
 *
 * This repository is read-only and deliberately *wide*: it gathers, in one
 * round-trip, every signal the journey model needs to place a workspace on its
 * growth path — what has been set up, how much calling actually happens, what
 * comes out of it, and which parts of the stack (CRM, custom CRM, calendar,
 * enrichment, MCP) are wired up. No classification happens here; this only
 * reports what is true in the database.
 */

/** A call counts as "connected" purely by its disposition — same rule the
 * dashboard uses: it has an outcome, and that outcome is not a machine/no-pickup
 * one. Telephony signals (`answeredAt`, `status`) are NOT consulted because
 * voicemail pickups and fake answer supervision stamp them too. */
const UNCONNECTED_OUTCOMES: CallOutcome[] = [
  CallOutcome.no_answer,
  CallOutcome.voicemail,
];

export interface JourneyRange {
  start: Date;
  end: Date;
  /** The equally-long window immediately before `start`, for trend deltas. */
  previousStart: Date;
}

export interface JourneyProviderRef {
  provider: string;
  status: string;
  label?: string | null;
  lastActivityAt?: Date | null;
}

export interface JourneySnapshot {
  foundation: {
    phoneNumbers: number;
    verifiedCallerIds: number;
    sipDevices: number;
    teamMembers: number;
    rotationPoolNumbers: number;
    contacts: number;
  };
  activity: {
    calls: number;
    connectedCalls: number;
    minutes: number;
    previousCalls: number;
    activeDays: number;
    activeCallers: number;
    firstCallAt: Date | null;
    bySource: Array<{ source: string; calls: number }>;
  };
  outcomes: {
    meetingsBooked: number;
    sales: number;
    interested: number;
    followUps: number;
    callbacksScheduled: number;
    meetingsCreated: number;
  };
  /** Null in a personal workspace — campaigns require an organization. */
  campaigns: {
    total: number;
    active: number;
    leads: number;
    callsFromCampaigns: number;
  } | null;
  intelligence: {
    recordAllCalls: boolean;
    transcribeRealtime: boolean;
    transcribeRecordings: boolean;
    transcriptions: number;
    aiPipelinesEnabled: number;
  };
  integrations: {
    crm: { connections: JourneyProviderRef[]; syncedCalls: number };
    customCrm: {
      integrations: JourneyProviderRef[];
      inboundEvents: number;
      deliveries: number;
    };
    calendar: { integrations: JourneyProviderRef[]; syncedMeetings: number };
    enrichment: {
      connections: JourneyProviderRef[];
      searches: number;
      enrichedContacts: number;
    };
    mcp: { sessions: number; sessionsInWindow: number; callsInWindow: number };
  };
}

@Injectable()
export class JourneyRepository {
  constructor(private prisma: PrismaService) {}

  /**
   * Everything the journey model reads, in one pass.
   *
   * @param ctx           the active workspace (organization or personal).
   * @param range         the measurement window (plus its preceding window).
   * @param memberUserId  when set, activity/outcome metrics are narrowed to a
   *                      single user — org members only ever see their own
   *                      numbers, mirroring `resolveMemberFilter`.
   */
  async getSnapshot(
    ctx: OwnershipContext,
    range: JourneyRange,
    memberUserId?: string,
  ): Promise<JourneySnapshot> {
    const owner = buildOwnershipFilter(ctx);
    const hasOrg = Boolean(ctx.organizationId);

    // Activity reads are additionally narrowed to one member when the caller is
    // a plain org member. In a personal workspace `owner` is already the user.
    const callWhere: Prisma.CallWhereInput = {
      ...owner,
      ...(memberUserId ? { userId: memberUserId } : {}),
    };
    const inWindow: Prisma.CallWhereInput = {
      ...callWhere,
      startedAt: { gte: range.start, lte: range.end },
    };

    const [
      foundation,
      activity,
      outcomes,
      campaigns,
      intelligence,
      integrations,
    ] = await Promise.all([
      this.getFoundation(ctx, owner, hasOrg),
      this.getActivity(ctx, callWhere, inWindow, range, memberUserId),
      this.getOutcomes(ctx, inWindow, range, memberUserId),
      hasOrg ? this.getCampaigns(owner, inWindow) : Promise.resolve(null),
      this.getIntelligence(owner, range),
      this.getIntegrations(ctx, owner, range),
    ]);

    return {
      foundation,
      activity,
      outcomes,
      campaigns,
      intelligence,
      integrations,
    };
  }

  // ── Foundation: what has been set up ───────────────────────────────────────

  private async getFoundation(
    ctx: OwnershipContext,
    owner: ReturnType<typeof buildOwnershipFilter>,
    hasOrg: boolean,
  ): Promise<JourneySnapshot["foundation"]> {
    const [
      phoneNumbers,
      verifiedCallerIds,
      sipDevices,
      teamMembers,
      rotationPoolNumbers,
      contacts,
    ] = await Promise.all([
      this.prisma.numberPurchased.count({
        where: { ...owner, kind: "purchased", deletedAt: null },
      }),
      this.prisma.numberPurchased.count({
        where: {
          ...owner,
          kind: "verified_caller_id",
          verified: true,
          deletedAt: null,
        },
      }),
      this.prisma.sipDevice.count({ where: owner }),
      hasOrg
        ? this.prisma.organizationMembership.count({
            where: { organizationId: ctx.organizationId as string },
          })
        : Promise.resolve(0),
      this.prisma.callerIdPoolMember.count({
        where: { ...owner, participating: true },
      }),
      this.prisma.contact.count({ where: { ...owner, deletedAt: null } }),
    ]);

    return {
      phoneNumbers,
      verifiedCallerIds,
      sipDevices,
      teamMembers,
      rotationPoolNumbers,
      contacts,
    };
  }

  // ── Activity: how much calling actually happens ────────────────────────────

  private async getActivity(
    ctx: OwnershipContext,
    callWhere: Prisma.CallWhereInput,
    inWindow: Prisma.CallWhereInput,
    range: JourneyRange,
    memberUserId?: string,
  ): Promise<JourneySnapshot["activity"]> {
    const [
      calls,
      connectedCalls,
      duration,
      previousCalls,
      callers,
      bySource,
      firstCall,
      activeDays,
    ] = await Promise.all([
      this.prisma.call.count({ where: inWindow }),
      this.prisma.call.count({
        where: { ...inWindow, outcome: { notIn: UNCONNECTED_OUTCOMES } },
      }),
      this.prisma.call.aggregate({
        where: inWindow,
        _sum: { durationSeconds: true },
      }),
      this.prisma.call.count({
        where: {
          ...callWhere,
          startedAt: { gte: range.previousStart, lt: range.start },
        },
      }),
      this.prisma.call.groupBy({ by: ["userId"], where: inWindow }),
      this.prisma.call.groupBy({
        by: ["source"],
        where: inWindow,
        _count: { _all: true },
      }),
      this.prisma.call.findFirst({
        where: { ...callWhere, startedAt: { not: null } },
        orderBy: { startedAt: "asc" },
        select: { startedAt: true },
      }),
      this.countActiveDays(ctx, range, memberUserId),
    ]);

    return {
      calls,
      connectedCalls,
      minutes: Math.round((duration._sum.durationSeconds ?? 0) / 60),
      previousCalls,
      activeDays,
      activeCallers: callers.filter((c) => c.userId).length,
      firstCallAt: firstCall?.startedAt ?? null,
      bySource: bySource
        .map((row) => ({
          // Legacy rows carry no source and are the plain web dialer.
          source: row.source ?? "web",
          calls: row._count._all,
        }))
        .sort((a, b) => b.calls - a.calls),
    };
  }

  /**
   * Distinct calendar days with at least one call — the honest read on whether
   * calling is a habit or a one-off burst. Prisma cannot express
   * `COUNT(DISTINCT date_trunc(...))`, so this one goes through raw SQL; the
   * result is cast to ::int to avoid a BigInt crossing the JSON boundary.
   */
  private async countActiveDays(
    ctx: OwnershipContext,
    range: JourneyRange,
    memberUserId?: string,
  ): Promise<number> {
    const ownerSql = ctx.organizationId
      ? Prisma.sql`c."organizationId" = ${ctx.organizationId}::uuid`
      : Prisma.sql`c."userId" = ${ctx.userId}::uuid AND c."organizationId" IS NULL`;
    const memberSql = memberUserId
      ? Prisma.sql`AND c."userId" = ${memberUserId}::uuid`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<{ days: number }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT date_trunc('day', c."startedAt"))::int AS days
      FROM "Call" c
      WHERE ${ownerSql} ${memberSql}
        AND c."startedAt" BETWEEN ${range.start} AND ${range.end}`);

    return Number(rows[0]?.days ?? 0);
  }

  // ── Outcomes: what the calling produces ────────────────────────────────────

  private async getOutcomes(
    ctx: OwnershipContext,
    inWindow: Prisma.CallWhereInput,
    range: JourneyRange,
    memberUserId?: string,
  ): Promise<JourneySnapshot["outcomes"]> {
    const owner = buildOwnershipFilter(ctx);
    const memberScope = memberUserId ? { userId: memberUserId } : {};

    const countOutcome = (outcome: CallOutcome) =>
      this.prisma.call.count({ where: { ...inWindow, outcome } });

    const [
      meetingsBooked,
      sales,
      interested,
      followUps,
      callbacksScheduled,
      meetingsCreated,
    ] = await Promise.all([
      countOutcome(CallOutcome.meeting_booked),
      countOutcome(CallOutcome.sale),
      countOutcome(CallOutcome.interested),
      countOutcome(CallOutcome.follow_up),
      this.prisma.callbackTask.count({
        where: {
          ...owner,
          ...memberScope,
          createdAt: { gte: range.start, lte: range.end },
        },
      }),
      this.prisma.meeting.count({
        where: {
          ...owner,
          ...memberScope,
          createdAt: { gte: range.start, lte: range.end },
        },
      }),
    ]);

    return {
      meetingsBooked,
      sales,
      interested,
      followUps,
      callbacksScheduled,
      meetingsCreated,
    };
  }

  // ── Campaigns: organization-only ───────────────────────────────────────────

  private async getCampaigns(
    owner: ReturnType<typeof buildOwnershipFilter>,
    inWindow: Prisma.CallWhereInput,
  ): Promise<NonNullable<JourneySnapshot["campaigns"]>> {
    const [total, active, leads, callsFromCampaigns] = await Promise.all([
      this.prisma.campaign.count({ where: owner }),
      this.prisma.campaign.count({
        where: { ...owner, status: { in: ["active", "running"] } },
      }),
      this.prisma.campaignLead.count({ where: { campaign: owner } }),
      this.prisma.call.count({
        where: { ...inWindow, callAttempts: { some: { campaign: owner } } },
      }),
    ]);

    return { total, active, leads, callsFromCampaigns };
  }

  // ── Intelligence: recording / transcription / AI ───────────────────────────

  private async getIntelligence(
    owner: ReturnType<typeof buildOwnershipFilter>,
    range: JourneyRange,
  ): Promise<JourneySnapshot["intelligence"]> {
    const [settings, transcriptions, aiPipelinesEnabled] = await Promise.all([
      this.prisma.callRecordingSettings.findFirst({ where: owner }),
      this.prisma.callTranscription.count({
        where: { ...owner, createdAt: { gte: range.start, lte: range.end } },
      }),
      this.prisma.aiPipelineActivation.count({
        where: { ...owner, enabled: true },
      }),
    ]);

    return {
      recordAllCalls: settings?.recordAllCalls ?? false,
      transcribeRealtime: settings?.transcribeRealtime ?? false,
      transcribeRecordings: settings?.transcribeRecordings ?? false,
      transcriptions,
      aiPipelinesEnabled,
    };
  }

  // ── Integrations: the connected stack ──────────────────────────────────────

  private async getIntegrations(
    ctx: OwnershipContext,
    owner: ReturnType<typeof buildOwnershipFilter>,
    range: JourneyRange,
  ): Promise<JourneySnapshot["integrations"]> {
    const window = { gte: range.start, lte: range.end };

    const [
      crmConnections,
      syncedCalls,
      customIntegrations,
      inboundEvents,
      deliveries,
      calendarIntegrations,
      syncedMeetings,
      enrichmentConnections,
      searches,
      enrichedContacts,
      mcpSessions,
      mcpSessionsInWindow,
      mcpCallsInWindow,
    ] = await Promise.all([
      this.prisma.crmConnection.findMany({
        where: owner,
        select: {
          provider: true,
          status: true,
          externalAccountName: true,
          lastSyncAt: true,
        },
      }),
      this.prisma.crmCallSync.count({
        where: {
          connection: owner,
          status: CrmSyncStatus.done,
          createdAt: window,
        },
      }),
      this.prisma.customIntegration.findMany({
        where: owner,
        select: { name: true, status: true, apiKeyLastUsedAt: true },
      }),
      this.prisma.customIntegrationInboundEvent.count({
        where: { integration: owner, receivedAt: window },
      }),
      this.prisma.customIntegrationDelivery.count({
        where: { integration: owner, createdAt: window },
      }),
      // Calendars resolve as "mine OR my organization's" — the same rule the
      // meeting scheduler uses to pick an integration.
      this.prisma.calendarIntegration.findMany({
        where: {
          isActive: true,
          OR: [
            { userId: ctx.userId },
            ...(ctx.organizationId
              ? [{ organizationId: ctx.organizationId }]
              : []),
          ],
        },
        select: { provider: true, email: true, isActive: true },
      }),
      // A meeting with an external event id was actually pushed to a calendar.
      this.prisma.meeting.count({
        where: { ...owner, externalEventId: { not: null }, createdAt: window },
      }),
      this.prisma.enrichmentConnection.findMany({
        where: owner,
        select: {
          provider: true,
          status: true,
          externalAccountName: true,
          lastUsedAt: true,
        },
      }),
      this.prisma.leadSearchJob.count({
        where: { ...owner, createdAt: window },
      }),
      this.prisma.enrichmentJob.count({
        where: { ...owner, createdAt: window },
      }),
      // MCP has no connection table of its own — an agent's fingerprint is the
      // call sessions it creates, so that is what we count.
      this.prisma.callSession.count({
        where: { ...owner, source: CallSessionSource.mcp, deletedAt: null },
      }),
      this.prisma.callSession.count({
        where: {
          ...owner,
          source: CallSessionSource.mcp,
          deletedAt: null,
          createdAt: window,
        },
      }),
      this.prisma.call.count({
        where: { ...owner, source: "session", startedAt: window },
      }),
    ]);

    return {
      crm: {
        connections: crmConnections.map((c) => ({
          provider: c.provider,
          status: c.status,
          label: c.externalAccountName,
          lastActivityAt: c.lastSyncAt,
        })),
        syncedCalls,
      },
      customCrm: {
        integrations: customIntegrations.map((c) => ({
          provider: "custom",
          status: c.status,
          label: c.name,
          lastActivityAt: c.apiKeyLastUsedAt,
        })),
        inboundEvents,
        deliveries,
      },
      calendar: {
        integrations: calendarIntegrations.map((c) => ({
          provider: c.provider,
          status: c.isActive ? "active" : "disabled",
          label: c.email,
          lastActivityAt: null,
        })),
        syncedMeetings,
      },
      enrichment: {
        connections: enrichmentConnections.map((c) => ({
          provider: c.provider,
          status: c.status,
          label: c.externalAccountName,
          lastActivityAt: c.lastUsedAt,
        })),
        searches,
        enrichedContacts,
      },
      mcp: {
        sessions: mcpSessions,
        sessionsInWindow: mcpSessionsInWindow,
        callsInWindow: mcpCallsInWindow,
      },
    };
  }
}
