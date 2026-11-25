import { Injectable } from "@nestjs/common";
import {
  AiVoiceAgentCall,
  AiVoiceAgentCallDispatch,
  AiVoiceAgentCallDispatchState,
  AiVoiceAgentCallStatus,
  Prisma,
} from "@prisma/client";
import { buildOwnershipFilter, OwnershipContext } from "@ringee/platform";
import { PrismaService } from "../prisma.service";

/** Statuses of an agent call that is dialing or live, for the concurrency cap. */
const IN_FLIGHT: AiVoiceAgentCallStatus[] = [
  AiVoiceAgentCallStatus.created,
  AiVoiceAgentCallStatus.initiating,
  AiVoiceAgentCallStatus.ringing,
  AiVoiceAgentCallStatus.in_progress,
];

export interface DispatchCandidate {
  agentCallId: string;
  workspaceKey: string;
  trafficLevel: number;
  source: string;
  userId: string;
  organizationId: string | null;
  queuedAt: Date;
  expiresAt: Date;
  attempts: number;
  lastServedAt: Date;
}

export type EnqueueResult =
  | { queued: true; call: AiVoiceAgentCall; dispatch: AiVoiceAgentCallDispatch }
  | { queued: false; reason: "workspace_full" | "queue_full" };

export type CommitResult =
  | "committed"
  /** Someone else holds the claim, or it expired and another took over. */
  | "not_claimed"
  | "cancelled"
  | "expired"
  /** The workspace already has as many live agent calls as it may. */
  | "at_capacity";

export type CancelResult =
  | { result: "cancelled" }
  | { result: "not_found" }
  | { result: "not_cancellable"; status: AiVoiceAgentCallStatus };

export interface QueueDepth {
  level: number;
  queued: number;
  oldestQueuedAt: Date | null;
}

/**
 * The durable queue of agent calls waiting for provider capacity (CPS-006).
 *
 * Every transition is a compare-and-set on the row it leaves, and the two rows
 * (`AiVoiceAgentCall`, `AiVoiceAgentCallDispatch`) are always written in that
 * order, so two writers can lose a race but never deadlock or half-apply.
 *
 *   enqueue ─► queued ──claim──► (claimed lease) ──commit──► dispatched
 *                 │                    │ release ◄─ deferred, retry later
 *                 ├─ cancel ───────────► cancelled
 *                 ├─ expireDue ────────► expired
 *                 └─ fail ─────────────► failed   (a rule refused it at dispatch)
 *
 * `commit` is the point of no return: from there the call is the ordinary
 * `AiVoiceAgentCall` flow and the queue never dials it again.
 */
