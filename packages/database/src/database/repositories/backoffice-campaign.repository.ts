import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

/**
 * Cross-tenant campaign analytics for the internal super-admin (backoffice)
 * area. Like BackofficeRepository it deliberately ignores OwnershipContext —
 * access is gated by the SuperAdminGuard at the controller.
 *
 * Everything is measured off CallAttempt (the campaign dialer's unit of work)
 * joined to Call for money: Call.totalCost is the only place a campaign call's
 * cost lives — Call itself has no campaignId.
 */

/** Disposition codes that count as a conversion, mirroring OutboundAnalyticsRepository. */
const CONVERSION_CODES = ["meeting_booked", "sale"];

export type CampaignOwnerScope = "all" | "org" | "personal";

export interface BackofficeCampaignFilters {
  start: Date;
  end: Date;
  search?: string;
  status?: string;
  /** "all" | "none" (personal, no org) | an organization id */
  organizationId?: string;
  ownerScope?: CampaignOwnerScope;
  /** Only campaigns created inside the range. */
  onlyNew?: boolean;
  sort?: CampaignSortKey;
  skip: number;
  take: number;
}

export type CampaignSortKey =
  | "attempts"
  | "cost"
  | "connected"
  | "conversions"
  | "leads"
  | "created"
  | "lastActivity"
  | "name";

export interface CampaignMetrics {
  attempts: number;
  connected: number;
  conversions: number;
  uniqueLeadsDialed: number;
  talkSec: number;
  cost: number;
  contactRate: number;
  conversionRate: number;
  avgHandleTimeSec: number;
  costPerAttempt: number;
  costPerConnect: number;
  costPerConversion: number;
}

export interface BackofficeCampaignListItem extends CampaignMetrics {
  id: string;
  name: string;
  status: string;
  dialerMode: string;
  createdAt: Date;
  isNew: boolean;
  lastActivityAt: Date | null;
  totalLeads: number;
  pendingLeads: number;
  ownerUserId: string;
  ownerName: string;
  ownerEmail: string | null;
  organizationId: string | null;
  organizationName: string | null;
  organizationSlug: string | null;
}

export interface BackofficeCampaignListResult {
  items: BackofficeCampaignListItem[];
  total: number;
  /** Aggregate over every campaign matching the filters, not just this page. */
  totals: CampaignMetrics & {
    campaigns: number;
    newCampaigns: number;
    activeCampaigns: number;
    totalLeads: number;
  };
}

export interface CampaignOrganizationOption {
  id: string | null;
  name: string;
  campaigns: number;
}

export interface CampaignConfig {
  id: string;
  name: string;
  description: string | null;
  status: string;
  dialerMode: string;
  maxAttempts: number;
  timezone: string;
  workStartMin: number;
  workEndMin: number;
  workDays: number[];
  wrapUpTimeSec: number;
  retryDelayMin: number;
  createdAt: Date;
  updatedAt: Date;
  ownerUserId: string;
  ownerName: string;
  ownerEmail: string | null;
  organizationId: string | null;
  organizationName: string | null;
  organizationSlug: string | null;
  callerIdNumber: string | null;
  outboundNumber: string | null;
  rotationNumbers: string[];
}

export interface CampaignDailyPoint {
  day: string;
  attempts: number;
  connected: number;
  conversions: number;
  cost: number;
  talkSec: number;
}

export interface CampaignHourlyPoint {
  hour: number;
  attempts: number;
  connected: number;
  cost: number;
}

export interface CampaignDispositionRow {
  code: string;
  label: string | null;
  category: string | null;
  count: number;
  percentage: number;
}

export interface CampaignAgentRow {
  agentUserId: string;
  name: string;
  email: string | null;
  attempts: number;
  connected: number;
  conversions: number;
  talkSec: number;
  cost: number;
  contactRate: number;
  avgHandleTimeSec: number;
}

export interface CampaignLeadStatusRow {
  status: string;
  count: number;
}

