import {
  lockFollowUp,
  observeFollowUp,
  appendFollowUpEvent,
} from "./pending-action-follow-up.persistence";
import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma.service";
import {
  CallbackAgentKind,
  CallbackTask,
  CallbackStatus,
  Prisma,
} from "@prisma/client";

export interface CallbackTaskWithContext extends CallbackTask {
  contact: {
    id: string;
    name: string | null;
    phoneNumber: string;
    company: string | null;
  };
  campaignLead: {
    id: string;
    campaignId: string;
    campaign: { id: string; name: string };
  } | null;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    imageUrl: string | null;
  };
}

export interface CallbackOwnerFilter {
  userId: string;
  organizationId?: string | null;
}

/** A callback one user still owes, with who to call. */
export interface OwedCallback {
  id: string;
  scheduledAt: Date;
  note: string | null;
  contact: {
    id: string;
    name: string | null;
    phoneNumber: string;
    company: string | null;
    timezone: string | null;
    deletedAt: Date | null;
  };
}

export interface CreateCallbackTaskInput {
  id?: string;
  userId: string;
  organizationId?: string | null;
  contactId: string;
  callId?: string | null;
  campaignLeadId?: string | null;
  scheduledAt: Date;
  note?: string;
}

/** A callback an AI voice agent places itself, for a handoff request. */
export interface CreateAgentCallbackInput extends CreateCallbackTaskInput {
  organizationId: string;
  agentCallbackKind: CallbackAgentKind;
  agentId: string;
  handoffId: string;
  /** Replay-safe creation key: the same key returns the same row. */
  agentCallbackKey: string;
}

/** Open, as far as the callback worker is concerned. */
const OPEN_CALLBACK_STATUSES: CallbackStatus[] = [
  CallbackStatus.scheduled,
  CallbackStatus.due,
  CallbackStatus.in_progress,
];

