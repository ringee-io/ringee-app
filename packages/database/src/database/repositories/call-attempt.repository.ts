import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import {
  CallAttempt,
  CallAttemptStatus,
  CallOutcome,
  Prisma,
} from "@prisma/client";

export const DIAL_DISPATCH_TIMEOUT_MS = 90_000;

/** Shared by session stop/takeover and lead recovery. */
export function unconfirmedDialSql(now = new Date()): Prisma.Sql {
  const cutoff = new Date(now.getTime() - DIAL_DISPATCH_TIMEOUT_MS);
  return Prisma.sql`attempt."callId" IS NULL
    AND attempt."status" = 'dialing'
    AND attempt."initiatedAt" > (${cutoff}::timestamptz AT TIME ZONE 'UTC')`;
}

/** An attempt with no provider leg yet: assigned, or handed to the browser. */
const UNDIALED_ATTEMPT_STATUSES: CallAttemptStatus[] = [
  CallAttemptStatus.created,
  CallAttemptStatus.dialing,
];

/** The caller holds the attempt's session row lock, as provider binding does. */
export async function deleteUndialedAttempt(
  tx: Prisma.TransactionClient,
  id: string,
  assignment: {
    agentSessionId?: string;
    campaignLeadId?: string;
    sessionStartedAt?: Date;
  } = {},
): Promise<boolean> {
  const result = await tx.callAttempt.deleteMany({
    where: {
      id,
      ...assignment,
      callId: null,
      status: { in: UNDIALED_ATTEMPT_STATUSES },
    },
  });
  return result.count === 1;
}

/** Every status in which the attempt's call may still be going on. */
const LIVE_ATTEMPT_STATUSES: CallAttemptStatus[] = [
  ...UNDIALED_ATTEMPT_STATUSES,
  CallAttemptStatus.ringing,
  CallAttemptStatus.answered,
  CallAttemptStatus.in_call,
];

export interface CampaignAttemptAssignment {
  attemptId: string;
  lockedBy: string | null;
  lockedAt: Date | null;
  reservedAt: Date | null;
  /** A saved disposition's monotonic revision, or null before its first save. */
  dispositionedAt?: Date | null;
}

export class CampaignAssignmentChangedError extends Error {}

