import { Injectable } from "@nestjs/common";
import {
  Prisma,
  ProductAnalyticsDeliveryStatus,
  type ProductAnalyticsEvent,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { answeredCallWhere } from "./answered-call.sql";

/**
 * `Call.source` of a call an AI voice agent placed or answered — written only
 * by the agent call service (`AI_VOICE_AGENT_CALL_SOURCE` in services).
 */
const AI_CALL_SOURCE = "ai_voice_agent";

/** A fact ready to be stored; `eventKey` makes recording it idempotent. */
export interface NewProductAnalyticsEvent {
  /** The provider event UUID; derived from `eventKey` by the producer. */
  id?: string;
  eventKey: string;
  event: string;
  distinctId: string;
  occurredAt: Date;
  properties: Prisma.InputJsonObject;
  workspaceKey: string | null;
}

/** How far a projector has read its evidence: a keyset position. */
export interface ProductAnalyticsCursorPosition {
  at: Date;
  id: string | null;
}

/** The workspace columns every evidence row carries. */
interface WorkspaceColumns {
  userId: string | null;
  organizationId: string | null;
}

export interface TopupEvidence extends WorkspaceColumns {
  id: string;
  amount: number;
  source: string | null;
  createdAt: Date;
  /** Completed purchases of the same workspace before this one. */
  earlierPaidTopups: number;
}

export interface GrantEvidence extends WorkspaceColumns {
  id: string;
  amount: number;
  source: string | null;
  createdAt: Date;
}

export interface MeetingActionEvidence extends WorkspaceColumns {
  id: string;
  kind: string;
  agentId: string;
  followUpId: string | null;
  handoffId: string | null;
  callId: string | null;
  meetingId: string;
  createdAt: Date;
}

export interface ReminderPlannedEvidence extends WorkspaceColumns {
  id: string;
  meetingId: string;
  offsetMinutes: number | null;
  trigger: string;
  fireAt: Date;
  createdAt: Date;
}

export interface ObjectiveEventEvidence extends WorkspaceColumns {
  id: string;
  followUpId: string;
  kind: string;
  actorType: string;
  occurredAt: Date;
  objectiveType: string;
  sourceType: string;
  closureReason: string | null;
}

export interface LineAcquiredEvidence extends WorkspaceColumns {
  id: string;
  isoCountry: string;
  kind: "purchased" | "verified_caller_id";
  /** Bought: when the row was created. Verified: when it was verified. */
  createdAt: Date;
}

export interface SignupEvidence {
  id: string;
  createdAt: Date;
}

export interface OrganizationEvidence {
  id: string;
  createdAt: Date;
  /** The creator's Ringee user id, when Clerk named a known user. */
  creatorUserId: string | null;
}

/**
 * The backend product-analytics outbox (Stage 4B), its projector cursors and
 * the read-only projections of durable evidence the projectors turn into
 * facts. Like `DashboardRepository`, it reads across aggregates for analytics;
 * it never writes business rows.
 *
 * Evidence reads are keyset-paged on `(timestamp, id)` after a cursor and
 * below an upper bound, so a projector that runs twice reads the same rows and
 * the outbox's unique `eventKey` keeps the second recording a no-op.
 */
@Injectable()
export class ProductAnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Outbox ─────────────────────────────────────────────────────────

  /** Inserts facts; a fact whose key is already stored is skipped. */
  async recordMany(rows: NewProductAnalyticsEvent[]): Promise<number> {
    if (!rows.length) return 0;
    const { count } = await this.prisma.productAnalyticsEvent.createMany({
      data: rows.map((row) => ({
        ...(row.id ? { id: row.id } : {}),
        eventKey: row.eventKey,
        event: row.event,
        distinctId: row.distinctId,
        occurredAt: row.occurredAt,
        properties: row.properties,
        workspaceKey: row.workspaceKey,
      })),
      skipDuplicates: true,
    });
    return count;
  }

  /**
   * Claims due facts for one delivery attempt. `FOR UPDATE SKIP LOCKED` keeps
   * two drains from taking the same row, and the lease lets a drain that died
   * mid-send be taken over; a resend keeps the row id, which the provider uses
   * to deduplicate.
   */
  claimDue(input: {
    token: string;
    now: Date;
    leaseUntil: Date;
    take: number;
  }): Promise<ProductAnalyticsEvent[]> {
    return this.prisma.$queryRaw<ProductAnalyticsEvent[]>`
      UPDATE "ProductAnalyticsEvent"
      SET "claimToken" = ${input.token}::uuid,
          "claimedUntil" = ${input.leaseUntil}::timestamptz AT TIME ZONE 'UTC',
          "attemptCount" = "attemptCount" + 1
      WHERE "id" IN (
        SELECT "id" FROM "ProductAnalyticsEvent"
        WHERE "status" = 'pending'::"ProductAnalyticsDeliveryStatus"
          AND "nextAttemptAt" <= ${input.now}::timestamptz AT TIME ZONE 'UTC'
          AND ("claimedUntil" IS NULL
               OR "claimedUntil" < ${input.now}::timestamptz AT TIME ZONE 'UTC')
        ORDER BY "nextAttemptAt", "createdAt"
        LIMIT ${input.take}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *`;
  }

  /** Accepted by the provider. Only the claim that sent them may say so. */
  async markSent(ids: string[], token: string, at: Date): Promise<number> {
    if (!ids.length) return 0;
    const { count } = await this.prisma.productAnalyticsEvent.updateMany({
      where: { id: { in: ids }, claimToken: token },
      data: {
        status: ProductAnalyticsDeliveryStatus.sent,
        sentAt: at,
        claimToken: null,
        claimedUntil: null,
        lastError: null,
      },
    });
    return count;
  }

  /** A failed attempt: retry later, or give up after the last one. */
  async markAttemptFailed(
    ids: string[],
    token: string,
    input: { nextAttemptAt: Date; errorCode: string; giveUp: boolean },
  ): Promise<number> {
    if (!ids.length) return 0;
    const { count } = await this.prisma.productAnalyticsEvent.updateMany({
      where: { id: { in: ids }, claimToken: token },
      data: {
        status: input.giveUp
          ? ProductAnalyticsDeliveryStatus.failed
          : ProductAnalyticsDeliveryStatus.pending,
        nextAttemptAt: input.nextAttemptAt,
        lastError: input.errorCode.slice(0, 64),
        claimToken: null,
        claimedUntil: null,
      },
    });
    return count;
  }

  /** Analytics is switched off: due facts are dropped instead of piling up. */
  async skipDue(now: Date, take: number): Promise<number> {
    const ids = await this.prisma.productAnalyticsEvent.findMany({
      where: {
        status: ProductAnalyticsDeliveryStatus.pending,
        nextAttemptAt: { lte: now },
      },
      select: { id: true },
      take,
    });
    if (!ids.length) return 0;
    const { count } = await this.prisma.productAnalyticsEvent.updateMany({
      where: {
        id: { in: ids.map((row) => row.id) },
        status: ProductAnalyticsDeliveryStatus.pending,
      },
      data: { status: ProductAnalyticsDeliveryStatus.skipped },
    });
    return count;
  }

  /**
   * Delivered or skipped facts older than the retention window. A fact that
   * failed for good is kept: it is what reconciliation works from.
   */
  async pruneSettled(before: Date, take: number): Promise<number> {
    const settled = {
      in: [
        ProductAnalyticsDeliveryStatus.sent,
        ProductAnalyticsDeliveryStatus.skipped,
      ],
    };
    const ids = await this.prisma.productAnalyticsEvent.findMany({
      where: { status: settled, createdAt: { lt: before } },
      select: { id: true },
      take,
    });
    if (!ids.length) return 0;
    const { count } = await this.prisma.productAnalyticsEvent.deleteMany({
      where: { id: { in: ids.map((row) => row.id) }, status: settled },
    });
    return count;
  }

  /** Counts per delivery state, for the health check and reconciliation. */
  async countByStatus(): Promise<Record<string, number>> {
    const rows = await this.prisma.productAnalyticsEvent.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
  }

  // ── Cursors ────────────────────────────────────────────────────────

  async getCursor(
    source: string,
  ): Promise<ProductAnalyticsCursorPosition | null> {
    const row = await this.prisma.productAnalyticsCursor.findUnique({
      where: { source },
    });
    return row ? { at: row.cursorAt, id: row.cursorId } : null;
  }

  async saveCursor(
    source: string,
    position: ProductAnalyticsCursorPosition,
  ): Promise<void> {
    await this.prisma.productAnalyticsCursor.upsert({
      where: { source },
      create: { source, cursorAt: position.at, cursorId: position.id },
      update: { cursorAt: position.at, cursorId: position.id },
    });
  }

  // ── Evidence (read-only) ───────────────────────────────────────────

  /** Completed credit purchases (`CreditTopup`) — the payment ledger. */
  async topupsAfter(
    cursor: ProductAnalyticsCursorPosition,
    upTo: Date,
    take: number,
  ): Promise<TopupEvidence[]> {
    const rows = await this.prisma.creditTopup.findMany({
      where: {
        status: "completed",
        createdAt: { lte: upTo },
        ...after("createdAt", cursor),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
    });
    return Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        userId: row.userId,
        organizationId: row.organizationId,
        amount: row.amount,
        source: row.source,
        createdAt: row.createdAt,
        earlierPaidTopups: await this.prisma.creditTopup.count({
          where: {
            status: "completed",
            ...(row.organizationId
              ? { organizationId: row.organizationId }
              : { userId: row.userId, organizationId: null }),
            OR: [
              { createdAt: { lt: row.createdAt } },
              { createdAt: row.createdAt, id: { lt: row.id } },
            ],
          },
        }),
      })),
    );
  }

  /**
   * Lines a workspace acquired: a number bought from Ringee (by creation) or
   * an own number verified as caller ID (by verification time). The recovery
   * a "no line" blocker leads to. Small tables; `verifiedAt` is read with the
   * same keyset as every other source.
   */
  async linesAcquiredAfter(
    cursor: ProductAnalyticsCursorPosition,
    upTo: Date,
    take: number,
  ): Promise<LineAcquiredEvidence[]> {
    const [bought, verified] = await Promise.all([
      this.prisma.numberPurchased.findMany({
        where: {
          kind: "purchased",
          createdAt: { lte: upTo },
          ...after("createdAt", cursor),
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take,
        select: {
          id: true,
          userId: true,
          organizationId: true,
          isoCountry: true,
          createdAt: true,
        },
      }),
      this.prisma.numberPurchased.findMany({
        where: {
          kind: "verified_caller_id",
          verifiedAt: { not: null, lte: upTo },
          OR: [
            { verifiedAt: { gt: cursor.at } },
            ...(cursor.id
              ? [{ verifiedAt: cursor.at, id: { gt: cursor.id } }]
              : []),
          ],
        },
        orderBy: [{ verifiedAt: "asc" }, { id: "asc" }],
        take,
        select: {
          id: true,
          userId: true,
          organizationId: true,
          isoCountry: true,
          verifiedAt: true,
        },
      }),
    ]);
    return [
      ...bought.map((row) => ({
        id: row.id,
        userId: row.userId,
        organizationId: row.organizationId,
        isoCountry: row.isoCountry,
        kind: "purchased" as const,
        createdAt: row.createdAt,
      })),
      ...verified.map((row) => ({
        id: row.id,
        userId: row.userId,
        organizationId: row.organizationId,
        isoCountry: row.isoCountry,
        kind: "verified_caller_id" as const,
        createdAt: row.verifiedAt!,
      })),
    ]
      .sort(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      )
      .slice(0, take);
  }

  /** Non-purchase credit grants (`CreditGrant`) — never counted as payments. */
  async grantsAfter(
    cursor: ProductAnalyticsCursorPosition,
    upTo: Date,
    take: number,
  ): Promise<GrantEvidence[]> {
    const rows = await this.prisma.creditGrant.findMany({
      where: { createdAt: { lte: upTo }, ...after("createdAt", cursor) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
      select: {
        id: true,
        userId: true,
        organizationId: true,
        amount: true,
        source: true,
        createdAt: true,
      },
    });
    return rows;
  }

  /** Definitive AI meeting actions (`MeetingAutomationAction`, AGENT-020/021). */
  async meetingActionsAfter(
    cursor: ProductAnalyticsCursorPosition,
    upTo: Date,
    take: number,
  ): Promise<MeetingActionEvidence[]> {
    return this.prisma.meetingAutomationAction.findMany({
      where: { createdAt: { lte: upTo }, ...after("createdAt", cursor) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
      select: {
        id: true,
        userId: true,
        organizationId: true,
        kind: true,
        agentId: true,
        followUpId: true,
        handoffId: true,
        callId: true,
        meetingId: true,
        createdAt: true,
      },
    });
  }

  /** First attempts of planned reminder calls — coverage, not results. */
  async remindersPlannedAfter(
    cursor: ProductAnalyticsCursorPosition,
    upTo: Date,
    take: number,
  ): Promise<ReminderPlannedEvidence[]> {
    return this.prisma.meetingReminderExecution.findMany({
      where: {
        attempt: 1,
        createdAt: { lte: upTo },
        ...after("createdAt", cursor),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
      select: {
        id: true,
        userId: true,
        organizationId: true,
        meetingId: true,
        offsetMinutes: true,
        trigger: true,
        fireAt: true,
        createdAt: true,
      },
    });
  }

  /** The append-only objective history (AGENT-022), with its workspace. */
  async objectiveEventsAfter(
    cursor: ProductAnalyticsCursorPosition,
    upTo: Date,
    take: number,
  ): Promise<ObjectiveEventEvidence[]> {
    const rows = await this.prisma.pendingActionFollowUpEvent.findMany({
      where: { occurredAt: { lte: upTo }, ...after("occurredAt", cursor) },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      take,
      select: {
        id: true,
        followUpId: true,
        kind: true,
        actorType: true,
        occurredAt: true,
        followUp: {
          select: {
            objectiveType: true,
            sourceType: true,
            closureReason: true,
            action: { select: { userId: true, organizationId: true } },
          },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      followUpId: row.followUpId,
      kind: row.kind,
      actorType: row.actorType,
      occurredAt: row.occurredAt,
      objectiveType: row.followUp.objectiveType,
      sourceType: row.followUp.sourceType,
      closureReason: row.followUp.closureReason ?? null,
      userId: row.followUp.action.userId,
      organizationId: row.followUp.action.organizationId,
    }));
  }

  /** Ringee users in creation order — completed sign-ups. */
  usersAfter(
    cursor: ProductAnalyticsCursorPosition,
    upTo: Date,
    take: number,
  ): Promise<SignupEvidence[]> {
    return this.prisma.user.findMany({
      where: { createdAt: { lte: upTo }, ...after("createdAt", cursor) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
      select: { id: true, createdAt: true },
    });
  }

  /** Organizations in creation order, with their creator when known. */
  async organizationsAfter(
    cursor: ProductAnalyticsCursorPosition,
    upTo: Date,
    take: number,
  ): Promise<OrganizationEvidence[]> {
    const rows = await this.prisma.organization.findMany({
      where: { createdAt: { lte: upTo }, ...after("createdAt", cursor) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
      select: { id: true, createdAt: true, createdBy: true },
    });
    const clerkIds = rows
      .map((row) => row.createdBy)
      .filter((id): id is string => Boolean(id));
    const creators = clerkIds.length
      ? await this.prisma.user.findMany({
          where: { clerkId: { in: clerkIds } },
          select: { id: true, clerkId: true },
        })
      : [];
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      creatorUserId:
        creators.find((user) => user.clerkId === row.createdBy)?.id ?? null,
    }));
  }

  /**
   * Whether the workspace had a connected human call before this one —
   * `is_first` of the connected-call fact. Indexed by the workspace columns;
   * `LIMIT 1` stops at the first earlier call.
   */
  async hadEarlierConnectedHumanCall(call: {
    id: string;
    userId: string | null;
    organizationId: string | null;
    answeredAt: Date;
  }): Promise<boolean> {
    const earlier = await this.prisma.call.findFirst({
      where: {
        ...(call.organizationId
          ? { organizationId: call.organizationId }
          : { userId: call.userId, organizationId: null }),
        AND: [
          // The canonical "answered" (CALL-012): connected, not a machine by
          // its recorded outcome, not a server-originated voicemail drop.
          ...answeredCallWhere(),
          {
            OR: [
              { answeredAt: { lt: call.answeredAt } },
              { answeredAt: call.answeredAt, id: { lt: call.id } },
            ],
          },
          { OR: [{ source: null }, { source: { not: AI_CALL_SOURCE } }] },
        ],
      },
      select: { id: true },
    });
    return earlier !== null;
  }
}

/** Keyset condition: strictly after `(cursor.at, cursor.id)`. */
function after(
  column: "createdAt" | "occurredAt",
  cursor: ProductAnalyticsCursorPosition,
): Record<string, unknown> {
  return {
    OR: [
      { [column]: { gt: cursor.at } },
      ...(cursor.id ? [{ [column]: cursor.at, id: { gt: cursor.id } }] : []),
    ],
  };
}
