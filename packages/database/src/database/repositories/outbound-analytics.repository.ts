import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

export interface CampaignSummaryStats {
  totalAttempts: number;
  connected: number;
  conversions: number;
  avgHandleTimeSec: number | null;
  uniqueLeadsDialed: number;
  contactRate: number;
  conversionRate: number;
}

export interface AgentPerformanceStats {
  agentUserId: string;
  attempts: number;
  connected: number;
  totalTalkSec: number;
  conversions: number;
  contactRate: number;
}

export interface DispositionDistribution {
  dispositionCode: string;
  count: number;
  percentage: number;
}

export interface HourlyCallVolume {
  hour: number;
  attempts: number;
  connected: number;
}

@Injectable()
export class OutboundAnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getCampaignSummary(
    campaignId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<CampaignSummaryStats> {
    const dateFilter =
      startDate && endDate
        ? `AND "initiatedAt" BETWEEN $2 AND $3`
        : "";
    const params: any[] = [campaignId];
    if (startDate && endDate) {
      params.push(startDate, endDate);
    }

    const result = await this.prisma.$queryRawUnsafe<
      {
        total_attempts: bigint;
        connected: bigint;
        conversions: bigint;
        avg_handle_time: number | null;
        unique_leads: bigint;
        contact_rate: number;
        conversion_rate: number;
      }[]
    >(
      `SELECT
        COUNT(*) as total_attempts,
        COUNT(*) FILTER (WHERE "answeredAt" IS NOT NULL) as connected,
        COUNT(*) FILTER (WHERE "dispositionCode" IN ('meeting_booked','sale')) as conversions,
        AVG("durationSec") FILTER (WHERE "answeredAt" IS NOT NULL) as avg_handle_time,
        COUNT(DISTINCT "campaignLeadId") as unique_leads,
        ROUND(COUNT(*) FILTER (WHERE "answeredAt" IS NOT NULL)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as contact_rate,
        ROUND(COUNT(*) FILTER (WHERE "dispositionCode" IN ('meeting_booked','sale'))::numeric / NULLIF(COUNT(*), 0) * 100, 1) as conversion_rate
      FROM "CallAttempt"
      WHERE "campaignId" = $1::uuid ${dateFilter}`,
      ...params
    );

    const row = result[0];
    return {
      totalAttempts: Number(row?.total_attempts ?? 0),
      connected: Number(row?.connected ?? 0),
      conversions: Number(row?.conversions ?? 0),
      avgHandleTimeSec: row?.avg_handle_time ?? null,
      uniqueLeadsDialed: Number(row?.unique_leads ?? 0),
      contactRate: Number(row?.contact_rate ?? 0),
      conversionRate: Number(row?.conversion_rate ?? 0),
    };
  }

  async getAgentPerformance(
    campaignId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<AgentPerformanceStats[]> {
    const dateFilter =
      startDate && endDate
        ? `AND "initiatedAt" BETWEEN $2 AND $3`
        : "";
    const params: any[] = [campaignId];
    if (startDate && endDate) {
      params.push(startDate, endDate);
    }

    const results = await this.prisma.$queryRawUnsafe<
      {
        agent_user_id: string;
        attempts: bigint;
        connected: bigint;
        total_talk_sec: bigint;
        conversions: bigint;
        contact_rate: number;
      }[]
    >(
      `SELECT
        "agentUserId" as agent_user_id,
        COUNT(*) as attempts,
        COUNT(*) FILTER (WHERE "answeredAt" IS NOT NULL) as connected,
        COALESCE(SUM("durationSec") FILTER (WHERE "answeredAt" IS NOT NULL), 0) as total_talk_sec,
        COUNT(*) FILTER (WHERE "dispositionCode" IN ('meeting_booked','sale')) as conversions,
        ROUND(COUNT(*) FILTER (WHERE "answeredAt" IS NOT NULL)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as contact_rate
      FROM "CallAttempt"
      WHERE "campaignId" = $1::uuid ${dateFilter}
      GROUP BY "agentUserId"
      ORDER BY attempts DESC`,
      ...params
    );

    return results.map((r) => ({
      agentUserId: r.agent_user_id,
      attempts: Number(r.attempts),
      connected: Number(r.connected),
      totalTalkSec: Number(r.total_talk_sec),
      conversions: Number(r.conversions),
      contactRate: Number(r.contact_rate),
    }));
  }

  async getDispositionDistribution(
    campaignId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<DispositionDistribution[]> {
    const dateFilter =
      startDate && endDate
        ? `AND "initiatedAt" BETWEEN $2 AND $3`
        : "";
    const params: any[] = [campaignId];
    if (startDate && endDate) {
      params.push(startDate, endDate);
    }

    const results = await this.prisma.$queryRawUnsafe<
      {
        disposition_code: string;
        count: bigint;
        percentage: number;
      }[]
    >(
      `SELECT
        "dispositionCode" as disposition_code,
        COUNT(*) as count,
        ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) as percentage
      FROM "CallAttempt"
      WHERE "campaignId" = $1::uuid
        AND "dispositionCode" IS NOT NULL
        ${dateFilter}
      GROUP BY "dispositionCode"
      ORDER BY count DESC`,
      ...params
    );

    return results.map((r) => ({
      dispositionCode: r.disposition_code,
      count: Number(r.count),
      percentage: Number(r.percentage),
    }));
  }

  async getHourlyCallVolume(
    campaignId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<HourlyCallVolume[]> {
    const dateFilter =
      startDate && endDate
        ? `AND "initiatedAt" BETWEEN $2 AND $3`
        : "";
    const params: any[] = [campaignId];
    if (startDate && endDate) {
      params.push(startDate, endDate);
    }

    const results = await this.prisma.$queryRawUnsafe<
      {
        hour: number;
        attempts: bigint;
        connected: bigint;
      }[]
    >(
      `SELECT
        EXTRACT(HOUR FROM "initiatedAt")::int as hour,
        COUNT(*) as attempts,
        COUNT(*) FILTER (WHERE "answeredAt" IS NOT NULL) as connected
      FROM "CallAttempt"
      WHERE "campaignId" = $1::uuid ${dateFilter}
      GROUP BY hour
      ORDER BY hour`,
      ...params
    );

    return results.map((r) => ({
      hour: r.hour,
      attempts: Number(r.attempts),
      connected: Number(r.connected),
    }));
  }

  async getDispositionsByAgent(
    campaignId: string,
    agentUserId?: string
  ): Promise<
    {
      agentUserId: string;
      dispositionCode: string;
      count: number;
    }[]
  > {
    const agentFilter = agentUserId
      ? `AND "agentUserId" = $2::uuid`
      : "";
    const params: any[] = [campaignId];
    if (agentUserId) params.push(agentUserId);

    const results = await this.prisma.$queryRawUnsafe<
      {
        agent_user_id: string;
        disposition_code: string;
        count: bigint;
      }[]
    >(
      `SELECT
        "agentUserId" as agent_user_id,
        "dispositionCode" as disposition_code,
        COUNT(*) as count
      FROM "CallAttempt"
      WHERE "campaignId" = $1::uuid
        AND "dispositionCode" IS NOT NULL
        AND "agentUserId" IS NOT NULL
        ${agentFilter}
      GROUP BY "agentUserId", "dispositionCode"
      ORDER BY "agentUserId", count DESC`,
      ...params
    );

    return results.map((r) => ({
      agentUserId: r.agent_user_id,
      dispositionCode: r.disposition_code,
      count: Number(r.count),
    }));
  }

  async getLeadStatusCounts(
    campaignId: string
  ): Promise<{ status: string; count: number }[]> {
    const results = await this.prisma.$queryRawUnsafe<
      { status: string; count: bigint }[]
    >(
      `SELECT status::text, COUNT(*) as count
       FROM "CampaignLead"
       WHERE "campaignId" = $1::uuid
       GROUP BY status
       ORDER BY count DESC`,
      campaignId
    );

    return results.map((r) => ({
      status: r.status,
      count: Number(r.count),
    }));
  }
}