export interface CampaignListRow {
  id: string;
  name: string;
  source: string | null;
  leads: number;
  createdAt: Date;
}

export interface CampaignMemberRow {
  userId: string;
  name: string;
  email: string | null;
  role: string;
  assignedAt: Date;
}

export interface CampaignAttemptRow {
  id: string;
  initiatedAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
  status: string;
  attemptNumber: number;
  durationSec: number | null;
  hangupCause: string | null;
  dispositionCode: string | null;
  cost: number | null;
  callId: string | null;
  agentUserId: string;
  agentName: string;
  contactName: string | null;
  contactPhone: string | null;
}

export interface CampaignAttemptsResult {
  items: CampaignAttemptRow[];
  total: number;
}

export interface CampaignRetryRuleRow {
  dispositionCategory: string;
  maxAttempts: number;
  delayMinutes: number;
  delayMultiplier: number;
}

function num(v: unknown): number {
  return typeof v === "bigint" ? Number(v) : Number(v ?? 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function rate(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function perUnit(total: number, units: number): number {
  if (!units) return 0;
  return Math.round((total / units) * 10000) / 10000;
}

/** Shared metric derivation so list rows, totals and the detail KPIs agree. */
function deriveMetrics(raw: {
  attempts: number;
  connected: number;
  conversions: number;
  uniqueLeadsDialed: number;
  talkSec: number;
  cost: number;
}): CampaignMetrics {
  return {
    ...raw,
    cost: round2(raw.cost),
    contactRate: rate(raw.connected, raw.attempts),
    conversionRate: rate(raw.conversions, raw.attempts),
    avgHandleTimeSec: raw.connected
      ? Math.round(raw.talkSec / raw.connected)
      : 0,
    costPerAttempt: perUnit(raw.cost, raw.attempts),
    costPerConnect: perUnit(raw.cost, raw.connected),
    costPerConversion: perUnit(raw.cost, raw.conversions),
  };
}

function fullName(u: {
  firstName: string | null;
  lastName: string | null;
}): string {
  return [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
}

const SORT_SQL: Record<CampaignSortKey, string> = {
  attempts: `attempts DESC, c."createdAt" DESC`,
  cost: `cost DESC, c."createdAt" DESC`,
  connected: `connected DESC, c."createdAt" DESC`,
  conversions: `conversions DESC, c."createdAt" DESC`,
  leads: `total_leads DESC, c."createdAt" DESC`,
  created: `c."createdAt" DESC`,
  lastActivity: `last_activity_at DESC NULLS LAST, c."createdAt" DESC`,
  name: `c.name ASC`,
};

@Injectable()
export class BackofficeCampaignRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Listing ────────────────────────────────────────────────

  /**
   * One raw query builds per-campaign metrics for the whole filtered set so the
   * list can be sorted by any metric (not just by page). Aggregation happens in
   * CTEs restricted to the date range; the campaign rows themselves are never
   * filtered by activity, so a campaign with zero calls in range still shows up
   * (with zeroes) — that absence is itself a signal worth seeing.
   */
  async listCampaigns(
    filters: BackofficeCampaignFilters,
  ): Promise<BackofficeCampaignListResult> {
    const { where, params } = this.buildWhere(filters);
    const sort = SORT_SQL[filters.sort ?? "attempts"];

    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;

    const rows = await this.prisma.$queryRawUnsafe<
      {
        id: string;
        name: string;
        status: string;
        dialer_mode: string;
        created_at: Date;
        is_new: boolean;
        owner_user_id: string;
        first_name: string | null;
        last_name: string | null;
        owner_email: string | null;
        organization_id: string | null;
        org_name: string | null;
        org_slug: string | null;
        attempts: bigint;
        connected: bigint;
        conversions: bigint;
        unique_leads: bigint;
        talk_sec: bigint;
        cost: number | null;
        last_activity_at: Date | null;
        total_leads: bigint;
        pending_leads: bigint;
      }[]
    >(
      `${this.statsCte()}
       SELECT
         c.id,
         c.name,
         c.status,
         c."dialerMode"::text        AS dialer_mode,
         c."createdAt"               AS created_at,
         (c."createdAt" BETWEEN $1 AND $2) AS is_new,
         c."userId"                  AS owner_user_id,
         u."firstName"               AS first_name,
         u."lastName"                AS last_name,
         em.email                    AS owner_email,
         c."organizationId"          AS organization_id,
         o.name                      AS org_name,
         o.slug                      AS org_slug,
         COALESCE(s.attempts, 0)     AS attempts,
         COALESCE(s.connected, 0)    AS connected,
         COALESCE(s.conversions, 0)  AS conversions,
         COALESCE(s.unique_leads, 0) AS unique_leads,
         COALESCE(s.talk_sec, 0)     AS talk_sec,
         COALESCE(s.cost, 0)         AS cost,
         s.last_activity_at          AS last_activity_at,
         COALESCE(l.total_leads, 0)  AS total_leads,
         COALESCE(l.pending_leads, 0) AS pending_leads
       FROM "Campaign" c
       LEFT JOIN "User" u          ON u.id = c."userId"
       LEFT JOIN LATERAL (
         SELECT e.email FROM "UserEmail" e
         WHERE e."userId" = c."userId"
         ORDER BY e."isPrimary" DESC, e."createdAt" ASC
         LIMIT 1
       ) em ON TRUE
       LEFT JOIN "Organization" o  ON o.id = c."organizationId"
       LEFT JOIN stats s           ON s.campaign_id = c.id
       LEFT JOIN leads l           ON l.campaign_id = c.id
       ${where}
       ORDER BY ${sort}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      ...params,
      filters.take,
      filters.skip,
    );

    const [totalsRow] = await this.prisma.$queryRawUnsafe<
      {
        campaigns: bigint;
        new_campaigns: bigint;
        active_campaigns: bigint;
        attempts: bigint;
        connected: bigint;
        conversions: bigint;
        unique_leads: bigint;
        talk_sec: bigint;
        cost: number | null;
        total_leads: bigint;
      }[]
    >(
      `${this.statsCte()}
       SELECT
         COUNT(*)                                            AS campaigns,
         COUNT(*) FILTER (WHERE c."createdAt" BETWEEN $1 AND $2) AS new_campaigns,
         COUNT(*) FILTER (WHERE c.status = 'active')         AS active_campaigns,
         COALESCE(SUM(s.attempts), 0)                        AS attempts,
         COALESCE(SUM(s.connected), 0)                       AS connected,
         COALESCE(SUM(s.conversions), 0)                     AS conversions,
         COALESCE(SUM(s.unique_leads), 0)                    AS unique_leads,
         COALESCE(SUM(s.talk_sec), 0)                        AS talk_sec,
         COALESCE(SUM(s.cost), 0)                            AS cost,
         COALESCE(SUM(l.total_leads), 0)                     AS total_leads
       FROM "Campaign" c
       LEFT JOIN "User" u          ON u.id = c."userId"
       LEFT JOIN LATERAL (
         SELECT e.email FROM "UserEmail" e
         WHERE e."userId" = c."userId"
         ORDER BY e."isPrimary" DESC, e."createdAt" ASC
         LIMIT 1
       ) em ON TRUE
       LEFT JOIN "Organization" o  ON o.id = c."organizationId"
       LEFT JOIN stats s           ON s.campaign_id = c.id
       LEFT JOIN leads l           ON l.campaign_id = c.id
       ${where}`,
      ...params,
    );

    const items: BackofficeCampaignListItem[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      dialerMode: r.dialer_mode,
      createdAt: r.created_at,
      isNew: !!r.is_new,
      lastActivityAt: r.last_activity_at,
      totalLeads: num(r.total_leads),
      pendingLeads: num(r.pending_leads),
      ownerUserId: r.owner_user_id,
      ownerName:
        fullName({ firstName: r.first_name, lastName: r.last_name }) ||
        r.owner_email ||
        r.owner_user_id,
      ownerEmail: r.owner_email,
      organizationId: r.organization_id,
      organizationName: r.org_name,
      organizationSlug: r.org_slug,
      ...deriveMetrics({
        attempts: num(r.attempts),
        connected: num(r.connected),
        conversions: num(r.conversions),
        uniqueLeadsDialed: num(r.unique_leads),
        talkSec: num(r.talk_sec),
        cost: num(r.cost),
      }),
    }));

    return {
      items,
      total: num(totalsRow?.campaigns),
      totals: {
        campaigns: num(totalsRow?.campaigns),
        newCampaigns: num(totalsRow?.new_campaigns),
        activeCampaigns: num(totalsRow?.active_campaigns),
        totalLeads: num(totalsRow?.total_leads),
        ...deriveMetrics({
          attempts: num(totalsRow?.attempts),
          connected: num(totalsRow?.connected),
          conversions: num(totalsRow?.conversions),
          uniqueLeadsDialed: num(totalsRow?.unique_leads),
          talkSec: num(totalsRow?.talk_sec),
          cost: num(totalsRow?.cost),
        }),
      },
    };
  }

  /**
   * $1/$2 are always the range bounds so the CTEs and the `is_new` flag can
   * share them; filter params start at $3.
   */
  private buildWhere(filters: BackofficeCampaignFilters): {
    where: string;
    params: unknown[];
  } {
    const params: unknown[] = [filters.start, filters.end];
    const clauses: string[] = [];

    const search = filters.search?.trim();
    if (search) {
      params.push(`%${search}%`);
      const i = params.length;
      clauses.push(
        `(c.name ILIKE $${i} OR o.name ILIKE $${i} OR em.email ILIKE $${i}
          OR u."firstName" ILIKE $${i} OR u."lastName" ILIKE $${i})`,
      );
    }

    if (filters.status && filters.status !== "all") {
      params.push(filters.status);
      clauses.push(`c.status = $${params.length}`);
    }

    const org = filters.organizationId;
    if (org === "none") {
      clauses.push(`c."organizationId" IS NULL`);
    } else if (org && org !== "all") {
      params.push(org);
      clauses.push(`c."organizationId" = $${params.length}::uuid`);
    } else if (filters.ownerScope === "org") {
      clauses.push(`c."organizationId" IS NOT NULL`);
    } else if (filters.ownerScope === "personal") {
      clauses.push(`c."organizationId" IS NULL`);
    }

    if (filters.onlyNew) {
      clauses.push(`c."createdAt" BETWEEN $1 AND $2`);
    }

    return {
      where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
      params,
    };
  }

  /** Range-scoped per-campaign aggregates shared by the rows and totals queries. */
  private statsCte(): string {
    return `WITH stats AS (
        SELECT
          ca."campaignId"                                  AS campaign_id,
          COUNT(*)                                         AS attempts,
          COUNT(*) FILTER (WHERE ca."answeredAt" IS NOT NULL) AS connected,
          COUNT(*) FILTER (WHERE ca."dispositionCode" IN (${this.conversionList()})) AS conversions,
          COUNT(DISTINCT ca."campaignLeadId")              AS unique_leads,
          COALESCE(SUM(ca."durationSec") FILTER (WHERE ca."answeredAt" IS NOT NULL), 0) AS talk_sec,
          COALESCE(SUM(cl."totalCost"), 0)                 AS cost,
          MAX(ca."initiatedAt")                            AS last_activity_at
        FROM "CallAttempt" ca
        LEFT JOIN "Call" cl ON cl.id = ca."callId"
        WHERE ca."initiatedAt" BETWEEN $1 AND $2
        GROUP BY ca."campaignId"
      ),
      leads AS (
        SELECT
          "campaignId" AS campaign_id,
          COUNT(*)     AS total_leads,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending_leads
        FROM "CampaignLead"
        GROUP BY "campaignId"
      )`;
  }

  private conversionList(): string {
    return CONVERSION_CODES.map((c) => `'${c}'`).join(",");
  }

  /** Organizations that own at least one campaign, for the filter dropdown. */
  async listOrganizationOptions(): Promise<CampaignOrganizationOption[]> {
    const rows = await this.prisma.$queryRaw<
      { id: string | null; name: string | null; campaigns: bigint }[]
    >(Prisma.sql`
      SELECT c."organizationId" AS id, o.name AS name, COUNT(*) AS campaigns
      FROM "Campaign" c
      LEFT JOIN "Organization" o ON o.id = c."organizationId"
      GROUP BY c."organizationId", o.name
      ORDER BY campaigns DESC
    `);

    return rows.map((r) => ({
      id: r.id,
      name: r.id ? (r.name ?? r.id) : "Personal (no organization)",
      campaigns: num(r.campaigns),
    }));
  }

  // ── Detail ─────────────────────────────────────────────────

  async getConfig(campaignId: string): Promise<CampaignConfig> {
    const c = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            emails: {
              select: { email: true, isPrimary: true },
              orderBy: { isPrimary: "desc" },
              take: 1,
            },
          },
        },
        organization: { select: { id: true, name: true, slug: true } },
        callerId: { select: { phoneNumber: true } },
        numberPurchased: { select: { phoneNumber: true } },
      },
    });
    if (!c) throw new NotFoundException("Campaign not found");

    const rotationNumbers = c.rotationNumberIds.length
      ? (
          await this.prisma.numberPurchased.findMany({
            where: { id: { in: c.rotationNumberIds } },
            select: { phoneNumber: true },
            orderBy: { phoneNumber: "asc" },
          })
        ).map((n) => n.phoneNumber)
      : [];

    return {
      id: c.id,
      name: c.name,
      description: c.description,
      status: c.status,
      dialerMode: c.dialerMode,
      maxAttempts: c.maxAttempts,
      timezone: c.timezone,
      workStartMin: c.workStartMin,
      workEndMin: c.workEndMin,
      workDays: c.workDays,
      wrapUpTimeSec: c.wrapUpTimeSec,
      retryDelayMin: c.retryDelayMin,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      ownerUserId: c.userId,
      ownerName:
        (c.user && fullName(c.user)) || c.user?.emails[0]?.email || c.userId,
      ownerEmail: c.user?.emails[0]?.email ?? null,
      organizationId: c.organizationId,
      organizationName: c.organization?.name ?? null,
      organizationSlug: c.organization?.slug ?? null,
      callerIdNumber: c.callerId?.phoneNumber ?? null,
      outboundNumber: c.numberPurchased?.phoneNumber ?? null,
      rotationNumbers,
    };
  }

  async getMetrics(
    campaignId: string,
    start: Date,
    end: Date,
  ): Promise<CampaignMetrics> {
    const [row] = await this.prisma.$queryRaw<
      {
        attempts: bigint;
        connected: bigint;
        conversions: bigint;
        unique_leads: bigint;
        talk_sec: bigint;
        cost: number | null;
      }[]
    >(Prisma.sql`
      SELECT
        COUNT(*)                                            AS attempts,
        COUNT(*) FILTER (WHERE ca."answeredAt" IS NOT NULL)  AS connected,
        COUNT(*) FILTER (WHERE ca."dispositionCode" = ANY(${CONVERSION_CODES})) AS conversions,
        COUNT(DISTINCT ca."campaignLeadId")                 AS unique_leads,
        COALESCE(SUM(ca."durationSec") FILTER (WHERE ca."answeredAt" IS NOT NULL), 0) AS talk_sec,
        COALESCE(SUM(cl."totalCost"), 0)                    AS cost
      FROM "CallAttempt" ca
      LEFT JOIN "Call" cl ON cl.id = ca."callId"
      WHERE ca."campaignId" = ${campaignId}::uuid
        AND ca."initiatedAt" BETWEEN ${start} AND ${end}
    `);

    return deriveMetrics({
      attempts: num(row?.attempts),
      connected: num(row?.connected),
      conversions: num(row?.conversions),
      uniqueLeadsDialed: num(row?.unique_leads),
      talkSec: num(row?.talk_sec),
      cost: num(row?.cost),
    });
  }

  async getDaily(
    campaignId: string,
    start: Date,
    end: Date,
  ): Promise<CampaignDailyPoint[]> {
    const rows = await this.prisma.$queryRaw<
      {
        day: Date;
        attempts: bigint;
        connected: bigint;
        conversions: bigint;
        talk_sec: bigint;
        cost: number | null;
      }[]
    >(Prisma.sql`
      SELECT
        date_trunc('day', ca."initiatedAt")                 AS day,
        COUNT(*)                                            AS attempts,
        COUNT(*) FILTER (WHERE ca."answeredAt" IS NOT NULL)  AS connected,
        COUNT(*) FILTER (WHERE ca."dispositionCode" = ANY(${CONVERSION_CODES})) AS conversions,
        COALESCE(SUM(ca."durationSec") FILTER (WHERE ca."answeredAt" IS NOT NULL), 0) AS talk_sec,
        COALESCE(SUM(cl."totalCost"), 0)                    AS cost
      FROM "CallAttempt" ca
      LEFT JOIN "Call" cl ON cl.id = ca."callId"
      WHERE ca."campaignId" = ${campaignId}::uuid
        AND ca."initiatedAt" BETWEEN ${start} AND ${end}
      GROUP BY day
      ORDER BY day
    `);

    return rows.map((r) => ({
      day: new Date(r.day).toISOString(),
      attempts: num(r.attempts),
      connected: num(r.connected),
      conversions: num(r.conversions),
      talkSec: num(r.talk_sec),
      cost: round2(num(r.cost)),
    }));
  }

  async getHourly(
    campaignId: string,
    start: Date,
    end: Date,
  ): Promise<CampaignHourlyPoint[]> {
    const rows = await this.prisma.$queryRaw<
      {
        hour: number;
        attempts: bigint;
        connected: bigint;
        cost: number | null;
      }[]
    >(Prisma.sql`
      SELECT
        EXTRACT(HOUR FROM ca."initiatedAt")::int            AS hour,
        COUNT(*)                                            AS attempts,
        COUNT(*) FILTER (WHERE ca."answeredAt" IS NOT NULL)  AS connected,
        COALESCE(SUM(cl."totalCost"), 0)                    AS cost
      FROM "CallAttempt" ca
      LEFT JOIN "Call" cl ON cl.id = ca."callId"
      WHERE ca."campaignId" = ${campaignId}::uuid
        AND ca."initiatedAt" BETWEEN ${start} AND ${end}
      GROUP BY hour
      ORDER BY hour
    `);

    return rows.map((r) => ({
      hour: r.hour,
      attempts: num(r.attempts),
      connected: num(r.connected),
      cost: round2(num(r.cost)),
    }));
  }

  async getDispositions(
    campaignId: string,
    start: Date,
    end: Date,
  ): Promise<CampaignDispositionRow[]> {
    const rows = await this.prisma.$queryRaw<
      {
        code: string;
        label: string | null;
        category: string | null;
        count: bigint;
        percentage: number;
      }[]
    >(Prisma.sql`
      SELECT
        ca."dispositionCode"      AS code,
        MAX(d.label)              AS label,
        MAX(d.category::text)     AS category,
        COUNT(*)                  AS count,
        ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) AS percentage
      FROM "CallAttempt" ca
      LEFT JOIN "Disposition" d
        ON d."campaignId" = ca."campaignId" AND d.code = ca."dispositionCode"
      WHERE ca."campaignId" = ${campaignId}::uuid
        AND ca."dispositionCode" IS NOT NULL
        AND ca."initiatedAt" BETWEEN ${start} AND ${end}
      GROUP BY ca."dispositionCode"
      ORDER BY count DESC
    `);

    return rows.map((r) => ({
      code: r.code,
      label: r.label,
      category: r.category,
      count: num(r.count),
      percentage: Number(r.percentage ?? 0),
    }));
  }

  async getAgents(
    campaignId: string,
    start: Date,
    end: Date,
  ): Promise<CampaignAgentRow[]> {
    const rows = await this.prisma.$queryRaw<
      {
        agent_user_id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        attempts: bigint;
        connected: bigint;
        conversions: bigint;
        talk_sec: bigint;
        cost: number | null;
      }[]
    >(Prisma.sql`
      SELECT
        ca."agentUserId"                                    AS agent_user_id,
        MAX(u."firstName")                                  AS first_name,
        MAX(u."lastName")                                   AS last_name,
        MAX(e.email)                                        AS email,
        COUNT(*)                                            AS attempts,
        COUNT(*) FILTER (WHERE ca."answeredAt" IS NOT NULL)  AS connected,
        COUNT(*) FILTER (WHERE ca."dispositionCode" = ANY(${CONVERSION_CODES})) AS conversions,
        COALESCE(SUM(ca."durationSec") FILTER (WHERE ca."answeredAt" IS NOT NULL), 0) AS talk_sec,
        COALESCE(SUM(cl."totalCost"), 0)                    AS cost
      FROM "CallAttempt" ca
      LEFT JOIN "Call" cl ON cl.id = ca."callId"
      LEFT JOIN "User" u  ON u.id = ca."agentUserId"
      LEFT JOIN LATERAL (
        SELECT ue.email FROM "UserEmail" ue
        WHERE ue."userId" = ca."agentUserId"
        ORDER BY ue."isPrimary" DESC, ue."createdAt" ASC
        LIMIT 1
      ) e ON TRUE
      WHERE ca."campaignId" = ${campaignId}::uuid
        AND ca."initiatedAt" BETWEEN ${start} AND ${end}
      GROUP BY ca."agentUserId"
      ORDER BY attempts DESC
    `);

    return rows.map((r) => {
      const attempts = num(r.attempts);
      const connected = num(r.connected);
      const talkSec = num(r.talk_sec);
      return {
        agentUserId: r.agent_user_id,
        name:
          fullName({ firstName: r.first_name, lastName: r.last_name }) ||
          r.email ||
          r.agent_user_id,
        email: r.email,
        attempts,
        connected,
        conversions: num(r.conversions),
        talkSec,
        cost: round2(num(r.cost)),
        contactRate: rate(connected, attempts),
        avgHandleTimeSec: connected ? Math.round(talkSec / connected) : 0,
      };
    });
  }

  /** Lead funnel is lifetime state, not range-scoped — leads have no history table. */
  async getLeadsByStatus(campaignId: string): Promise<CampaignLeadStatusRow[]> {
    const rows = await this.prisma.campaignLead.groupBy({
      by: ["status"],
      where: { campaignId },
      _count: { _all: true },
    });
    return rows
      .map((r) => ({ status: r.status as string, count: r._count._all }))
      .sort((a, b) => b.count - a.count);
  }

  async getLists(campaignId: string): Promise<CampaignListRow[]> {
    const rows = await this.prisma.campaignList.findMany({
      where: { campaignId },
      select: {
        id: true,
        name: true,
        source: true,
        createdAt: true,
        _count: { select: { leads: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      source: r.source,
      leads: r._count.leads,
      createdAt: r.createdAt,
    }));
  }

  async getMembers(campaignId: string): Promise<CampaignMemberRow[]> {
    const rows = await this.prisma.campaignMember.findMany({
      where: { campaignId },
      select: {
        role: true,
        assignedAt: true,
        userId: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
            emails: {
              select: { email: true },
              orderBy: { isPrimary: "desc" },
              take: 1,
            },
          },
        },
      },
      orderBy: { assignedAt: "asc" },
    });

    return rows.map((r) => ({
      userId: r.userId,
      name:
        (r.user && fullName(r.user)) || r.user?.emails[0]?.email || r.userId,
      email: r.user?.emails[0]?.email ?? null,
      role: r.role,
      assignedAt: r.assignedAt,
    }));
  }

  async getRetryRules(campaignId: string): Promise<CampaignRetryRuleRow[]> {
    const rows = await this.prisma.retryRule.findMany({
      where: { campaignId },
      orderBy: { dispositionCategory: "asc" },
    });
    return rows.map((r) => ({
      dispositionCategory: r.dispositionCategory,
      maxAttempts: r.maxAttempts,
      delayMinutes: r.delayMinutes,
      delayMultiplier: r.delayMultiplier,
    }));
  }

  /** Raw call log for the campaign — the "show me the actual calls" view. */
  async listAttempts(params: {
    campaignId: string;
    start: Date;
    end: Date;
    skip: number;
    take: number;
  }): Promise<CampaignAttemptsResult> {
    const { campaignId, start, end, skip, take } = params;

    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        initiated_at: Date;
        answered_at: Date | null;
        ended_at: Date | null;
        status: string;
        attempt_number: number;
        duration_sec: number | null;
        hangup_cause: string | null;
        disposition_code: string | null;
        cost: number | null;
        call_id: string | null;
        agent_user_id: string;
        first_name: string | null;
        last_name: string | null;
        agent_email: string | null;
        contact_name: string | null;
        contact_phone: string | null;
      }[]
    >(Prisma.sql`
      SELECT
        ca.id,
        ca."initiatedAt"      AS initiated_at,
        ca."answeredAt"       AS answered_at,
        ca."endedAt"          AS ended_at,
        ca.status::text       AS status,
        ca."attemptNumber"    AS attempt_number,
        ca."durationSec"      AS duration_sec,
        ca."hangupCause"      AS hangup_cause,
        ca."dispositionCode"  AS disposition_code,
        cl."totalCost"        AS cost,
        ca."callId"           AS call_id,
        ca."agentUserId"      AS agent_user_id,
        u."firstName"         AS first_name,
        u."lastName"          AS last_name,
        e.email               AS agent_email,
        COALESCE(NULLIF(TRIM(ct.name), ''), NULLIF(TRIM(ct."fullName"), ''),
                 NULLIF(TRIM(CONCAT_WS(' ', ct."firstName", ct."lastName")), '')) AS contact_name,
        ct."phoneNumber"      AS contact_phone
      FROM "CallAttempt" ca
      LEFT JOIN "Call" cl          ON cl.id = ca."callId"
      LEFT JOIN "User" u           ON u.id = ca."agentUserId"
      LEFT JOIN LATERAL (
        SELECT ue.email FROM "UserEmail" ue
        WHERE ue."userId" = ca."agentUserId"
        ORDER BY ue."isPrimary" DESC, ue."createdAt" ASC
        LIMIT 1
      ) e ON TRUE
      LEFT JOIN "CampaignLead" lead ON lead.id = ca."campaignLeadId"
      LEFT JOIN "Contact" ct        ON ct.id = lead."contactId"
      WHERE ca."campaignId" = ${campaignId}::uuid
        AND ca."initiatedAt" BETWEEN ${start} AND ${end}
      ORDER BY ca."initiatedAt" DESC
      LIMIT ${take} OFFSET ${skip}
    `);

    const total = await this.prisma.callAttempt.count({
      where: { campaignId, initiatedAt: { gte: start, lte: end } },
    });

    return {
      items: rows.map((r) => ({
        id: r.id,
        initiatedAt: r.initiated_at,
        answeredAt: r.answered_at,
        endedAt: r.ended_at,
        status: r.status,
        attemptNumber: r.attempt_number,
        durationSec: r.duration_sec,
        hangupCause: r.hangup_cause,
        dispositionCode: r.disposition_code,
        cost: r.cost === null ? null : round2(Number(r.cost)),
        callId: r.call_id,
        agentUserId: r.agent_user_id,
        agentName:
          fullName({ firstName: r.first_name, lastName: r.last_name }) ||
          r.agent_email ||
          r.agent_user_id,
        contactName: r.contact_name,
        contactPhone: r.contact_phone,
      })),
      total,
    };
  }
}
