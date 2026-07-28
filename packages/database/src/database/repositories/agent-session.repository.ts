import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { AgentSession, AgentSessionStatus } from "@prisma/client";

@Injectable()
export class AgentSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(data: {
    campaignId: string;
    userId: string;
    organizationId: string;
  }): Promise<AgentSession> {
    return this.prisma.agentSession.upsert({
      where: {
        campaignId_userId: {
          campaignId: data.campaignId,
          userId: data.userId,
        },
      },
      update: {
        status: AgentSessionStatus.ready,
        lastHeartbeat: new Date(),
        startedAt: new Date(),
        endedAt: null,
        callsAttempted: 0,
        callsConnected: 0,
        totalTalkSec: 0,
      },
      create: {
        campaignId: data.campaignId,
        userId: data.userId,
        organizationId: data.organizationId,
        status: AgentSessionStatus.ready,
      },
    });
  }

  async findById(id: string): Promise<AgentSession | null> {
    return this.prisma.agentSession.findUnique({ where: { id } });
  }

  async findByCampaignAndUser(
    campaignId: string,
    userId: string,
  ): Promise<AgentSession | null> {
    return this.prisma.agentSession.findUnique({
      where: { campaignId_userId: { campaignId, userId } },
    });
  }

  async findReadyByCampaign(campaignId: string): Promise<AgentSession[]> {
    return this.prisma.agentSession.findMany({
      where: { campaignId, status: AgentSessionStatus.ready },
    });
  }

  async findActiveByCampaign(campaignId: string): Promise<AgentSession[]> {
    return this.prisma.agentSession.findMany({
      where: {
        campaignId,
        status: {
          not: AgentSessionStatus.offline,
        },
      },
      orderBy: { startedAt: "asc" },
    });
  }

  async findActiveByUser(userId: string): Promise<AgentSession[]> {
    return this.prisma.agentSession.findMany({
      where: {
        userId,
        status: { not: AgentSessionStatus.offline },
      },
    });
  }

  async updateStatus(
    id: string,
    status: AgentSessionStatus,
    extra?: Partial<Pick<AgentSession, "currentLeadId" | "endedAt">>,
  ): Promise<AgentSession> {
    return this.prisma.agentSession.update({
      where: { id },
      data: { status, ...extra },
    });
  }

  async heartbeat(id: string): Promise<AgentSession> {
    return this.prisma.agentSession.update({
      where: { id },
      data: { lastHeartbeat: new Date() },
    });
  }

  async incrementStats(
    id: string,
    stats: {
      callsAttempted?: number;
      callsConnected?: number;
      totalTalkSec?: number;
    },
  ): Promise<AgentSession> {
    return this.prisma.agentSession.update({
      where: { id },
      data: {
        ...(stats.callsAttempted
          ? { callsAttempted: { increment: stats.callsAttempted } }
          : {}),
        ...(stats.callsConnected
          ? { callsConnected: { increment: stats.callsConnected } }
          : {}),
        ...(stats.totalTalkSec
          ? { totalTalkSec: { increment: stats.totalTalkSec } }
          : {}),
      },
    });
  }

  async findStale(thresholdMs: number): Promise<AgentSession[]> {
    const cutoff = new Date(Date.now() - thresholdMs);
    return this.prisma.agentSession.findMany({
      where: {
        status: { not: AgentSessionStatus.offline },
        lastHeartbeat: { lt: cutoff },
      },
    });
  }

  async markOffline(id: string): Promise<AgentSession> {
    return this.prisma.agentSession.update({
      where: { id },
      data: {
        status: AgentSessionStatus.offline,
        endedAt: new Date(),
        currentLeadId: null,
      },
    });
  }
}
