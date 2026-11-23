import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { randomUUID } from "node:crypto";
import { AgentSession, AgentSessionStatus, Prisma } from "@prisma/client";
import { deleteUndialedAttempt } from "./call-attempt.repository";

export type AgentSessionReservation = AgentSession & {
  leadLockedAt: Date | null;
};

interface AssignmentRetry {
  leadId: string;
  attempts: number;
  status: "queued" | "exhausted";
  nextCallAt?: Date;
  deadAt?: Date;
}

export type AccountDisableEndResult =
  | { outcome: "ended"; session: AgentSession }
  | { outcome: "changed" }
  | { outcome: "calling_enabled" };

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
      if (!(await this.lockCallingUser(tx, data.userId))) return null;
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

      await this.lockSession(tx, previous.id);
      if (
        previous.status === "offline" &&
        previous.endedAt &&
        previous.currentLeadId
      )
        return null;
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
    options: {
      rejectLiveCalls?: boolean;
      assignmentRetry?: AssignmentRetry;
    } = {},
  ): Promise<AgentSession | null> {
    const result = await this.endSnapshot(
      previous,
      preserveLiveLead,
      true,
      options.rejectLiveCalls,
      options.assignmentRetry,
    );
    return result.outcome === "ended" ? result.session : null;
  }

  /** Account cleanup ignores heartbeats, but must re-evaluate a new assignment. */
  async endForAccountDisable(
    previous: AgentSession,
    preserveLiveLead: boolean,
  ): Promise<AccountDisableEndResult> {
    return this.endSnapshot(previous, preserveLiveLead, false);
  }

  private async endSnapshot(
    previous: AgentSession,
    preserveLiveLead: boolean,
    compareHeartbeat: boolean,
    rejectLiveCalls = false,
    assignmentRetry?: AssignmentRetry,
  ): Promise<AccountDisableEndResult> {
    return this.prisma.$transaction(async (tx) => {
      // User updates (including canCall=false), activation and account cleanup
      // share this row lock. Always acquire it before the session lock.
      if (
        !compareHeartbeat &&
        (await this.lockCallingUser(tx, previous.userId))
      )
        return { outcome: "calling_enabled" };
      await this.lockSession(tx, previous.id);
      if (assignmentRetry) {
        const [lead] = await tx.$queryRaw<Array<{ attempts: number }>>`
          SELECT "attempts" FROM "CampaignLead" WHERE "id" = ${assignmentRetry.leadId}::uuid FOR UPDATE`;
        if (!lead || lead.attempts !== assignmentRetry.attempts)
          return { outcome: "changed" };
        // A provider hangup can precede attempt finalization. The terminal
        // marker and its lead counter commit together; wait for that commit.
        if (
          await tx.callAttempt.count({
            where: {
              agentSessionId: previous.id,
              campaignLeadId: assignmentRetry.leadId,
              callId: { not: null },
              status: { notIn: ["ended", "dispositioned"] },
            },
          })
        )
          return { outcome: "changed" };
      }
      const changed = await tx.agentSession.updateMany({
        where: {
          ...this.snapshotFilter(previous),
          ...(!compareHeartbeat ? { lastHeartbeat: undefined } : {}),
          ...(!preserveLiveLead || rejectLiveCalls
            ? { callAttempts: { none: { call: { endedAt: null } } } }
            : {}),
        },
        data: {
          status: AgentSessionStatus.offline,
          endedAt: new Date(),
          ...(!preserveLiveLead ? { currentLeadId: null } : {}),
        },
      });
      if (!changed.count) return { outcome: "changed" };
      if (assignmentRetry)
        await tx.campaignLead.updateMany({
          where: {
            id: assignmentRetry.leadId,
            lockedBy: previous.id,
            status: { in: ["locked", "dialing", "in_call", "wrap_up"] },
            attempts: assignmentRetry.attempts,
          },
          data: {
            status: assignmentRetry.status,
            lockedBy: null,
            lockedAt: null,
            deadAt: assignmentRetry.deadAt,
            nextCallAt: assignmentRetry.nextCallAt,
          },
        });
      if (!preserveLiveLead) await this.releaseAssignments(tx, previous.id);
      const session = await tx.agentSession.findUnique({
        where: { id: previous.id },
      });
      return session ? { outcome: "ended", session } : { outcome: "changed" };
    });
  }

  private snapshotFilter(session: AgentSession) {
    return {
      id: session.id,
      startedAt: session.startedAt,
      lastHeartbeat: session.lastHeartbeat,
      status: session.status,
      currentLeadId: session.currentLeadId,
      reservedAt: session.reservedAt,
      endedAt: session.endedAt,
    };
  }

  private async lockSession(tx: Prisma.TransactionClient, id: string) {
    return tx.$queryRaw<AgentSession[]>`
      SELECT * FROM "AgentSession" WHERE "id" = ${id}::uuid FOR UPDATE`;
  }

  private async lockCallingUser(tx: Prisma.TransactionClient, userId: string) {
    const users = await tx.$queryRaw<Array<{ canCall: boolean }>>`
      SELECT "canCall" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
    return users[0]?.canCall === true;
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

  async findByStatus(
    status: AgentSessionStatus,
  ): Promise<AgentSessionReservation[]> {
    return this.prisma.$queryRaw<AgentSessionReservation[]>`
      SELECT session.*, lead."lockedAt" AS "leadLockedAt" FROM "AgentSession" session
      LEFT JOIN "CampaignLead" lead ON lead."id" = session."currentLeadId" AND lead."lockedBy" = session."id"
      WHERE session."status" = ${status}::"AgentSessionStatus"`;
  }

  async findActiveByUser(userId: string): Promise<AgentSession[]> {
    return this.prisma.agentSession.findMany({
      where: {
        userId,
        OR: [
          { status: { not: AgentSessionStatus.offline } },
          { endedAt: null },
        ],
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
      reservedAt?: Date | null;
      /** Atomically discard this assignment before moving its session. null means no attempt was observed. */
      undialedAttemptId?: string | null;
    },
    status: AgentSessionStatus,
    extra?: Partial<Pick<AgentSession, "currentLeadId" | "endedAt">>,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      if (status === "ready") {
        const session = await tx.agentSession.findUnique({ where: { id } });
        if (!session || !(await this.lockCallingUser(tx, session.userId)))
          return false;
      }
      const [session] = await this.lockSession(tx, id);
      if (!session) return false;
      const where: Prisma.AgentSessionWhereInput = {
        id,
        status: { in: expected.from },
        ...(expected.startedAt ? { startedAt: expected.startedAt } : {}),
        ...(expected.endedAt !== undefined
          ? { endedAt: expected.endedAt }
          : {}),
        ...(expected.currentLeadId !== undefined
          ? { currentLeadId: expected.currentLeadId }
          : {}),
        ...(expected.reservedAt !== undefined
          ? { reservedAt: expected.reservedAt }
          : {}),
        ...(expected.undialedAttemptId !== undefined
          ? {
              callAttempts: {
                none: {
                  ...(expected.undialedAttemptId
                    ? {
                        id: expected.undialedAttemptId,
                        callId: { not: null },
                        call: { endedAt: null },
                      }
                    : {
                        campaignLeadId: expected.currentLeadId ?? undefined,
                        sessionStartedAt: expected.startedAt,
                        OR: [
                          { callId: { not: null }, call: { endedAt: null } },
                          {
                            callId: null,
                            status: { in: ["created", "dialing"] },
                          },
                        ],
                      }),
                },
              },
            }
          : {}),
      };
      if (expected.undialedAttemptId !== undefined) {
        if (!(await tx.agentSession.count({ where }))) return false;
        if (
          expected.undialedAttemptId &&
          !(await deleteUndialedAttempt(tx, expected.undialedAttemptId, {
            agentSessionId: id,
            campaignLeadId: expected.currentLeadId ?? undefined,
            sessionStartedAt: expected.startedAt,
          }))
        )
          return false;
      }
      const result = await tx.agentSession.updateMany({
        where,
        data: {
          status,
          ...extra,
          ...(status === AgentSessionStatus.reserved
            ? {
                reservedAt: new Date(
                  Math.max(
                    Date.now(),
                    (session.reservedAt?.getTime() ?? 0) + 1,
                  ),
                ),
              }
            : {}),
        },
      });
      return result.count === 1;
    });
  }

  async heartbeat(id: string, startedAt?: Date): Promise<AgentSession | null> {
    const now = new Date();
    // Stream attachment also uses this fence. Even same-millisecond attaches
    // must invalidate an earlier stream's disconnected activation snapshot.
    const updated = await this.prisma.$queryRaw<AgentSession[]>`
      UPDATE "AgentSession" SET
        "lastHeartbeat" = GREATEST((${now}::timestamptz AT TIME ZONE 'UTC'), "lastHeartbeat" + interval '1 millisecond'),
        "updatedAt" = (${now}::timestamptz AT TIME ZONE 'UTC')
      WHERE "id" = ${id}::uuid
        ${startedAt ? Prisma.sql`AND "startedAt" = (${startedAt}::timestamptz AT TIME ZONE 'UTC')` : Prisma.empty}
      RETURNING *`;
    return updated[0] ?? null;
  }

  async findStalledReservations(
    cutoff: Date,
  ): Promise<AgentSessionReservation[]> {
    return this.prisma.$queryRaw<AgentSessionReservation[]>`
      SELECT session.*, lead."lockedAt" AS "leadLockedAt" FROM "AgentSession" session
      JOIN "Campaign" campaign ON campaign."id" = session."campaignId"
      LEFT JOIN "CampaignLead" lead ON lead."id" = session."currentLeadId" AND lead."lockedBy" = session."id"
      WHERE session."status" = 'reserved' AND session."reservedAt" < (${cutoff}::timestamptz AT TIME ZONE 'UTC')
        AND campaign."dialerMode" = 'progressive'
        AND NOT EXISTS (SELECT 1 FROM "CallAttempt" attempt JOIN "Call" call ON call."id" = attempt."callId"
          WHERE attempt."agentSessionId" = session."id" AND call."endedAt" IS NULL)`;
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
          { currentLeadId: { not: null } },
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