/** Recheck the attempt and assignment under the locks used by outcome saves and lead claims. */
export async function assertCampaignAttemptAssignment(
  tx: Prisma.TransactionClient,
  expected: CampaignAttemptAssignment,
): Promise<void> {
  let attempt = await tx.callAttempt.findUnique({
    where: { id: expected.attemptId },
  });
  if (!attempt) throw new CampaignAssignmentChangedError();
  // Outcome/callback acceptance can insert rows referring to this user. Take
  // that FK lock before the session, matching activation/account cleanup.
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${attempt.agentUserId}::uuid FOR KEY SHARE`;
  const sessions = attempt.agentSessionId
    ? await tx.$queryRaw<
        Array<{
          startedAt: Date;
          reservedAt: Date | null;
          status: string;
          currentLeadId: string | null;
        }>
      >`
    SELECT "startedAt", "reservedAt", "status", "currentLeadId" FROM "AgentSession" WHERE id = ${attempt.agentSessionId}::uuid FOR UPDATE`
    : [];
  // Provider linking shares the session lock. Re-read mutable leg/state fields
  // after waiting for that lock instead of deciding from the earlier snapshot.
  attempt = await tx.callAttempt.findUnique({
    where: { id: expected.attemptId },
  });
  if (!attempt) throw new CampaignAssignmentChangedError();
  const [lead] = await tx.$queryRaw<
    Array<{ lockedBy: string | null; lockedAt: Date | null; status: string }>
  >`
    SELECT "lockedBy", "lockedAt", "status" FROM "CampaignLead" WHERE id = ${attempt.campaignLeadId}::uuid FOR UPDATE`;
  const latest = await tx.callAttempt.findFirst({
    where: { campaignLeadId: attempt.campaignLeadId },
    orderBy: [{ attemptNumber: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  if (
    !lead ||
    latest?.id !== attempt.id ||
    (expected.dispositionedAt !== undefined &&
      attempt.dispositionedAt?.getTime() !==
        expected.dispositionedAt?.getTime())
  )
    throw new CampaignAssignmentChangedError();
  if (lead.lockedBy !== null) {
    const session = sessions[0];
    if (
      lead.lockedBy !== expected.lockedBy ||
      lead.lockedAt?.getTime() !== expected.lockedAt?.getTime() ||
      lead.lockedBy !== attempt.agentSessionId ||
      !session ||
      (attempt.sessionStartedAt !== null &&
        session.startedAt.getTime() !== attempt.sessionStartedAt.getTime()) ||
      session.reservedAt?.getTime() !== expected.reservedAt?.getTime() ||
      (attempt.sessionReservedAt !== null &&
        session.reservedAt?.getTime() !==
          attempt.sessionReservedAt.getTime()) ||
      session.currentLeadId !== attempt.campaignLeadId ||
      session.status === "ready" ||
      (session.status === "reserved" && attempt.callId !== null) ||
      (attempt.sessionReservedAt === null &&
        session.reservedAt !== null &&
        ((session.status === "reserved" &&
          !UNDIALED_ATTEMPT_STATUSES.includes(attempt.status)) ||
          (session.status === "offline" &&
            lead.status === "locked" &&
            !UNDIALED_ATTEMPT_STATUSES.includes(attempt.status))))
    )
      throw new CampaignAssignmentChangedError();
    if (attempt.sessionReservedAt === null && session.reservedAt !== null)
      await tx.callAttempt.updateMany({
        where: { id: attempt.id, sessionReservedAt: null },
        data: { sessionReservedAt: session.reservedAt },
      });
  }
}

export interface CallAttemptWithRelations extends CallAttempt {
  campaignLead: {
    id: string;
    contactId: string;
    contact: {
      id: string;
      name: string | null;
      phoneNumber: string;
      email: string | null;
      company: string | null;
    };
  };
  disposition: {
    id: string;
    code: string;
    label: string;
    category: string;
  } | null;
}

@Injectable()
export class CallAttemptRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    campaignId: string;
    campaignLeadId: string;
    agentSessionId: string;
    agentUserId: string;
    sessionStartedAt: Date;
    reservedAt: Date | null;
    leadLockedAt: Date | null;
    attemptNumber: number;
  }): Promise<CallAttempt | null> {
    return this.prisma.$transaction(async (tx) => {
      const [session] = await tx.$queryRaw<
        Array<{
          startedAt: Date;
          reservedAt: Date | null;
          status: string;
          currentLeadId: string | null;
          campaignId: string;
          userId: string;
        }>
      >`
        SELECT "startedAt", "reservedAt", "status", "currentLeadId", "campaignId", "userId" FROM "AgentSession" WHERE id = ${data.agentSessionId}::uuid FOR UPDATE`;
      if (
        !data.reservedAt ||
        !session ||
        session.status !== "reserved" ||
        session.currentLeadId !== data.campaignLeadId ||
        session.campaignId !== data.campaignId ||
        session.userId !== data.agentUserId ||
        session.startedAt.getTime() !== data.sessionStartedAt.getTime() ||
        session.reservedAt?.getTime() !== data.reservedAt?.getTime()
      )
        return null;
      const [lead] = await tx.$queryRaw<
        Array<{
          lockedBy: string | null;
          lockedAt: Date | null;
          status: string;
        }>
      >`SELECT "lockedBy", "lockedAt", "status" FROM "CampaignLead" WHERE id = ${data.campaignLeadId}::uuid FOR UPDATE`;
      if (
        !data.leadLockedAt ||
        !lead ||
        lead.lockedBy !== data.agentSessionId ||
        lead.lockedAt?.getTime() !== data.leadLockedAt.getTime() ||
        lead.status !== "locked"
      )
        return null;
      return tx.callAttempt.create({
        data: {
          campaign: { connect: { id: data.campaignId } },
          campaignLead: { connect: { id: data.campaignLeadId } },
          agentSession: { connect: { id: data.agentSessionId } },
          agentUserId: data.agentUserId,
          sessionStartedAt: data.sessionStartedAt,
          sessionReservedAt: data.reservedAt,
          attemptNumber: data.attemptNumber,
          status: CallAttemptStatus.created,
        },
      });
    });
  }

  async findById(id: string): Promise<CallAttempt | null> {
    return this.prisma.callAttempt.findUnique({ where: { id } });
  }

  async findByIdWithRelations(
    id: string,
  ): Promise<CallAttemptWithRelations | null> {
    return this.prisma.callAttempt.findFirst({
      where: { id },
      include: {
        campaignLead: {
          include: {
            contact: {
              select: {
                id: true,
                name: true,
                phoneNumber: true,
                email: true,
                company: true,
              },
            },
          },
        },
        disposition: {
          select: { id: true, code: true, label: true, category: true },
        },
      },
    }) as Promise<CallAttemptWithRelations | null>;
  }

  async findByIdWithCampaignOrganization(
    id: string,
  ): Promise<
    (CallAttempt & { campaign: { organizationId: string | null } }) | null
  > {
    return this.prisma.callAttempt.findUnique({
      where: { id },
      include: { campaign: { select: { organizationId: true } } },
    });
  }

  async findByCallId(callId: string): Promise<CallAttempt | null> {
    return this.prisma.callAttempt.findFirst({ where: { callId } });
  }

  async hasLiveCallForSession(agentSessionId: string): Promise<boolean> {
    const count = await this.prisma.callAttempt.count({
      where: { agentSessionId, call: { endedAt: null } },
    });
    return count > 0;
  }

  async findUnconfirmedDialForSession(
    agentSessionId: string,
  ): Promise<CallAttempt | null> {
    const attempts = await this.prisma.$queryRaw<CallAttempt[]>`
      SELECT attempt.* FROM "CallAttempt" attempt
      WHERE attempt."agentSessionId" = ${agentSessionId}::uuid
        AND ${unconfirmedDialSql()}
      ORDER BY attempt."initiatedAt" DESC LIMIT 1`;
    return attempts[0] ?? null;
  }

  async linkCall(attemptId: string, callId: string): Promise<CallAttempt> {
    return this.prisma.callAttempt.update({
      where: { id: attemptId },
      data: { callId, status: CallAttemptStatus.dialing },
    });
  }

  /**
   * The browser has just been told to place this attempt's call. `initiatedAt`
   * moves to this moment: a preview lead can sit on screen for minutes before
   * anyone presses Dial, and the stalled-dial sweep measures from the dial.
   */
  async markDialing(id: string): Promise<boolean> {
    const result = await this.prisma.callAttempt.updateMany({
      where: { id, callId: null, status: CallAttemptStatus.created },
      data: { status: CallAttemptStatus.dialing, initiatedAt: new Date() },
    });
    return result.count === 1;
  }

  /** Bind the provider leg. Only an attempt that has no leg yet accepts one. */
  async linkCallIfUnlinked(id: string, callId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.callAttempt.findUnique({
        where: { id },
        select: {
          agentSessionId: true,
          sessionStartedAt: true,
          campaignLeadId: true,
        },
      });
      if (!attempt) return false;
      if (attempt.agentSessionId) {
        // Replacement takes the same lock before checking for live legs. Its
        // subsequent statement must see a link that committed while it waited.
        const [session] = await tx.$queryRaw<
          Array<{
            startedAt: Date;
            status: string;
            currentLeadId: string | null;
          }>
        >`
          SELECT "startedAt", "status", "currentLeadId" FROM "AgentSession"
          WHERE "id" = ${attempt.agentSessionId}::uuid FOR UPDATE`;
        if (
          !session ||
          (attempt.sessionStartedAt &&
            attempt.sessionStartedAt.getTime() !== session.startedAt.getTime())
        )
          return false;
        if (session.status === "paused") {
          // A provider leg can arrive after a pause. Reclaim its still-held
          // assignment before linking so the live call has a dialer owner.
          if (
            (session.currentLeadId !== null &&
              session.currentLeadId !== attempt.campaignLeadId) ||
            !(await tx.campaignLead.count({
              where: {
                id: attempt.campaignLeadId,
                lockedBy: attempt.agentSessionId,
              },
            }))
          )
            return false;
          const linked = await tx.callAttempt.updateMany({
            where: {
              id,
              callId: null,
              status: { in: UNDIALED_ATTEMPT_STATUSES },
            },
            data: { callId, status: CallAttemptStatus.dialing },
          });
          if (!linked.count) return false;
          await tx.agentSession.update({
            where: { id: attempt.agentSessionId },
            data: { status: "dialing", currentLeadId: attempt.campaignLeadId },
          });
          return true;
        }
      }
      const result = await tx.callAttempt.updateMany({
        where: { id, callId: null, status: { in: UNDIALED_ATTEMPT_STATUSES } },
        data: { callId, status: CallAttemptStatus.dialing },
      });
      return result.count === 1;
    });
  }

  /** Answered — by the leg the attempt is bound to, and only once. */
  async markAnsweredIf(id: string, callId: string): Promise<boolean> {
    const result = await this.prisma.callAttempt.updateMany({
      where: {
        id,
        callId,
        status: {
          in: [...UNDIALED_ATTEMPT_STATUSES, CallAttemptStatus.ringing],
        },
      },
      data: { status: CallAttemptStatus.answered, answeredAt: new Date() },
    });
    return result.count === 1;
  }

  /**
   * End an attempt that is still live. With `callId`, only the leg the attempt
   * is bound to may end it.
   *
   * The hangup webhook and the agent's disposition both end attempts and
   * routinely arrive together. Exactly one of them wins here, and only the
   * winner counts the attempt against the lead in the same transaction.
   */
  async markEndedIf(
    id: string,
    options: { callId?: string; assignment?: CampaignAttemptAssignment } = {},
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      if (options.assignment)
        await assertCampaignAttemptAssignment(tx, options.assignment);
      const attempt = await tx.callAttempt.findUnique({
        where: { id },
        select: { agentSessionId: true, campaignLeadId: true },
      });
      if (!attempt) return false;
      if (attempt.agentSessionId)
        await tx.$queryRaw`
        SELECT "id" FROM "AgentSession" WHERE "id" = ${attempt.agentSessionId}::uuid FOR UPDATE`;
      const result = await tx.callAttempt.updateMany({
        where: {
          id,
          status: { in: LIVE_ATTEMPT_STATUSES },
          ...(options.callId ? { callId: options.callId } : {}),
        },
        data: { status: CallAttemptStatus.ended, endedAt: new Date() },
      });
      if (!result.count) return false;
      const counted = await tx.campaignLead.updateMany({
        where: { id: attempt.campaignLeadId },
        data: { attempts: { increment: 1 }, lastCallAt: new Date() },
      });
      if (counted.count !== 1)
        throw new Error("Call attempt lead no longer exists");
      return true;
    });
  }

  /**
   * What the provider measured about the attempt's call. `durationSec` doubles
   * as the written-once marker, so a redelivered hangup reports false and
   * cannot add the same talk time twice.
   */
  async recordCallMetricsOnce(
    id: string,
    callId: string,
    data: { durationSec: number; hangupCause: string | null },
  ): Promise<boolean> {
    const result = await this.prisma.callAttempt.updateMany({
      where: { id, callId, durationSec: null },
      data,
    });
    return result.count === 1;
  }

  /**
   * Remove an attempt that never produced a provider leg: a dial that was
   * refused, abandoned by the browser, or a preview lead that was skipped.
   * It was not an attempt to reach anyone, and left behind it would count in
   * every campaign rate.
   */
  async deleteUndialed(id: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.callAttempt.findUnique({
        where: { id },
        select: { agentSessionId: true },
      });
      if (!attempt) return false;
      if (attempt.agentSessionId)
        await tx.$queryRaw`
        SELECT "id" FROM "AgentSession" WHERE "id" = ${attempt.agentSessionId}::uuid FOR UPDATE`;
      return deleteUndialedAttempt(tx, id);
    });
  }

  /** The not-yet-dialed attempt an agent session holds for its current lead. */
  async findUndialedForSession(
    agentSessionId: string,
    campaignLeadId: string,
  ): Promise<CallAttempt | null> {
    return this.prisma.callAttempt.findFirst({
      where: {
        agentSessionId,
        campaignLeadId,
        callId: null,
        status: { in: UNDIALED_ATTEMPT_STATUSES },
      },
      orderBy: { initiatedAt: "desc" },
    });
  }

  async updateStatus(
    id: string,
    status: CallAttemptStatus,
    extra?: Partial<
      Pick<
        CallAttempt,
        | "ringStartedAt"
        | "answeredAt"
        | "endedAt"
        | "hangupCause"
        | "durationSec"
      >
    >,
  ): Promise<CallAttempt> {
    return this.prisma.callAttempt.update({
      where: { id },
      data: { status, ...extra },
    });
  }

  /**
   * Legacy writes require an ended attempt. Accepted human outcomes may also
   * finish a retried wrap-up or correct a disposition; the locked canonical
   * call revision fences older concurrent requests.
   */
  async setDisposition(
    attemptId: string,
    data: {
      dispositionId: string;
      dispositionCode: string;
      dispositionNote?: string;
      dispositionOutcome?: CallOutcome | null;
    },
    source?: { callId: string; revision: number },
    assignment?: CampaignAttemptAssignment,
  ): Promise<CallAttempt | null> {
    return this.prisma.$transaction(async (tx) => {
      if (source) {
        await tx.$queryRaw`SELECT "id" FROM "Call" WHERE "id" = ${source.callId}::uuid FOR UPDATE`;
        if (
          !(await tx.call.count({
            where: {
              id: source.callId,
              outcomeRevision: source.revision,
              dispositionId: data.dispositionId,
            },
          }))
        )
          return null;
      }
      if (assignment)
        await assertCampaignAttemptAssignment(tx, {
          ...assignment,
          dispositionedAt: undefined,
        });
      const previous = await tx.callAttempt.findUnique({
        where: { id: attemptId },
      });
      if (!previous) return null;
      // Identical accepted canonical saves share their existing revision. A
      // changed save must still compare-and-set the revision it originally read.
      if (
        source &&
        previous.status === CallAttemptStatus.dispositioned &&
        previous.dispositionId === data.dispositionId &&
        previous.dispositionCode === data.dispositionCode &&
        (data.dispositionNote === undefined ||
          previous.dispositionNote === data.dispositionNote) &&
        previous.dispositionOutcome === (data.dispositionOutcome ?? null)
      )
        return previous;
      if (
        assignment?.dispositionedAt !== undefined &&
        previous.dispositionedAt?.getTime() !==
          assignment.dispositionedAt?.getTime()
      )
        return null;
      const result = await tx.callAttempt.updateMany({
        where: {
          id: attemptId,
          dispositionedAt: previous.dispositionedAt,
          ...(source ? { callId: source.callId } : {}),
          status: source
            ? { in: [CallAttemptStatus.ended, CallAttemptStatus.dispositioned] }
            : CallAttemptStatus.ended,
        },
        data: {
          status: CallAttemptStatus.dispositioned,
          dispositionId: data.dispositionId,
          dispositionCode: data.dispositionCode,
          dispositionNote: data.dispositionNote,
          dispositionOutcome: data.dispositionOutcome ?? null,
          dispositionedAt: new Date(
            Math.max(
              Date.now(),
              (previous.dispositionedAt?.getTime() ?? 0) + 1,
            ),
          ),
        },
      });
      if (result.count === 0) return null;
      return tx.callAttempt.findUnique({ where: { id: attemptId } });
    });
  }

  async findByCampaignLead(campaignLeadId: string): Promise<CallAttempt[]> {
    return this.prisma.callAttempt.findMany({
      where: { campaignLeadId },
      orderBy: { initiatedAt: "desc" },
    });
  }

  async findByAgentSession(agentSessionId: string): Promise<CallAttempt[]> {
    return this.prisma.callAttempt.findMany({
      where: { agentSessionId },
      orderBy: { initiatedAt: "desc" },
    });
  }

  async countByCampaign(campaignId: string): Promise<number> {
    return this.prisma.callAttempt.count({ where: { campaignId } });
  }
}
