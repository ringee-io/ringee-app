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
      const callback = await this.prisma.callbackTask.create({
        data: {
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
    return new Set(rows.map((row) => row.contactId));
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
    const { count } = await this.prisma.callbackTask.updateMany({
      where: { id, status: CallbackStatus.in_progress, claimToken },
      data: {
        status,
        claimToken: null,
        leaseExpiresAt: null,
        ...(status === CallbackStatus.completed
          ? { completedAt: data.now }
          : {}),
        ...(data.reason ? { reason: data.reason } : {}),
        ...(data.lastError ? { lastError: data.lastError.slice(0, 2000) } : {}),
        ...(data.agentCallId ? { agentCallId: data.agentCallId } : {}),
      },
    });
    return count === 1;
  }

  /** Hands a claimed agent callback back for later — a deferral. */
  async deferAgentCallback(
    id: string,
    claimToken: string,
    notBefore: Date,
    reason: string,
    unplaced = false,
  ): Promise<boolean> {
    const { count } = await this.prisma.callbackTask.updateMany({
      where: { id, status: CallbackStatus.in_progress, claimToken },
      data: {
        status: CallbackStatus.scheduled,
        claimToken: null,
        leaseExpiresAt: null,
        notBefore,
        reason,
        ...(unplaced ? { dialReservedAt: null } : {}),
      },
    });
    return count === 1;
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