@Injectable()
export class CallbackTaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateCallbackTaskInput): Promise<CallbackTask> {
    return this.prisma.callbackTask.create({
      data: {
        id: data.id,
        userId: data.userId,
        organizationId: data.organizationId ?? null,
        contactId: data.contactId,
        callId: data.callId ?? null,
        campaignLeadId: data.campaignLeadId ?? null,
        scheduledAt: data.scheduledAt,
        note: data.note,
      },
    });
  }

  /**
   * Creates a callback under a deterministic id and recovers the existing row
   * when the provider replays the same tool call concurrently.
   */
  async createOnce(
    data: CreateCallbackTaskInput & { id: string },
  ): Promise<{ callback: CallbackTask; created: boolean }> {
    try {
      return { callback: await this.create(data), created: true };
    } catch (error) {
      const target =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? error.meta?.target
          : null;
      const duplicateId =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        Array.isArray(target) &&
        target.includes("id");
      if (!duplicateId) throw error;

      const existing = await this.findById(data.id);
      if (!existing) throw error;
      return { callback: existing, created: false };
    }
  }

  /**
   * Creates an agent callback under its creation key, and returns the row a
   * replayed tool call already created instead of a second callback.
   */
  async createAgentCallbackOnce(
    data: CreateAgentCallbackInput,
  ): Promise<{ callback: CallbackTask; created: boolean }> {
    try {
      const callback = await this.prisma.$transaction(async (tx) => {
        // Creation and suspension use the same order and lock. A callback
        // cannot appear after pause/closure under an old service decision.
        await tx.$queryRaw`SELECT "id" FROM "AiVoiceAgentHandoff" WHERE "id" = ${data.handoffId}::uuid FOR UPDATE`;
        const handoff = await tx.aiVoiceAgentHandoff.findUnique({
          where: { id: data.handoffId },
        });
        if (
          !handoff ||
          handoff.organizationId !== data.organizationId ||
          handoff.userId !== data.userId ||
          handoff.contactId !== data.contactId ||
          handoff.destinationAgentId !== data.agentId
        )
          throw new Error("Callback source mismatch");
        const seed = await tx.pendingActionFollowUp.findUnique({
          where: { handoffId: data.handoffId },
        });
        const objective = seed ? await lockFollowUp(tx, seed.id) : null;
        const existing = await tx.callbackTask.findUnique({
          where: { agentCallbackKey: data.agentCallbackKey },
        });
        if (existing) return existing;
        if (
          objective &&
          (objective.mode !== "automatic" ||
            ["paused", "blocked", "resolved", "closed"].includes(
              objective.state,
            ))
        )
          throw new Error("Follow-up is not accepting automatic work");
        if (
          objective &&
          (objective.attemptCount >= objective.maxAttempts ||
            (data.agentCallbackKind === "recovery" &&
              objective.recoveryCount >= objective.maxRecoveries))
        )
          throw new Error("Follow-up contact policy exhausted");
        const created = await tx.callbackTask.create({
          data: {
            followUpId: objective?.id,
            userId: data.userId,
            organizationId: data.organizationId,
            contactId: data.contactId,
            callId: data.callId ?? null,
            scheduledAt: data.scheduledAt,
            note: data.note,
            agentCallbackKind: data.agentCallbackKind,
            agentId: data.agentId,
            handoffId: data.handoffId,
            agentCallbackKey: data.agentCallbackKey,
          },
        });
        await observeFollowUp(tx, data.handoffId, {
          key: `callback:${created.id}:scheduled`,
          kind:
            data.agentCallbackKind === "agreed"
              ? "callback_agreed"
              : "recovery_scheduled",
          actorType: data.agentCallbackKind === "agreed" ? "agent" : "system",
          actorId: data.agentId,
          evidence: {
            callbackId: created.id,
            scheduledAt: data.scheduledAt.toISOString(),
            timingBasis:
              data.agentCallbackKind === "agreed" ? "agreed" : "policy",
          },
        });
        return created;
      });
      return { callback, created: true };
    } catch (error) {
      const target =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? error.meta?.target
          : null;
      const duplicateKey =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        (Array.isArray(target)
          ? target.includes("agentCallbackKey")
          : String(target ?? "").includes("agentCallbackKey"));
      if (!duplicateKey) throw error;
      const existing = await this.prisma.callbackTask.findUnique({
        where: { agentCallbackKey: data.agentCallbackKey },
      });
      if (!existing) throw error;
      return { callback: existing, created: false };
    }
  }

  async findById(id: string): Promise<CallbackTask | null> {
    return this.prisma.callbackTask.findUnique({ where: { id } });
  }

  /**
   * List callbacks visible to the given owner context.
   * - Org context: returns every callback in the organization.
   * - Freelancer context: returns the user's personal callbacks (organizationId IS NULL).
   */
  async listForOwner(
    owner: CallbackOwnerFilter,
    options?: {
      status?: CallbackStatus;
      page?: number;
      limit?: number;
      /** Narrow an org-wide list to a single member's callbacks. */
      userId?: string;
      /** Only callbacks scheduled at or after this instant. */
      scheduledFrom?: Date;
      /** Only callbacks scheduled at or before this instant. */
      scheduledTo?: Date;
    },
  ): Promise<{
    data: CallbackTaskWithContext[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const {
      status,
      page = 1,
      limit = 20,
      userId,
      scheduledFrom,
      scheduledTo,
    } = options || {};

    const where: Prisma.CallbackTaskWhereInput = {
      ...(owner.organizationId
        ? { organizationId: owner.organizationId }
        : { userId: owner.userId, organizationId: null }),
      ...(userId ? { userId } : {}),
      ...(status ? { status } : {}),
      ...(scheduledFrom || scheduledTo
        ? {
            scheduledAt: {
              ...(scheduledFrom ? { gte: scheduledFrom } : {}),
              ...(scheduledTo ? { lte: scheduledTo } : {}),
            },
          }
        : {}),
    };

    const total = await this.prisma.callbackTask.count({ where });
    const data = await this.prisma.callbackTask.findMany({
      where,
      // The worker's fencing token is not something a client may see.
      omit: { claimToken: true },
      include: {
        contact: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            company: true,
          },
        },
        campaignLead: {
          select: {
            id: true,
            campaignId: true,
            campaign: { select: { id: true, name: true } },
          },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            imageUrl: true,
          },
        },
      },
      orderBy: { scheduledAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: data as CallbackTaskWithContext[],
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * The callbacks one user still owes in a workspace, scheduled up to
   * `scheduledTo` — overdue ones included, soonest first. Campaign callbacks
   * are left out: when one comes due the campaign re-queues its lead, so a
   * manual call as well would reach the contact twice.
   */
  async listOwedByUser(
    owner: CallbackOwnerFilter,
    options: { scheduledTo: Date; limit: number },
  ): Promise<OwedCallback[]> {
    return this.prisma.callbackTask.findMany({
      where: {
        userId: owner.userId,
        organizationId: owner.organizationId ?? null,
        status: { in: [CallbackStatus.scheduled, CallbackStatus.due] },
        campaignLeadId: null,
        // A callback assigned to an AI voice agent is placed by the agent: a
        // person calling as well would reach the contact twice (CALL-013).
        agentCallbackKind: null,
        scheduledAt: { lte: options.scheduledTo },
      },
      select: {
        id: true,
        scheduledAt: true,
        note: true,
        contact: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            company: true,
            timezone: true,
            deletedAt: true,
          },
        },
      },
      orderBy: { scheduledAt: "asc" },
      take: options.limit,
    });
  }

  /**
   * Which of `contactIds` have a callback still open in the workspace —
   * anyone's, whenever it is scheduled, campaign and voice agent ones
   * included, and one being placed right now: the next call to them is
   * already agreed.
   */
  async findContactsWithOpenCallback(
    workspace: { userId?: string; organizationId?: string | null },
    contactIds: string[],
  ): Promise<Set<string>> {
    if (contactIds.length === 0) return new Set();
    const rows = await this.prisma.callbackTask.findMany({
      where: {
        ...workspace,
        contactId: { in: contactIds },
        status: {
          in: [
            CallbackStatus.scheduled,
            CallbackStatus.due,
            CallbackStatus.in_progress,
          ],
        },
      },
      select: { contactId: true },
      distinct: ["contactId"],
    });
    const assigned = await this.prisma.pendingAction.findMany({
      where: {
        ...workspace,
        contactId: { in: contactIds },
        followUp: { is: { state: { notIn: ["resolved", "closed"] } } },
      },
      select: { contactId: true },
    });
    return new Set([
      ...rows.map((row) => row.contactId),
      ...assigned.flatMap((row) => (row.contactId ? [row.contactId] : [])),
    ]);
  }

  /**
   * Person and legacy agent callbacks that are due. Agent callbacks for a
   * handoff request are claimed apart, under a lease (`claimDueAgentCallbacks`).
   */
  async findDue(): Promise<CallbackTask[]> {
    return this.prisma.callbackTask.findMany({
      where: {
        status: CallbackStatus.scheduled,
        scheduledAt: { lte: new Date() },
        agentCallbackKind: null,
      },
      orderBy: { scheduledAt: "asc" },
    });
  }

  /**
   * Claims the agent callbacks that are due, plus any whose worker died
   * holding the lease (AGENT-021).
   *
   * One statement with `FOR UPDATE SKIP LOCKED`, so concurrent ticks split
   * the work. A reclaimed row keeps its `dialTries`: the service reconciles an
   * earlier try by its key before it would ever dial again.
   */
  claimDueAgentCallbacks(
    now: Date,
    leaseUntil: Date,
    limit: number,
  ): Promise<CallbackTask[]> {
    return this.prisma.$queryRaw<CallbackTask[]>`
      UPDATE "CallbackTask"
      SET "status" = 'in_progress'::"CallbackStatus",
          "claimToken" = ${randomUUID()}::uuid,
          "leaseExpiresAt" = (${leaseUntil}::timestamptz AT TIME ZONE 'UTC'),
          "attemptCount" = "attemptCount" + 1,
          "updatedAt" = (now() AT TIME ZONE 'UTC')
      WHERE "id" IN (
        SELECT "id"
        FROM "CallbackTask"
        WHERE "agentCallbackKind" IS NOT NULL
          AND ("followUpId" IS NULL OR "dispatchCommittedAt" IS NOT NULL OR EXISTS (
            SELECT 1 FROM "PendingActionFollowUp" f
            WHERE f."id" = "CallbackTask"."followUpId" AND f."mode" = 'automatic'
              AND f."state" IN ('scheduled', 'in_progress', 'waiting', 'recovering')
              AND f."expiresAt" > (${now}::timestamptz AT TIME ZONE 'UTC')
          ))
          AND (
            ("status" IN ('scheduled', 'due')
              AND "scheduledAt" <= (${now}::timestamptz AT TIME ZONE 'UTC')
              AND ("notBefore" IS NULL
                OR "notBefore" <= (${now}::timestamptz AT TIME ZONE 'UTC')))
            OR ("status" = 'in_progress'
              AND "leaseExpiresAt" < (${now}::timestamptz AT TIME ZONE 'UTC'))
          )
        ORDER BY "scheduledAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `;
  }

  /**
   * Reserves the next dial key of a claimed agent callback. A reclaimed
   * reservation keeps the same try number, so its key stays the same.
   */
  async beginAgentDial(
    id: string,
    claimToken: string,
    now: Date,
    leaseUntil: Date,
  ): Promise<CallbackTask | null> {
    const where = {
      id,
      status: CallbackStatus.in_progress,
      claimToken,
      leaseExpiresAt: { gt: now },
    };
    const [row] = await this.prisma.callbackTask.updateManyAndReturn({
      where: { ...where, dialReservedAt: null },
      data: {
        dialTries: { increment: 1 },
        dialReservedAt: now,
        leaseExpiresAt: leaseUntil,
      },
    });
    return row ?? this.prisma.callbackTask.findFirst({ where });
  }

  /** Serialized with objective controls and source versions. Committed steps
   * remain recoverable even when a person pauses/closes the objective next. */
  async commitFollowUpDispatch(input: {
    callbackId: string;
    claimToken: string;
    followUpId: string;
    expectedRevision: number;
    agentId: string;
    meetingId?: string;
    meetingVersion?: number;
    contactUpdatedAt?: Date;
    to: string;
    placement: { agentCallId: string; callId: string };
    now: Date;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      if (input.meetingId)
        await tx.$queryRaw`SELECT "id" FROM "Meeting" WHERE "id" = ${input.meetingId}::uuid FOR UPDATE`;
      const seed = await tx.pendingActionFollowUp.findUnique({
        where: { id: input.followUpId },
        include: { handoff: true, action: true },
      });
      if (seed?.sourceType === "human_call_outcome") {
        if (seed.action.contactId)
          await tx.$queryRaw`SELECT "id" FROM "Contact" WHERE "id" = ${seed.action.contactId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "Call" WHERE "id" = ${seed.sourceId}::uuid FOR UPDATE`;
      }
      const automationId = seed?.handoff?.automationId ?? seed?.automationId;
      if (automationId)
        await tx.$queryRaw`SELECT "id" FROM "AiVoiceAgentAutomation" WHERE "id" = ${automationId}::uuid FOR UPDATE`;
      const objective = await lockFollowUp(tx, input.followUpId);
      // Read after the lock: an objective that expired while this waited for
      // it is not dispatched on the time the caller read before.
      const lockedAt = new Date();
      // A database wait must not carry an expired calling-window decision to the provider.
      if (lockedAt.getTime() - input.now.getTime() > 30_000) return false;
      if (
        !objective ||
        objective.revision !== input.expectedRevision ||
        objective.mode !== "automatic" ||
        !["scheduled", "in_progress", "waiting", "recovering"].includes(
          objective.state,
        ) ||
        objective.expiresAt <= lockedAt ||
        objective.agentId !== input.agentId
      )
        return false;
      const action = await tx.pendingAction.findUniqueOrThrow({
        where: { id: objective.pendingActionId },
      });
      const handoff = objective.handoffId
        ? await tx.aiVoiceAgentHandoff.findUnique({
            where: { id: objective.handoffId },
          })
        : null;
      const human = objective.sourceType === "human_call_outcome";
      if (
        !human &&
        (!handoff ||
          handoff.requestStatus !== "pending" ||
          handoff.organizationId !== action.organizationId)
      )
        return false;
      const meeting = input.meetingId
        ? await tx.meeting.findFirst({
            where: {
              id: input.meetingId,
              organizationId: action.organizationId,
              contactId: action.contactId!,
              scheduleVersion: input.meetingVersion,
            },
          })
        : null;
      const automation = await tx.aiVoiceAgentAutomation.findFirst({
        where: {
          id: automationId ?? "00000000-0000-0000-0000-000000000000",
          organizationId: action.organizationId!,
          enabled: true,
          agentId: input.agentId,
        },
      });
      const agent = await tx.aiVoiceAgent.findFirst({
        where: {
          id: input.agentId,
          organizationId: action.organizationId,
          status: "active",
          deletedAt: null,
          providerAssistantId: { not: null },
          toolSecretHash: { not: null },
        },
      });
      const contact = await tx.contact.findFirst({
        where: {
          id: action.contactId!,
          organizationId: action.organizationId,
          deletedAt: null,
          ...(input.contactUpdatedAt
            ? { updatedAt: input.contactUpdatedAt }
            : {}),
        },
      });
      const members = await tx.organizationMembership.findMany({
        where: {
          organizationId: action.organizationId!,
          userId: {
            in: [objective.configuredByUserId, objective.responsibleUserId],
          },
        },
        select: { userId: true },
      });
      const user = await tx.user.findFirst({
        where: {
          id: objective.configuredByUserId,
          canCall: true,
          blockedAt: null,
        },
      });
      const onDnc = await tx.dNCEntry.findFirst({
        where: { organizationId: action.organizationId, phoneNumber: input.to },
        select: { id: true },
      });
      if (
        (!human && !meeting) ||
        !automation ||
        !agent ||
        !contact ||
        !user ||
        onDnc ||
        ![objective.configuredByUserId, objective.responsibleUserId].every(
          (id) => members.some((member) => member.userId === id),
        )
      )
        return false;
      if (
        objective.activeCallbackId &&
        objective.activeCallbackId !== input.callbackId
      )
        return false;
      const callback = await tx.callbackTask.findFirst({
        where: {
          id: input.callbackId,
          followUpId: objective.id,
          handoffId: handoff?.id ?? null,
          agentId: input.agentId,
          claimToken: input.claimToken,
          status: "in_progress",
          leaseExpiresAt: { gt: input.now },
        },
      });
      if (!callback || callback.dispatchCommittedAt) return false;
      if (human) {
        const source = await tx.call.findFirst({
          where: {
            id: objective.sourceId,
            organizationId: action.organizationId,
            userId: objective.responsibleUserId,
            contactId: action.contactId,
            outcomeRevision: objective.sourceRevision,
            OR: [{ source: null }, { source: { not: "ai_voice_agent" } }],
          },
        });
        const settings = automation.settings as {
          humanFollowUp?: { enabled?: boolean };
        } | null;
        const calendar = objective.calendarId
          ? await tx.calendar.findFirst({
              where: {
                id: objective.calendarId,
                organizationId: action.organizationId,
                archivedAt: null,
              },
            })
          : null;
        if (
          !source ||
          !calendar ||
          settings?.humanFollowUp?.enabled !== true ||
          callback.sourceRevision !== objective.sourceRevision ||
          objective.objectiveType !== "book_meeting"
        )
          return false;
        // Other committed executions retain contact ownership even when a newer
        // source revision supersedes their objective.
        const active = await tx.callbackTask.findFirst({
          where: {
            id: { not: callback.id },
            organizationId: action.organizationId,
            contactId: action.contactId!,
            dispatchCommittedAt: { not: null },
            agentCall: {
              is: {
                OR: [
                  {
                    status: {
                      in: ["created", "initiating", "ringing", "in_progress"],
                    },
                  },
                  { providerCallControlId: null, status: { not: "failed" } },
                ],
              },
            },
          },
        });
        if (
          active ||
          (await tx.campaignLead.count({
            where: {
              contactId: action.contactId!,
              campaign: { organizationId: action.organizationId },
              lockedBy: { not: null },
              status: { in: ["locked", "dialing", "in_call", "wrap_up"] },
            },
          }))
        )
          return false;
      }

      const firstAttempt = callback.objectiveAttempt === null;
      if (
        firstAttempt &&
        (objective.attemptCount >= objective.maxAttempts ||
          (callback.agentCallbackKind === "recovery" &&
            objective.recoveryCount >= objective.maxRecoveries))
      )
        return false;
      const placedRow = await tx.aiVoiceAgentCall.findFirst({
        where: {
          id: input.placement.agentCallId,
          callId: input.placement.callId,
          organizationId: action.organizationId,
          userId: objective.configuredByUserId,
          agentId: input.agentId,
          toNumber: input.to,
        },
      });
      if (!placedRow) return false;
      if (human)
        await tx.aiVoiceAgentCall.update({
          where: { id: placedRow.id },
          data: { calendarId: objective.calendarId },
        });
      // Claims can be reclaimed without locking the objective. Fence the write
      // itself, not just the preceding read, against that newer worker.
      const committed = await tx.callbackTask.updateMany({
        where: {
          id: callback.id,
          claimToken: input.claimToken,
          status: "in_progress",
          leaseExpiresAt: { gt: new Date() },
          dispatchCommittedAt: null,
        },
        data: {
          dispatchCommittedAt: input.now,
          objectiveAttempt:
            callback.objectiveAttempt ?? objective.attemptCount + 1,
          agentCallId: input.placement.agentCallId,
        },
      });
      if (committed.count !== 1) return false;
      const updated = await tx.pendingActionFollowUp.update({
        where: { id: objective.id },
        data: {
          state: "in_progress",
          reason: "dispatch_committed",
          activeCallbackId: callback.id,
          nextAction: "reconcile_call",
          nextActionAt: new Date(input.now.getTime() + 5 * 60_000),
          revision: { increment: 1 },
          lastActionAt: input.now,
          ...(firstAttempt
            ? {
                attemptCount: { increment: 1 },
                ...(callback.agentCallbackKind === "recovery"
                  ? { recoveryCount: { increment: 1 } }
                  : {}),
              }
            : {}),
        },
      });
      await appendFollowUpEvent(tx, updated, {
        key: `callback:${callback.id}:d${callback.dialTries}:dispatch`,
        kind: "dispatch_committed",
        actorType: "agent",
        actorId: input.agentId,
        evidence: {
          callbackId: callback.id,
          attempt: callback.objectiveAttempt ?? objective.attemptCount + 1,
        },
        at: input.now,
      });
      return true;
    });
  }

  /** The dial's commit point: still this worker's, still in its lease. */
  async holdsAgentClaim(
    id: string,
    claimToken: string,
    now: Date,
  ): Promise<boolean> {
    const count = await this.prisma.callbackTask.count({
      where: {
        id,
        status: CallbackStatus.in_progress,
        claimToken,
        leaseExpiresAt: { gt: now },
      },
    });
    return count === 1;
  }

  /** Ends a claimed agent callback, only while the claim is still this one. */
  async finishAgentCallback(
    id: string,
    claimToken: string,
    status: CallbackStatus,
    data: {
      reason?: string | null;
      lastError?: string | null;
      agentCallId?: string | null;
      now: Date;
    },
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const seed = await tx.callbackTask.findUnique({ where: { id } });
      if (seed?.followUpId) await lockFollowUp(tx, seed.followUpId);
      const { count } = await tx.callbackTask.updateMany({
        where: { id, status: CallbackStatus.in_progress, claimToken },
        data: {
          status,
          claimToken: null,
          leaseExpiresAt: null,
          ...(status === CallbackStatus.completed
            ? { completedAt: data.now }
            : {}),
          ...(data.reason ? { reason: data.reason } : {}),
          ...(data.lastError
            ? { lastError: data.lastError.slice(0, 2000) }
            : {}),
          ...(data.agentCallId ? { agentCallId: data.agentCallId } : {}),
        },
      });
      if (count && seed?.handoffId)
        await observeFollowUp(tx, seed.handoffId, {
          key: `callback:${id}:d${seed.dialTries}:finished:${status}`,
          kind: "callback_finished",
          evidence: { callbackId: id, status, reason: data.reason ?? null },
          at: data.now,
        });
      return count === 1;
    });
  }

  /** Hands a claimed agent callback back for later — a deferral. */
  async deferAgentCallback(
    id: string,
    claimToken: string,
    notBefore: Date,
    reason: string,
    unplaced = false,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const seed = await tx.callbackTask.findUnique({ where: { id } });
      if (seed?.followUpId) await lockFollowUp(tx, seed.followUpId);
      const { count } = await tx.callbackTask.updateMany({
        where: { id, status: CallbackStatus.in_progress, claimToken },
        data: {
          status: CallbackStatus.scheduled,
          claimToken: null,
          leaseExpiresAt: null,
          notBefore,
          reason,
          ...(unplaced
            ? { dialReservedAt: null, dispatchCommittedAt: null }
            : {}),
        },
      });
      if (count && seed?.handoffId)
        await observeFollowUp(tx, seed.handoffId, {
          key: `callback:${id}:d${seed.dialTries}:deferred:${reason}:${notBefore.getTime()}`,
          kind: "callback_deferred",
          evidence: {
            callbackId: id,
            reason,
            notBefore: notBefore.toISOString(),
          },
        });
      return count === 1;
    });
  }

  /** The agent callbacks of one handoff request, newest first. */
  listForHandoff(handoffId: string): Promise<CallbackTask[]> {
    return this.prisma.callbackTask.findMany({
      where: { handoffId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Withdraws what a request still has scheduled, once the request no longer
   * needs it. A callback a worker is placing right now is left to its claim.
   */
  async cancelOpenForHandoff(
    handoffId: string,
    reason: string,
  ): Promise<number> {
    const { count } = await this.prisma.callbackTask.updateMany({
      where: {
        handoffId,
        status: { in: [CallbackStatus.scheduled, CallbackStatus.due] },
      },
      data: { status: CallbackStatus.cancelled, reason },
    });
    return count;
  }

  /** Whether the request has a callback still to be placed or being placed. */
  async hasOpenForHandoff(handoffId: string): Promise<boolean> {
    const count = await this.prisma.callbackTask.count({
      where: { handoffId, status: { in: OPEN_CALLBACK_STATUSES } },
    });
    return count > 0;
  }

  /**
   * Atomically claims an automated callback before it starts a billable call.
   * A retried scheduler tick therefore cannot place the same callback twice.
   */
  async claimScheduled(id: string): Promise<CallbackTask | null> {
    const [claimed] = await this.prisma.callbackTask.updateManyAndReturn({
      where: {
        id,
        status: CallbackStatus.scheduled,
        scheduledAt: { lte: new Date() },
      },
      data: {
        status: CallbackStatus.in_progress,
        attemptCount: { increment: 1 },
      },
    });
    return claimed ?? null;
  }

  /** Resolve an automated callback claim without touching an unclaimed row. */
  async updateClaimed(
    id: string,
    data: {
      status: CallbackStatus;
      completedAt?: Date;
    },
  ): Promise<CallbackTask | null> {
    const [updated] = await this.prisma.callbackTask.updateManyAndReturn({
      where: { id, status: CallbackStatus.in_progress },
      data,
    });
    return updated ?? null;
  }

  /** The equivalent CAS for callbacks that only become due for a human. */
  async markDueIfScheduled(id: string): Promise<CallbackTask | null> {
    const [updated] = await this.prisma.callbackTask.updateManyAndReturn({
      where: {
        id,
        status: CallbackStatus.scheduled,
        scheduledAt: { lte: new Date() },
      },
      data: { status: CallbackStatus.due },
    });
    return updated ?? null;
  }

  /**
   * Cancels a callback unless a worker is placing it right now. The status is
   * compared in the write itself: a claim taken after the caller read the row
   * is never overwritten, so a call already ringing cannot be followed by a
   * second one. Null when the row was being placed.
   */
  async cancelUnlessBeingPlaced(id: string): Promise<CallbackTask | null> {
    const [cancelled] = await this.prisma.callbackTask.updateManyAndReturn({
      where: { id, status: { not: CallbackStatus.in_progress } },
      data: { status: CallbackStatus.cancelled },
    });
    return cancelled ?? null;
  }

  /**
   * Moves an agent callback only while its status still matches the read —
   * compare-and-set, like `beginAgentDial`. A new time is a new dial:
   * the dial and claim state start over, so the next try draws
   * keys of its own. Null when the status changed in the meantime.
   */
  async rescheduleAgentCallback(
    id: string,
    scheduledAt: Date,
    expectedStatus: CallbackStatus,
  ): Promise<CallbackTask | null> {
    return this.prisma.$transaction(async (tx) => {
      const seed = await tx.callbackTask.findUnique({ where: { id } });
      const objective = seed?.followUpId
        ? await lockFollowUp(tx, seed.followUpId)
        : null;
      if (
        objective &&
        (objective.mode !== "automatic" ||
          ["paused", "blocked", "resolved", "closed"].includes(objective.state))
      )
        return null;
      const [moved] = await tx.callbackTask.updateManyAndReturn({
        where: {
          id,
          agentCallbackKind: { not: null },
          dispatchCommittedAt: null,
          status: expectedStatus,
          ...(expectedStatus === "completed" ? { followUpId: null } : {}),
        },
        data: {
          scheduledAt,
          status: CallbackStatus.scheduled,
          completedAt: null,
          attemptCount: 0,
          notBefore: null,
          dialTries: 0,
          dialReservedAt: null,
          claimToken: null,
          leaseExpiresAt: null,
          reason: null,
        },
      });
      if (moved?.handoffId)
        await observeFollowUp(tx, moved.handoffId, {
          key: `callback:${id}:rescheduled:${scheduledAt.getTime()}`,
          kind: "callback_agreed",
          evidence: {
            callbackId: id,
            scheduledAt: scheduledAt.toISOString(),
            timingBasis: "agreed",
          },
        });
      return moved ?? null;
    });
  }

  async completeUnlessBeingPlaced(id: string): Promise<CallbackTask | null> {
    const [completed] = await this.prisma.callbackTask.updateManyAndReturn({
      where: { id, status: { not: CallbackStatus.in_progress } },
      data: { status: CallbackStatus.completed, completedAt: new Date() },
    });
    return completed ?? null;
  }

  async updateStatus(
    id: string,
    status: CallbackStatus,
    completedAt?: Date,
  ): Promise<CallbackTask> {
    return this.prisma.callbackTask.update({
      where: { id },
      data: { status, ...(completedAt ? { completedAt } : {}) },
    });
  }

  async update(
    id: string,
    data: Partial<
      Pick<
        CallbackTask,
        | "scheduledAt"
        | "note"
        | "status"
        | "completedAt"
        | "attemptCount"
        | "notBefore"
        | "dialTries"
        | "dialReservedAt"
        | "claimToken"
        | "leaseExpiresAt"
        | "reason"
      >
    >,
  ): Promise<CallbackTask> {
    return this.prisma.callbackTask.update({ where: { id }, data });
  }

  async findByCampaignLead(campaignLeadId: string): Promise<CallbackTask[]> {
    return this.prisma.callbackTask.findMany({
      where: { campaignLeadId },
      orderBy: { scheduledAt: "desc" },
    });
  }

  async findByContact(contactId: string): Promise<CallbackTask[]> {
    return this.prisma.callbackTask.findMany({
      where: { contactId },
      orderBy: { scheduledAt: "desc" },
    });
  }
}