@Injectable()
export class AiVoiceAgentCallDispatchRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates the queued call and its dispatch row together, or neither, unless
   * the queue is full. A workspace's count is taken under its own lock, so two
   * simultaneous requests cannot both slip in under the last slot. The global
   * bound is serialized too: different workspaces cannot overfill it together.
   */
  async enqueue(input: {
    call: Prisma.AiVoiceAgentCallUncheckedCreateInput;
    dispatch: {
      workspaceKey: string;
      providerAccountKey: string;
      trafficLevel: number;
      source: string;
      integrationId?: string;
      queuedAt: Date;
      expiresAt: Date;
    };
    limits: { perWorkspace: number; total: number };
  }): Promise<EnqueueResult> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('provider-dispatch-queue-admission', 0))`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`dispatch-queue:${input.dispatch.workspaceKey}`}, 0))`;
        const [workspaceCount, totalCount] = await Promise.all([
          tx.aiVoiceAgentCallDispatch.count({
            where: {
              workspaceKey: input.dispatch.workspaceKey,
              state: AiVoiceAgentCallDispatchState.queued,
            },
          }),
          tx.aiVoiceAgentCallDispatch.count({
            where: { state: AiVoiceAgentCallDispatchState.queued },
          }),
        ]);
        if (workspaceCount >= input.limits.perWorkspace)
          return { queued: false as const, reason: "workspace_full" as const };
        if (totalCount >= input.limits.total)
          return { queued: false as const, reason: "queue_full" as const };

        const call = await tx.aiVoiceAgentCall.create({
          data: { ...input.call, status: AiVoiceAgentCallStatus.queued },
        });
        const dispatch = await tx.aiVoiceAgentCallDispatch.create({
          data: {
            agentCallId: call.id,
            workspaceKey: input.dispatch.workspaceKey,
            userId: call.userId,
            organizationId: call.organizationId,
            providerAccountKey: input.dispatch.providerAccountKey,
            trafficLevel: input.dispatch.trafficLevel,
            source: input.dispatch.source,
            integrationId: input.dispatch.integrationId,
            queuedAt: input.dispatch.queuedAt,
            notBefore: input.dispatch.queuedAt,
            expiresAt: input.dispatch.expiresAt,
          },
        });
        return { queued: true as const, call, dispatch };
      },
      { maxWait: 15_000, timeout: 5_000 },
    );
  }

  findByAgentCallId(
    agentCallId: string,
  ): Promise<AiVoiceAgentCallDispatch | null> {
    return this.prisma.aiVoiceAgentCallDispatch.findUnique({
      where: { agentCallId },
    });
  }

  /** Whether anything is waiting that a new request would have to queue behind. */
  async hasBacklog(now: Date, maxLevel = 3): Promise<boolean> {
    const waiting = await this.prisma.aiVoiceAgentCallDispatch.findFirst({
      where: {
        state: AiVoiceAgentCallDispatchState.queued,
        trafficLevel: { lte: maxLevel },
        expiresAt: { gt: now },
      },
      select: { agentCallId: true },
    });
    return waiting !== null;
  }

  /** Whether any OTHER call waits that this one would have to queue behind. */
  async hasOtherBacklog(
    agentCallId: string,
    now: Date,
    maxLevel: number,
  ): Promise<boolean> {
    const waiting = await this.prisma.aiVoiceAgentCallDispatch.findFirst({
      where: {
        state: AiVoiceAgentCallDispatchState.queued,
        trafficLevel: { lte: maxLevel },
        expiresAt: { gt: now },
        agentCallId: { not: agentCallId },
      },
      select: { agentCallId: true },
    });
    return waiting !== null;
  }

  /**
   * One candidate per workspace, the most urgent first, and within a level the
   * workspace served longest ago first: a workspace with a thousand queued
   * calls cannot keep another's one waiting, because only its best row competes.
   * Rows still under another dispatcher's claim are left out.
   */
  async peekCandidates(
    now: Date,
    leaseMs: number,
    limit: number,
    agingMs = 60_000,
  ): Promise<DispatchCandidate[]> {
    const leaseCut = new Date(now.getTime() - leaseMs);
    const servedSince = new Date(now.getTime() - 60 * 60_000);
    const rows = await this.prisma.$queryRaw<
      Array<
        Omit<DispatchCandidate, "trafficLevel" | "attempts"> & {
          trafficLevel: number | bigint;
          attempts: number | bigint;
        }
      >
    >`
      WITH best AS (
        SELECT DISTINCT ON (d."workspaceKey")
               d."agentCallId", d."workspaceKey", d."trafficLevel", d."source",
               d."userId", d."organizationId", d."queuedAt", d."expiresAt", d."attempts"
          FROM "AiVoiceAgentCallDispatch" d
         WHERE d."state" = 'queued'
           AND d."notBefore" <= ${now}::timestamptz AT TIME ZONE 'UTC'
           AND d."expiresAt" > ${now}::timestamptz AT TIME ZONE 'UTC'
           AND (d."claimedAt" IS NULL
                OR d."claimedAt" <= ${leaseCut}::timestamptz AT TIME ZONE 'UTC')
         ORDER BY d."workspaceKey",
                  GREATEST(1, d."trafficLevel" - FLOOR(EXTRACT(EPOCH FROM (${now}::timestamptz AT TIME ZONE 'UTC' - d."queuedAt")) * 1000 / ${agingMs})),
                  d."queuedAt"
      )
      SELECT b.*,
             COALESCE(
               (SELECT max(x."dispatchedAt")
                  FROM "AiVoiceAgentCallDispatch" x
                 WHERE x."workspaceKey" = b."workspaceKey"
                   AND x."state" = 'dispatched'
                   AND x."dispatchedAt" > ${servedSince}::timestamptz AT TIME ZONE 'UTC'),
               'epoch'::timestamp
             ) AS "lastServedAt"
        FROM best b
       ORDER BY GREATEST(1, b."trafficLevel" - FLOOR(EXTRACT(EPOCH FROM (${now}::timestamptz AT TIME ZONE 'UTC' - b."queuedAt")) * 1000 / ${agingMs})),
                "lastServedAt", b."queuedAt"
       LIMIT ${limit}
    `;
    return rows.map((row) => ({
      ...row,
      trafficLevel: Number(row.trafficLevel),
      attempts: Number(row.attempts),
      lastServedAt: new Date(row.lastServedAt),
    }));
  }

  /**
   * Takes the call for one dispatcher. The claim is a lease: when `leaseMs`
   * passes without a commit it is simply free again, which is the whole crash
   * recovery (nothing external has happened before the commit).
   */
  async claim(
    agentCallId: string,
    claimToken: string,
    now: Date,
    leaseMs: number,
  ): Promise<boolean> {
    const leaseCut = new Date(now.getTime() - leaseMs);
    const taken = await this.prisma.aiVoiceAgentCallDispatch.updateMany({
      where: {
        agentCallId,
        state: AiVoiceAgentCallDispatchState.queued,
        notBefore: { lte: now },
        expiresAt: { gt: now },
        OR: [{ claimedAt: null }, { claimedAt: { lte: leaseCut } }],
      },
      data: {
        claimToken,
        claimedAt: now,
        attempts: { increment: 1 },
      },
    });
    return taken.count === 1;
  }

  /** Gives the claim back, optionally saying when to try again and why. */
  async release(
    agentCallId: string,
    claimToken: string,
    options: {
      notBefore?: Date;
      reason?: string;
      refundAttempt?: boolean;
    } = {},
  ): Promise<boolean> {
    const released = await this.prisma.aiVoiceAgentCallDispatch.updateMany({
      where: {
        agentCallId,
        claimToken,
        state: AiVoiceAgentCallDispatchState.queued,
      },
      data: {
        claimToken: null,
        claimedAt: null,
        ...(options.notBefore ? { notBefore: options.notBefore } : {}),
        ...(options.reason ? { reason: options.reason } : {}),
        // Waiting for capacity is not an attempt that failed: only errors count
        // towards the limit that ends a call.
        ...(options.refundAttempt ? { attempts: { decrement: 1 } } : {}),
      },
    });
    return released.count === 1;
  }

  /**
   * The point of no return. Within one transaction: confirm the claim is still
   * this dispatcher's and the call is neither cancelled nor expired, enforce the
   * workspace's live-call cap (serialized per workspace, so two dispatchers
   * cannot both take the last slot), then move the call out of the queue into
   * the ordinary `created` state with its status-callback token.
   */
  async commit(
    agentCallId: string,
    claimToken: string,
    input: {
      now: Date;
      callbackTokenHash: string;
      leaseMs?: number;
      cap: {
        ctx: OwnershipContext;
        workspaceKey: string;
        max: number;
        liveSince: Date;
      } | null;
    },
  ): Promise<CommitResult> {
    return this.prisma.$transaction(async (tx) => {
      if (input.cap) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`dispatch-commit:${input.cap.workspaceKey}`}, 0))`;
      }
      const locked = await tx.$queryRaw<
        Array<{ status: AiVoiceAgentCallStatus }>
      >`
        SELECT "status" FROM "AiVoiceAgentCall" WHERE "id" = ${agentCallId}::uuid FOR UPDATE
      `;
      if (locked[0]?.status !== AiVoiceAgentCallStatus.queued) {
        if (locked[0]?.status === AiVoiceAgentCallStatus.cancelled)
          return "cancelled" as const;
        if (locked[0]?.status === AiVoiceAgentCallStatus.expired)
          return "expired" as const;
        return "not_claimed" as const;
      }
      const dispatch = await tx.aiVoiceAgentCallDispatch.findUnique({
        where: { agentCallId },
      });
      if (!dispatch) return "not_claimed" as const;
      if (dispatch.state === AiVoiceAgentCallDispatchState.cancelled)
        return "cancelled" as const;
      if (dispatch.state === AiVoiceAgentCallDispatchState.expired)
        return "expired" as const;
      if (
        dispatch.state !== AiVoiceAgentCallDispatchState.queued ||
        dispatch.claimToken !== claimToken
      )
        return "not_claimed" as const;
      if (dispatch.expiresAt <= input.now) return "expired" as const;

      if (input.cap) {
        const live = await tx.aiVoiceAgentCall.count({
          where: {
            ...buildOwnershipFilter(input.cap.ctx),
            status: { in: IN_FLIGHT },
            OR: [
              { dispatch: { dispatchedAt: { gte: input.cap.liveSince } } },
              { dispatch: null, createdAt: { gte: input.cap.liveSince } },
            ],
            id: { not: agentCallId },
          },
        });
        if (live >= input.cap.max) return "at_capacity" as const;
      }

      // Lock order: call, then dispatch. The token and the unexpired lease are
      // fenced in the write itself: a reclaimer cannot replace the token after
      // our read and still have this dispatcher dial the call.
      const moved = await tx.aiVoiceAgentCallDispatch.updateMany({
        where: {
          agentCallId,
          state: AiVoiceAgentCallDispatchState.queued,
          claimToken,
          claimedAt: {
            gt: new Date(input.now.getTime() - (input.leaseMs ?? 30_000)),
          },
          expiresAt: { gt: input.now },
        },
        data: {
          state: AiVoiceAgentCallDispatchState.dispatched,
          dispatchedAt: input.now,
          claimedAt: input.now,
          reason: null,
        },
      });
      if (moved.count !== 1) return "not_claimed" as const;
      await tx.aiVoiceAgentCall.update({
        where: { id: agentCallId },
        data: {
          status: AiVoiceAgentCallStatus.created,
          callbackTokenHash: input.callbackTokenHash,
        },
      });
      return "committed" as const;
    });
  }

  /**
   * Ends a queued call that a rule refused at dispatch (DNC, balance, the agent
   * gone). Nothing was dialed, and nothing will be.
   */
  async fail(
    agentCallId: string,
    claimToken: string,
    reason: string,
    now: Date,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "AiVoiceAgentCall" WHERE "id" = ${agentCallId}::uuid FOR UPDATE`;
      const dispatch = await tx.aiVoiceAgentCallDispatch.findUnique({
        where: { agentCallId },
      });
      if (
        !dispatch ||
        dispatch.state !== AiVoiceAgentCallDispatchState.queued ||
        dispatch.claimToken !== claimToken
      )
        return false;
      const call = await tx.aiVoiceAgentCall.findUnique({
        where: { id: agentCallId },
        select: { status: true },
      });
      if (call?.status !== AiVoiceAgentCallStatus.queued) return false;
      const failed = await tx.aiVoiceAgentCallDispatch.updateMany({
        where: {
          agentCallId,
          claimToken,
          state: AiVoiceAgentCallDispatchState.queued,
        },
        data: {
          state: AiVoiceAgentCallDispatchState.failed,
          finishedAt: now,
          reason,
          claimToken: null,
          claimedAt: null,
        },
      });
      if (failed.count !== 1) return false;
      await tx.aiVoiceAgentCall.updateMany({
        where: { id: agentCallId, status: AiVoiceAgentCallStatus.queued },
        data: { status: AiVoiceAgentCallStatus.failed, lastError: reason },
      });
      return true;
    });
  }

  /** Requeue only on explicit proof from the egress guard that nothing was sent.
   * Ambiguous provider responses must never call this transition. */
  async requeueUnsent(
    agentCallId: string,
    claimToken: string,
    notBefore: Date,
    reason: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{
          status: AiVoiceAgentCallStatus;
          providerCallControlId: string | null;
        }>
      >`
        SELECT "status", "providerCallControlId" FROM "AiVoiceAgentCall" WHERE "id" = ${agentCallId}::uuid FOR UPDATE
      `;
      if (
        locked[0]?.status !== AiVoiceAgentCallStatus.created ||
        locked[0].providerCallControlId
      )
        return false;
      const moved = await tx.aiVoiceAgentCallDispatch.updateMany({
        where: {
          agentCallId,
          claimToken,
          state: AiVoiceAgentCallDispatchState.dispatched,
        },
        data: {
          state: AiVoiceAgentCallDispatchState.queued,
          dispatchedAt: null,
          claimToken: null,
          claimedAt: null,
          notBefore,
          reason,
          attempts: { decrement: 1 },
        },
      });
      if (!moved.count) return false;
      await tx.aiVoiceAgentCall.update({
        where: { id: agentCallId },
        data: {
          status: AiVoiceAgentCallStatus.queued,
          callbackTokenHash: null,
          callId: null,
        },
      });
      return true;
    });
  }

  /** A status read may expire its own operation without waiting for maintenance. */
  expireForOwner(
    ctx: OwnershipContext,
    agentCallId: string,
    now: Date,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.aiVoiceAgentCall.updateMany({
        where: {
          id: agentCallId,
          ...buildOwnershipFilter(ctx),
          status: AiVoiceAgentCallStatus.queued,
          dispatch: { expiresAt: { lte: now } },
        },
        data: {
          status: AiVoiceAgentCallStatus.expired,
          lastError: "Expired before provider dispatch",
        },
      });
      if (!moved.count) return false;
      await tx.aiVoiceAgentCallDispatch.updateMany({
        where: { agentCallId, state: AiVoiceAgentCallDispatchState.queued },
        data: {
          state: AiVoiceAgentCallDispatchState.expired,
          finishedAt: now,
          reason: "expired",
          claimToken: null,
          claimedAt: null,
        },
      });
      return true;
    });
  }

  /** Withdraws a call that has not been dialed. Workspace-checked. */
  async cancel(
    ctx: OwnershipContext,
    agentCallId: string,
    now: Date,
  ): Promise<CancelResult> {
    return this.prisma.$transaction(async (tx) => {
      const call = await tx.aiVoiceAgentCall.findFirst({
        where: { id: agentCallId, ...buildOwnershipFilter(ctx) },
        select: { id: true, status: true },
      });
      if (!call) return { result: "not_found" as const };
      const moved = await tx.aiVoiceAgentCall.updateMany({
        where: { id: agentCallId, status: AiVoiceAgentCallStatus.queued },
        data: {
          status: AiVoiceAgentCallStatus.cancelled,
          lastError: "Cancelled before it was dialed.",
        },
      });
      if (moved.count !== 1)
        return { result: "not_cancellable" as const, status: call.status };
      await tx.aiVoiceAgentCallDispatch.updateMany({
        where: {
          agentCallId,
          state: AiVoiceAgentCallDispatchState.queued,
        },
        data: {
          state: AiVoiceAgentCallDispatchState.cancelled,
          finishedAt: now,
          reason: "cancelled",
          claimToken: null,
          claimedAt: null,
        },
      });
      return { result: "cancelled" as const };
    });
  }

  /**
   * Expires what waited past its limit. A call still under a live claim is left
   * for its dispatcher, whose commit will refuse it as expired.
   */
  async expireDue(now: Date, leaseMs: number, limit = 500): Promise<string[]> {
    const leaseCut = new Date(now.getTime() - leaseMs);
    return this.prisma.$transaction(async (tx) => {
      const due = await tx.$queryRaw<Array<{ agentCallId: string }>>`
        SELECT d."agentCallId"
          FROM "AiVoiceAgentCallDispatch" d
          JOIN "AiVoiceAgentCall" c ON c."id" = d."agentCallId"
         WHERE d."state" = 'queued'
           AND d."expiresAt" <= ${now}::timestamptz AT TIME ZONE 'UTC'
           AND (d."claimedAt" IS NULL
                OR d."claimedAt" <= ${leaseCut}::timestamptz AT TIME ZONE 'UTC')
         ORDER BY d."expiresAt"
         LIMIT ${limit}
         FOR UPDATE OF c SKIP LOCKED
      `;
      if (due.length === 0) return [];
      const ids = due.map((row) => row.agentCallId);
      const expired = await tx.aiVoiceAgentCall.updateManyAndReturn({
        where: { id: { in: ids }, status: AiVoiceAgentCallStatus.queued },
        data: {
          status: AiVoiceAgentCallStatus.expired,
          lastError: "Waited too long for call capacity and was not dialed.",
        },
        select: { id: true },
      });
      const expiredIds = expired.map((row) => row.id);
      if (expiredIds.length) {
        await tx.aiVoiceAgentCallDispatch.updateMany({
          where: {
            agentCallId: { in: expiredIds },
            state: AiVoiceAgentCallDispatchState.queued,
          },
          data: {
            state: AiVoiceAgentCallDispatchState.expired,
            finishedAt: now,
            reason: "expired",
            claimToken: null,
            claimedAt: null,
          },
        });
      }
      return expiredIds;
    });
  }

  /** Live agent calls in a workspace, for deciding how many may still start. */
  countLiveInWorkspace(
    ctx: OwnershipContext,
    liveSince: Date,
  ): Promise<number> {
    return this.prisma.aiVoiceAgentCall.count({
      where: {
        ...buildOwnershipFilter(ctx),
        status: { in: IN_FLIGHT },
        OR: [
          { dispatch: { dispatchedAt: { gte: liveSince } } },
          { dispatch: null, createdAt: { gte: liveSince } },
        ],
      },
    });
  }

  /** When the next waiting call becomes due, or `null` when none is waiting. */
  async earliestDueAt(now: Date): Promise<Date | null> {
    const next = await this.prisma.aiVoiceAgentCallDispatch.aggregate({
      where: {
        state: AiVoiceAgentCallDispatchState.queued,
        expiresAt: { gt: now },
      },
      _min: { notBefore: true },
    });
    return next._min.notBefore;
  }

  /** What is waiting, per traffic level, and for how long. */
  async depth(now: Date): Promise<QueueDepth[]> {
    const rows = await this.prisma.aiVoiceAgentCallDispatch.groupBy({
      by: ["trafficLevel"],
      where: {
        state: AiVoiceAgentCallDispatchState.queued,
        expiresAt: { gt: now },
      },
      _count: { _all: true },
      _min: { queuedAt: true },
    });
    return rows
      .map((row) => ({
        level: row.trafficLevel,
        queued: row._count._all,
        oldestQueuedAt: row._min.queuedAt,
      }))
      .sort((a, b) => a.level - b.level);
  }

  /** The workspaces with the most waiting, for the admin view. */
  async busiestWorkspaces(
    limit = 10,
  ): Promise<Array<{ workspaceKey: string; queued: number }>> {
    const rows = await this.prisma.aiVoiceAgentCallDispatch.groupBy({
      by: ["workspaceKey"],
      where: { state: AiVoiceAgentCallDispatchState.queued },
      _count: { _all: true },
      orderBy: { _count: { workspaceKey: "desc" } },
      take: limit,
    });
    return rows.map((row) => ({
      workspaceKey: row.workspaceKey,
      queued: row._count._all,
    }));
  }

  /**
   * Calls that were committed but have no provider handle after `olderThan`:
   * a dispatcher died, or the answer was lost, after the point of no return.
   * They are NOT redialed — a leg may exist — and are listed for a person.
   */
  countAmbiguous(olderThan: Date): Promise<number> {
    return this.prisma.aiVoiceAgentCallDispatch.count({
      where: {
        state: AiVoiceAgentCallDispatchState.dispatched,
        dispatchedAt: { lte: olderThan },
        agentCall: {
          status: AiVoiceAgentCallStatus.created,
          providerCallControlId: null,
        },
      },
    });
  }

  /** The queue for the admin view; the number is masked by the caller. */
  async listForAdmin(options: {
    state?: AiVoiceAgentCallDispatchState;
    workspaceKey?: string;
    limit: number;
    offset: number;
  }): Promise<{
    total: number;
    rows: Array<
      AiVoiceAgentCallDispatch & {
        agentCall: Pick<
          AiVoiceAgentCall,
          "id" | "agentId" | "toNumber" | "status" | "createdAt"
        >;
      }
    >;
  }> {
    const where: Prisma.AiVoiceAgentCallDispatchWhereInput = {
      state: options.state ?? AiVoiceAgentCallDispatchState.queued,
      ...(options.workspaceKey ? { workspaceKey: options.workspaceKey } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.aiVoiceAgentCallDispatch.count({ where }),
      this.prisma.aiVoiceAgentCallDispatch.findMany({
        where,
        orderBy: [{ trafficLevel: "asc" }, { queuedAt: "asc" }],
        skip: options.offset,
        take: options.limit,
        include: {
          agentCall: {
            select: {
              id: true,
              agentId: true,
              toNumber: true,
              status: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);
    return { total, rows };
  }
}
