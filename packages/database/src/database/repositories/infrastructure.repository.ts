import { Injectable } from "@nestjs/common";
import {
  Prisma,
  InfrastructureResource,
  InfrastructureConnection,
  InfrastructureEvent,
  InfrastructureResourceType,
  InfrastructureConnectionType,
  InfrastructureConnectionStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";
import {
  OwnershipContext,
  buildOwnershipFilter,
  buildOwnershipData,
} from "@ringee/platform";

export interface NewResource {
  type: InfrastructureResourceType;
  referenceId: string | null;
  name: string;
  status: string;
  positionX: number;
  positionY: number;
  metadata?: Prisma.InputJsonValue;
}

export interface NewConnection {
  sourceResourceId: string;
  targetResourceId: string;
  type: InfrastructureConnectionType;
  status: InfrastructureConnectionStatus;
  metadata?: Prisma.InputJsonValue;
}

export interface NewEvent {
  resourceId?: string | null;
  connectionId?: string | null;
  type: string;
  message: string;
  actorUserId?: string | null;
  payload?: Prisma.InputJsonValue;
}

// ── Usage analytics ──────────────────────────────────────────────────────────

/** Resolved filters for the Usage view (range is always present). */
export interface UsageFilterInput {
  start: Date;
  end: Date;
  campaignId?: string | null;
  /** E.164 originating number (service resolves this from a NumberPurchased id). */
  fromNumber?: string | null;
  sipDeviceId?: string | null;
  memberId?: string | null;
}

/** A per-resource usage row (name resolved in SQL, except members). */
export interface UsageRow {
  id: string;
  name: string;
  calls: number;
  minutes: number;
  cost: number;
}

export interface UsageMemberRow {
  id: string;
  calls: number;
  minutes: number;
  cost: number;
}

export interface UsageSeriesRow {
  date: string;
  calls: number;
  minutes: number;
  cost: number;
}

export interface UsageAggregates {
  overview: {
    callsToday: number;
    callsThisWeek: number;
    minutesThisMonth: number;
    monthlyCost: number;
    activeCampaigns: number;
    activeNumbers: number;
    sipDevices: number;
    activeAgents: number;
  };
  performance: {
    totalCalls: number;
    callsConnected: number;
    avgDurationSec: number;
  };
  byCampaign: UsageRow[];
  byNumber: UsageRow[];
  byDevice: UsageRow[];
  byMember: UsageMemberRow[];
  series: UsageSeriesRow[];
}

/**
 * Data access for the Ringee Infra canvas overlay. Every query is scoped to the
 * active workspace via buildOwnershipFilter (organizationId when set, else the
 * personal userId scope).
 */
@Injectable()
export class InfrastructureRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Resources ─────────────────────────────────────────────────────────────

  listResources(ctx: OwnershipContext): Promise<InfrastructureResource[]> {
    return this.prisma.infrastructureResource.findMany({
      where: buildOwnershipFilter(ctx),
      orderBy: { createdAt: "asc" },
    });
  }

  findResourceById(
    ctx: OwnershipContext,
    id: string,
  ): Promise<InfrastructureResource | null> {
    return this.prisma.infrastructureResource.findFirst({
      where: { id, ...buildOwnershipFilter(ctx) },
    });
  }

  createManyResources(
    ctx: OwnershipContext,
    rows: NewResource[],
  ): Promise<Prisma.BatchPayload> {
    const owner = buildOwnershipData(ctx);
    return this.prisma.infrastructureResource.createMany({
      data: rows.map((r) => ({
        ...owner,
        type: r.type,
        referenceId: r.referenceId,
        name: r.name,
        status: r.status,
        positionX: r.positionX,
        positionY: r.positionY,
        metadata: r.metadata ?? {},
      })),
      skipDuplicates: true,
    });
  }

  createResource(
    ctx: OwnershipContext,
    row: NewResource,
  ): Promise<InfrastructureResource> {
    return this.prisma.infrastructureResource.create({
      data: {
        ...buildOwnershipData(ctx),
        type: row.type,
        referenceId: row.referenceId,
        name: row.name,
        status: row.status,
        positionX: row.positionX,
        positionY: row.positionY,
        metadata: row.metadata ?? {},
      },
    });
  }

  updatePosition(
    id: string,
    positionX: number,
    positionY: number,
  ): Promise<InfrastructureResource> {
    return this.prisma.infrastructureResource.update({
      where: { id },
      data: { positionX, positionY },
    });
  }

  updateResource(
    id: string,
    data: Prisma.InfrastructureResourceUpdateInput,
  ): Promise<InfrastructureResource> {
    return this.prisma.infrastructureResource.update({ where: { id }, data });
  }

  // ── Connections ─────────────────────────────────────────────────────────

  listConnections(ctx: OwnershipContext): Promise<InfrastructureConnection[]> {
    return this.prisma.infrastructureConnection.findMany({
      where: buildOwnershipFilter(ctx),
      orderBy: { createdAt: "asc" },
    });
  }

  findConnectionById(
    ctx: OwnershipContext,
    id: string,
  ): Promise<InfrastructureConnection | null> {
    return this.prisma.infrastructureConnection.findFirst({
      where: { id, ...buildOwnershipFilter(ctx) },
    });
  }

  async upsertConnection(
    ctx: OwnershipContext,
    row: NewConnection,
  ): Promise<InfrastructureConnection> {
    return this.prisma.infrastructureConnection.upsert({
      where: {
        sourceResourceId_targetResourceId_type: {
          sourceResourceId: row.sourceResourceId,
          targetResourceId: row.targetResourceId,
          type: row.type,
        },
      },
      update: { status: row.status, metadata: row.metadata ?? {} },
      create: {
        ...buildOwnershipData(ctx),
        sourceResourceId: row.sourceResourceId,
        targetResourceId: row.targetResourceId,
        type: row.type,
        status: row.status,
        metadata: row.metadata ?? {},
      },
    });
  }

  async deleteConnection(id: string): Promise<void> {
    await this.prisma.infrastructureConnection.delete({ where: { id } });
  }

  // ── Events ──────────────────────────────────────────────────────────────

  createEvent(
    ctx: OwnershipContext,
    row: NewEvent,
  ): Promise<InfrastructureEvent> {
    return this.prisma.infrastructureEvent.create({
      data: {
        ...buildOwnershipData(ctx),
        resourceId: row.resourceId ?? null,
        connectionId: row.connectionId ?? null,
        type: row.type,
        message: row.message,
        actorUserId: row.actorUserId ?? ctx.userId,
        payload: row.payload ?? Prisma.JsonNull,
      },
    });
  }

  listEvents(
    ctx: OwnershipContext,
    resourceId: string,
    limit = 50,
  ): Promise<InfrastructureEvent[]> {
    return this.prisma.infrastructureEvent.findMany({
      where: { ...buildOwnershipFilter(ctx), resourceId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  // ── Usage analytics ─────────────────────────────────────────────────────────

  /**
   * Aggregates the Usage view over the `Call` table, scoped to the active
   * workspace. Overview cards use fixed windows (today / this week / this
   * month); performance, cost and by-resource breakdowns honour the selected
   * range + filters. Every COUNT/SUM is cast so nothing returns a BigInt.
   */
  async getUsage(
    ctx: OwnershipContext,
    filters: UsageFilterInput,
  ): Promise<UsageAggregates> {
    // Owner predicate for the raw `Call c` queries (mirrors buildOwnershipFilter).
    const ownerSql = ctx.organizationId
      ? Prisma.sql`c."organizationId" = ${ctx.organizationId}::uuid`
      : Prisma.sql`c."userId" = ${ctx.userId}::uuid AND c."organizationId" IS NULL`;

    // Optional resource filters, combined into a single fragment.
    const parts: Prisma.Sql[] = [];
    if (filters.campaignId)
      parts.push(Prisma.sql`AND EXISTS (SELECT 1 FROM "CallAttempt" ca
        WHERE ca."callId" = c."id" AND ca."campaignId" = ${filters.campaignId}::uuid)`);
    if (filters.fromNumber)
      parts.push(Prisma.sql`AND c."fromNumber" = ${filters.fromNumber}`);
    if (filters.sipDeviceId)
      parts.push(
        Prisma.sql`AND c."sipDeviceId" = ${filters.sipDeviceId}::uuid`,
      );
    if (filters.memberId)
      parts.push(Prisma.sql`AND c."userId" = ${filters.memberId}::uuid`);
    const filterSql = parts.length ? Prisma.join(parts, " ") : Prisma.empty;

    const rangeSql = Prisma.sql`c."startedAt" BETWEEN ${filters.start} AND ${filters.end}`;
    const scopeSql = Prisma.sql`${ownerSql} AND ${rangeSql} ${filterSql}`;
    const answered = Prisma.sql`c."status" IN ('answered','recording','completed')`;

    // Fixed windows for the overview cards.
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 6);
    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );
    const ownerWhere = buildOwnershipFilter(ctx);

    const num = (v: unknown) => Number(v ?? 0);
    const mapRows = (
      rows: {
        id: string;
        name: string;
        calls: unknown;
        seconds: unknown;
        cost: unknown;
      }[],
    ): UsageRow[] =>
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        calls: num(r.calls),
        minutes: Math.round(num(r.seconds) / 60),
        cost: num(r.cost),
      }));

    const [
      perf,
      byNumberRaw,
      byDeviceRaw,
      byCampaignRaw,
      byMemberRaw,
      seriesRaw,
      callsToday,
      callsThisWeek,
      monthAgg,
      activeCampaigns,
      activeNumbers,
      sipDevices,
    ] = await Promise.all([
      this.prisma.$queryRaw<
        {
          total: number;
          connected: number;
          avg_sec: number | null;
          agents: number;
        }[]
      >(Prisma.sql`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE ${answered})::int AS connected,
               AVG(c."durationSeconds") FILTER (WHERE ${answered})::float8 AS avg_sec,
               COUNT(DISTINCT c."userId") FILTER (WHERE c."userId" IS NOT NULL)::int AS agents
        FROM "Call" c
        WHERE ${scopeSql}`),

      this.prisma.$queryRaw<
        {
          id: string;
          name: string;
          calls: number;
          seconds: number;
          cost: number;
        }[]
      >(Prisma.sql`
        SELECT np."id" AS id, np."phoneNumber" AS name,
               COUNT(*)::int AS calls,
               COALESCE(SUM(c."durationSeconds"),0)::int AS seconds,
               COALESCE(SUM(c."totalCost"),0)::float8 AS cost
        FROM "Call" c
        JOIN "NumberPurchased" np ON np."phoneNumber" = c."fromNumber"
        WHERE ${scopeSql}
        GROUP BY np."id", np."phoneNumber"
        ORDER BY cost DESC, calls DESC
        LIMIT 12`),

      this.prisma.$queryRaw<
        {
          id: string;
          name: string;
          calls: number;
          seconds: number;
          cost: number;
        }[]
      >(Prisma.sql`
        SELECT sd."id" AS id, sd."label" AS name,
               COUNT(*)::int AS calls,
               COALESCE(SUM(c."durationSeconds"),0)::int AS seconds,
               COALESCE(SUM(c."totalCost"),0)::float8 AS cost
        FROM "Call" c
        JOIN "SipDevice" sd ON sd."id" = c."sipDeviceId"
        WHERE ${scopeSql}
        GROUP BY sd."id", sd."label"
        ORDER BY calls DESC
        LIMIT 12`),

      this.prisma.$queryRaw<
        {
          id: string;
          name: string;
          calls: number;
          seconds: number;
          cost: number;
        }[]
      >(Prisma.sql`
        SELECT ca."campaignId" AS id, camp."name" AS name,
               COUNT(*)::int AS calls,
               COALESCE(SUM(c."durationSeconds"),0)::int AS seconds,
               COALESCE(SUM(c."totalCost"),0)::float8 AS cost
        FROM "Call" c
        JOIN (SELECT DISTINCT "callId","campaignId" FROM "CallAttempt") ca ON ca."callId" = c."id"
        JOIN "Campaign" camp ON camp."id" = ca."campaignId"
        WHERE ${scopeSql}
        GROUP BY ca."campaignId", camp."name"
        ORDER BY calls DESC
        LIMIT 12`),

      this.prisma.$queryRaw<
        { id: string; calls: number; seconds: number; cost: number }[]
      >(Prisma.sql`
        SELECT c."userId" AS id,
               COUNT(*)::int AS calls,
               COALESCE(SUM(c."durationSeconds"),0)::int AS seconds,
               COALESCE(SUM(c."totalCost"),0)::float8 AS cost
        FROM "Call" c
        WHERE ${scopeSql} AND c."userId" IS NOT NULL
        GROUP BY c."userId"
        ORDER BY calls DESC
        LIMIT 12`),

      this.prisma.$queryRaw<
        { date: string; calls: number; seconds: number; cost: number }[]
      >(Prisma.sql`
        SELECT to_char(date_trunc('day', c."startedAt"), 'YYYY-MM-DD') AS date,
               COUNT(*)::int AS calls,
               COALESCE(SUM(c."durationSeconds"),0)::int AS seconds,
               COALESCE(SUM(c."totalCost"),0)::float8 AS cost
        FROM "Call" c
        WHERE ${scopeSql}
        GROUP BY 1
        ORDER BY 1`),

      this.prisma.call.count({
        where: { ...ownerWhere, startedAt: { gte: todayStart } },
      }),
      this.prisma.call.count({
        where: { ...ownerWhere, startedAt: { gte: weekStart } },
      }),
      this.prisma.call.aggregate({
        where: { ...ownerWhere, startedAt: { gte: monthStart } },
        _sum: { durationSeconds: true, totalCost: true },
      }),
      this.prisma.campaign.count({
        where: { ...ownerWhere, status: { in: ["active", "running"] } },
      }),
      this.prisma.numberPurchased.count({
        where: { ...ownerWhere, kind: "purchased", deletedAt: null },
      }),
      this.prisma.sipDevice.count({ where: ownerWhere }),
    ]);

    const p = perf[0] ?? { total: 0, connected: 0, avg_sec: 0, agents: 0 };

    return {
      overview: {
        callsToday,
        callsThisWeek,
        minutesThisMonth: Math.round(num(monthAgg._sum.durationSeconds) / 60),
        monthlyCost: num(monthAgg._sum.totalCost),
        activeCampaigns,
        activeNumbers,
        sipDevices,
        activeAgents: num(p.agents),
      },
      performance: {
        totalCalls: num(p.total),
        callsConnected: num(p.connected),
        avgDurationSec: Math.round(num(p.avg_sec)),
      },
      byCampaign: mapRows(byCampaignRaw),
      byNumber: mapRows(byNumberRaw),
      byDevice: mapRows(byDeviceRaw),
      byMember: byMemberRaw.map((r) => ({
        id: r.id,
        calls: num(r.calls),
        minutes: Math.round(num(r.seconds) / 60),
        cost: num(r.cost),
      })),
      series: seriesRaw.map((r) => ({
        date: r.date,
        calls: num(r.calls),
        minutes: Math.round(num(r.seconds) / 60),
        cost: num(r.cost),
      })),
    };
  }

  // ── Journey signals ─────────────────────────────────────────────────────────

  /**
   * The workspace's recording / transcription / AI switches, plus how many
   * transcripts were actually produced in the last 30 days. Scoped to the active
   * workspace like every other read here. Volume (calls/minutes) is sourced from
   * {@link getUsage} at the service layer, so this only covers the signals that
   * live outside the Call table.
   */
  async getJourneySignals(ctx: OwnershipContext): Promise<{
    recordAllCalls: boolean;
    transcribeRealtime: boolean;
    transcribeRecordings: boolean;
    transcriptionsLast30d: number;
    aiEnabledCount: number;
  }> {
    const owner = buildOwnershipFilter(ctx);
    const since = new Date();
    since.setDate(since.getDate() - 29);
    since.setHours(0, 0, 0, 0);

    const [settings, transcriptionsLast30d, aiEnabledCount] = await Promise.all(
      [
        this.prisma.callRecordingSettings.findFirst({ where: owner }),
        this.prisma.callTranscription.count({
          where: { ...owner, createdAt: { gte: since } },
        }),
        this.prisma.aiPipelineActivation.count({
          where: { ...owner, enabled: true },
        }),
      ],
    );

    return {
      recordAllCalls: settings?.recordAllCalls ?? false,
      transcribeRealtime: settings?.transcribeRealtime ?? false,
      transcribeRecordings: settings?.transcribeRecordings ?? false,
      transcriptionsLast30d,
      aiEnabledCount,
    };
  }
}
