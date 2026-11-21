import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { randomUUID } from "node:crypto";
import { AgentSession, AgentSessionStatus, Prisma } from "@prisma/client";

@Injectable()
export class AgentSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Replace exactly the incarnation read by the service, including its locks. */
  async restartIfUnchanged(
    data: { campaignId: string; userId: string; organizationId: string },
    previous: AgentSession | null,
    status: AgentSessionStatus,
  ): Promise<AgentSession | null> {
    const startedAt = new Date(
      Math.max(Date.now(), (previous?.startedAt.getTime() ?? 0) + 1),
    );
    return this.prisma.$transaction(async (tx) => {
      if (!previous) {
        const id = randomUUID();
        const created = await tx.agentSession.createMany({
          data: { id, ...data, status, startedAt },
          skipDuplicates: true,
        });
        return created.count
          ? tx.agentSession.findUnique({ where: { id } })
          : null;
      }

      const changed = await tx.agentSession.updateMany({
        where: {
          ...this.snapshotFilter(previous),
          callAttempts: { none: { call: { endedAt: null } } },
        },
        data: {
          status,
          currentLeadId: null,
          lastHeartbeat: new Date(),
          startedAt,
          endedAt: null,
          callsAttempted: 0,
          callsConnected: 0,
          totalTalkSec: 0,
        },
      });
      if (!changed.count) return null;
      await this.releaseAssignments(tx, previous.id);
      return tx.agentSession.findUnique({ where: { id: previous.id } });
    });
  }

  /** Stop and clean up atomically; a stale stop/sweep cannot stop a new start. */
  async endIfUnchanged(
    previous: AgentSession,
    preserveLiveLead = false,
  ): Promise<AgentSession | null> {
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.agentSession.updateMany({
        where: {
          ...this.snapshotFilter(previous),
          ...(!preserveLiveLead
            ? { callAttempts: { none: { call: { endedAt: null } } } }
            : {}),
        },
        data: {
          status: AgentSessionStatus.offline,
          endedAt: new Date(),
          ...(!preserveLiveLead ? { currentLeadId: null } : {}),
        },
      });
      if (!changed.count) return null;
      if (!preserveLiveLead) await this.releaseAssignments(tx, previous.id);
      return tx.agentSession.findUnique({ where: { id: previous.id } });
    });
  }

  private snapshotFilter(session: AgentSession) {
    return {
      id: session.id,
      startedAt: session.startedAt,
      lastHeartbeat: session.lastHeartbeat,
      status: session.status,
      currentLeadId: session.currentLeadId,
    };
  }

  private async releaseAssignments(
    tx: Prisma.TransactionClient,
    sessionId: string,
  ) {
    await tx.callAttempt.deleteMany({
      where: {
        agentSessionId: sessionId,
        callId: null,
        status: { in: ["created", "dialing"] },
      },
    });
    // Also recovers a worker interrupted between locking a lead and claiming
    // the session: that lead never made it into currentLeadId.
    await tx.campaignLead.updateMany({
      where: {
        lockedBy: sessionId,
        status: { in: ["locked", "dialing", "in_call", "wrap_up"] },
        callAttempts: { none: { call: { endedAt: null } } },
      },
      data: { status: "queued", lockedBy: null, lockedAt: null },
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

  async findByStatus(status: AgentSessionStatus): Promise<AgentSession[]> {
    return this.prisma.agentSession.findMany({ where: { status } });
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

  /**
   * Compare-and-set: move the session to `status` only while it is still in
   * one of `expected.from` — and, when `expected.currentLeadId` is given, still
   * holding exactly that lead. Returns whether this call made the move.
   *
   * The dialer's writers race each other: the poll tick, the provider's call
   * webhooks and the agent's own requests. With a plain update whoever lands
   * last wins, which let two ticks reserve one agent (two calls placed at once)
   * and let a late hangup webhook drag an agent back into wrap-up after their
   * disposition had already sent them on.
   */
  async transitionIf(
    id: string,
    expected: {
      from: AgentSessionStatus[];
      currentLeadId?: string | null;
      startedAt?: Date;
      endedAt?: Date | null;
    },
    status: AgentSessionStatus,
    extra?: Partial<Pick<AgentSession, "currentLeadId" | "endedAt">>,
  ): Promise<boolean> {
    const result = await this.prisma.agentSession.updateMany({
      where: {
        id,
        status: { in: expected.from },
        ...(expected.startedAt ? { startedAt: expected.startedAt } : {}),
        ...(expected.endedAt !== undefined
          ? { endedAt: expected.endedAt }
          : {}),
        ...(expected.currentLeadId !== undefined
          ? { currentLeadId: expected.currentLeadId }
          : {}),
      },
      data: { status, ...extra },
    });
    return result.count === 1;
  }

  async heartbeat(id: string, startedAt?: Date): Promise<AgentSession | null> {
    const updated = await this.prisma.agentSession.updateManyAndReturn({
      where: { id, ...(startedAt ? { startedAt } : {}) },
      data: { lastHeartbeat: new Date() },
    });
    return updated[0] ?? null;
  }

  async findStalledReservations(cutoff: Date): Promise<AgentSession[]> {
    return this.prisma.agentSession.findMany({
      where: {
        status: AgentSessionStatus.reserved,
        updatedAt: { lt: cutoff },
        campaign: { dialerMode: "progressive" },
        callAttempts: { none: { call: { endedAt: null } } },
      },
    });
  }

  async incrementStats(
    id: string,
    stats: {
      callsAttempted?: number;
      callsConnected?: number;
      totalTalkSec?: number;
    },
    startedAt?: Date,
  ): Promise<AgentSession | null> {
    const updated = await this.prisma.agentSession.updateManyAndReturn({
      where: { id, ...(startedAt ? { startedAt } : {}) },
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
    return updated[0] ?? null;
  }

  async findStale(thresholdMs: number): Promise<AgentSession[]> {
    const cutoff = new Date(Date.now() - thresholdMs);
    return this.prisma.agentSession.findMany({
      where: {
        OR: [
          { status: { not: AgentSessionStatus.offline } },
          { endedAt: null },
        ],
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
