import { buildOwnershipFilter, type OwnershipContext } from "@ringee/platform";
import {
  applyFollowUpPlan,
  lockFollowUp,
  FOLLOW_UP_TERMINAL,
  type FollowUpPlan,
} from "./pending-action-follow-up.persistence";
export type {
  HumanOutcomeAssignment,
  NewFollowUpObjective,
  FollowUpPlan,
} from "./pending-action-follow-up.persistence";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import {
  PendingAction,
  FollowUpState,
  PendingActionPriority,
  PendingActionSource,
  PendingActionStatus,
  PendingActionType,
  Prisma,
} from "@prisma/client";

export interface PendingActionOwnerFilter {
  userId: string;
  organizationId?: string | null;
}

/** Action types that always count toward the sidebar badge (see 4.6). */
export const REVIEW_ACTION_TYPES: PendingActionType[] = [
  PendingActionType.review_call,
  PendingActionType.review_script_suggestion,
  PendingActionType.approve_script_version,
  PendingActionType.review_objection_response,
  PendingActionType.review_campaign_insight,
];

export const LEAD_FOLLOWUP_TYPES: PendingActionType[] = [
  PendingActionType.send_follow_up,
  PendingActionType.create_callback,
  PendingActionType.book_meeting,
  PendingActionType.ask_for_referral,
  PendingActionType.send_pricing_or_info,
  PendingActionType.add_to_nurture,
  PendingActionType.mark_not_interested,
];

export const SCRIPT_REVIEW_TYPES: PendingActionType[] = [
  PendingActionType.review_script_suggestion,
  PendingActionType.approve_script_version,
];

export const OBJECTION_TYPES: PendingActionType[] = [
  PendingActionType.review_objection_response,
  PendingActionType.add_objection_response_to_script,
];

export type PendingActionFilterKey =
  | "all"
  | "high_priority"
  | "due_today"
  | "overdue"
  | "lead_followups"
  | "script_reviews"
  | "objection_responses"
  | "crm_updates"
  | "ai_generated"
  | "rule_based"
  | "campaign"
  | "organization"
  | "personal";

export interface PendingActionDisplay extends PendingAction {
  followUp?: {
    id: string;
    /** What the objective is for (`reschedule_meeting`), for its label. */
    objectiveType: string;
    state: FollowUpState;
    mode: "automatic" | "manual";
    nextAction: string | null;
    nextActionAt: Date | null;
    reason: string | null;
  } | null;
  contact: {
    id: string;
    name: string | null;
    phoneNumber: string;
    company: string | null;
  } | null;
  call: {
    id: string;
    outcome: string | null;
    startedAt: Date | null;
  } | null;
  campaign: { id: string; name: string } | null;
}

/** An open action that asks for a call, with who to call. */
export interface CallablePendingAction {
  id: string;
  type: PendingActionType;
  priority: PendingActionPriority;
  title: string;
  dueAt: Date | null;
  createdAt: Date;
  contact: {
    id: string;
    name: string | null;
    phoneNumber: string;
    company: string | null;
    timezone: string | null;
  } | null;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

@Injectable()
export class PendingActionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<PendingAction | null> {
    return this.prisma.pendingAction.findUnique({ where: { id } });
  }

  findByGroupKey(groupKey: string): Promise<PendingAction | null> {
    return this.prisma.pendingAction.findFirst({ where: { groupKey } });
  }

  create(
    data: Prisma.PendingActionUncheckedCreateInput,
  ): Promise<PendingAction> {
    return this.prisma.pendingAction.create({ data });
  }

  /**
   * Insert-or-update keyed by groupKey (partial-unique in SQL). Used by rule
   * drafts so re-firing the same outcome never duplicates an action. Returns
   * { action, created } so callers can keep counters accurate.
   */
  async upsertByGroupKey(
    groupKey: string,
    data: Prisma.PendingActionUncheckedCreateInput,
  ): Promise<{ action: PendingAction; created: boolean }> {
    const existing = await this.findByGroupKey(groupKey);
    if (existing) {
      const action = await this.prisma.pendingAction.update({
        where: { id: existing.id },
        data: {
          // Refresh the advisory fields; never resurrect a resolved action.
          title: data.title,
          reason: data.reason,
          suggestedMessage: data.suggestedMessage,
          nextBestAction: data.nextBestAction,
          priority: data.priority,
          source: data.source, // rule → ai promotion on enrichment
          dueAt: data.dueAt,
          expiresAt: data.expiresAt,
        },
      });
      return { action, created: false };
    }
    try {
      const action = await this.prisma.pendingAction.create({ data });
      return { action, created: true };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const action = await this.findByGroupKey(groupKey);
        if (action) return { action, created: false };
      }
      throw err;
    }
  }

  private ownerWhere(
    owner: PendingActionOwnerFilter,
  ): Prisma.PendingActionWhereInput {
    return owner.organizationId
      ? { organizationId: owner.organizationId }
      : { userId: owner.userId, organizationId: null };
  }

  private filterWhere(
    filter: PendingActionFilterKey,
  ): Prisma.PendingActionWhereInput {
    switch (filter) {
      case "high_priority":
        return { priority: PendingActionPriority.high };
      case "due_today":
        return { dueAt: { gte: new Date(), lte: endOfToday() } };
      case "overdue":
        return { dueAt: { lt: new Date() } };
      case "lead_followups":
        return { type: { in: LEAD_FOLLOWUP_TYPES } };
      case "script_reviews":
        return { type: { in: SCRIPT_REVIEW_TYPES } };
      case "objection_responses":
        return { type: { in: OBJECTION_TYPES } };
      case "crm_updates":
        return { type: PendingActionType.update_crm };
      case "ai_generated":
        return { source: PendingActionSource.ai };
      case "rule_based":
        return { source: PendingActionSource.rule };
      case "campaign":
        return { contextType: "campaign" };
      case "organization":
        return { contextType: "organization_outside_campaign" };
      case "personal":
        return { contextType: "personal" };
      case "all":
      default:
        return {};
    }
  }

  async list(
    owner: PendingActionOwnerFilter,
    options?: {
      filter?: PendingActionFilterKey;
      status?: PendingActionStatus;
      contextKey?: string;
      /** Narrow org-wide results to a single member (admin filter / member self). */
      memberUserId?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{
    data: PendingActionDisplay[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const {
      filter = "all",
      status,
      contextKey,
      memberUserId,
      page = 1,
      limit = 50,
    } = options || {};

    const where: Prisma.PendingActionWhereInput = {
      AND: [
        this.ownerWhere(owner),
        this.filterWhere(filter),
        status ? { status } : {},
        contextKey ? { contextKey } : {},
        memberUserId ? { userId: memberUserId } : {},
      ],
    };

    const total = await this.prisma.pendingAction.count({ where });
    const actions = await this.prisma.pendingAction.findMany({
      where,
      orderBy: [
        { status: "asc" },
        { priority: "desc" },
        { dueAt: "asc" },
        { createdAt: "desc" },
      ],
      skip: (page - 1) * limit,
      take: limit,
    });

    const enriched = await this.enrich(actions, owner, memberUserId);
    const objectives = await this.prisma.pendingActionFollowUp.findMany({
      where: { pendingActionId: { in: actions.map((action) => action.id) } },
      select: {
        id: true,
        pendingActionId: true,
        objectiveType: true,
        state: true,
        mode: true,
        nextAction: true,
        nextActionAt: true,
        reason: true,
      },
    });
    const objectiveByAction = new Map(
      objectives.map(({ pendingActionId, ...objective }) => [
        pendingActionId,
        objective,
      ]),
    );
    const data = enriched.map((action) => ({
      ...action,
      followUp: objectiveByAction.get(action.id) ?? null,
    }));
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Badge predicate (4.6): pending, counts toward badge, not snoozed, not
   * expired, AND (high priority OR due-today/overdue OR a review-type action).
   */
  badgeWhere(
    owner: PendingActionOwnerFilter,
    memberUserId?: string,
  ): Prisma.PendingActionWhereInput {
    const now = new Date();
    return {
      AND: [
        this.ownerWhere(owner),
        memberUserId ? { userId: memberUserId } : {},
        { status: PendingActionStatus.pending },
        { countsTowardBadge: true },
        { OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        {
          OR: [
            { priority: PendingActionPriority.high },
            { dueAt: { lte: endOfToday() } },
            { type: { in: REVIEW_ACTION_TYPES } },
          ],
        },
      ],
    };
  }

  /**
   * One user's open actions of `types` about a contact, due by `dueBy` or
   * undated. Snoozed and expired ones are left out, as the badge does, and so
   * are campaign ones: a campaign works its own leads.
   */
  async listOpenForCalling(
    owner: PendingActionOwnerFilter,
    options: {
      types: PendingActionType[];
      dueBy: Date;
      now: Date;
      limit: number;
      after?: string;
    },
  ): Promise<CallablePendingAction[]> {
    if (!options.types.length) return [];
    // PendingAction's contactId is a scalar, not a Prisma relation. Keep the
    // workspace-wide exclusion in SQL so a page never loads every objective.
    const actions = await this.prisma.$queryRaw<
      Pick<
        PendingAction,
        | "id"
        | "type"
        | "priority"
        | "title"
        | "dueAt"
        | "createdAt"
        | "contactId"
      >[]
    >`
      SELECT a."id", a."type", a."priority", a."title", a."dueAt", a."createdAt", a."contactId"
      FROM "PendingAction" a
      WHERE a."userId" = ${owner.userId}::uuid
        AND a."organizationId" IS NOT DISTINCT FROM ${owner.organizationId ?? null}::uuid
        AND a."status" = 'pending'
        AND a."type"::text IN (${Prisma.join(options.types)})
        AND a."contactId" IS NOT NULL AND a."campaignId" IS NULL
        AND (a."snoozedUntil" IS NULL OR a."snoozedUntil" < ${options.now}::timestamptz AT TIME ZONE 'UTC')
        AND (a."expiresAt" IS NULL OR a."expiresAt" > ${options.now}::timestamptz AT TIME ZONE 'UTC')
        AND (a."dueAt" IS NULL OR a."dueAt" <= ${options.dueBy}::timestamptz AT TIME ZONE 'UTC')
        AND NOT EXISTS (SELECT 1 FROM "PendingActionFollowUp" own WHERE own."pendingActionId" = a."id")
        AND NOT EXISTS (
          SELECT 1 FROM "PendingActionFollowUp" f
          JOIN "PendingAction" assigned ON assigned."id" = f."pendingActionId"
          WHERE assigned."contactId" = a."contactId"
            AND assigned."organizationId" IS NOT DISTINCT FROM ${owner.organizationId ?? null}::uuid
            ${owner.organizationId ? Prisma.empty : Prisma.sql`AND assigned."userId" = ${owner.userId}::uuid`}
            AND f."state" NOT IN (${Prisma.join(FOLLOW_UP_TERMINAL.map((state) => Prisma.sql`${state}::"FollowUpState"`))})
        )
        ${
          options.after
            ? Prisma.sql`AND (COALESCE(a."dueAt", 'infinity'::timestamp), a."createdAt", a."id") > (
          SELECT COALESCE(cursor."dueAt", 'infinity'::timestamp), cursor."createdAt", cursor."id"
          FROM "PendingAction" cursor WHERE cursor."id" = ${options.after}::uuid
            AND cursor."userId" = ${owner.userId}::uuid
            AND cursor."organizationId" IS NOT DISTINCT FROM ${owner.organizationId ?? null}::uuid
        )`
            : Prisma.empty
        }
      ORDER BY a."dueAt" ASC NULLS LAST, a."createdAt" ASC, a."id" ASC
      LIMIT ${options.limit}
    `;

    const contactIds = unique(actions.map((a) => a.contactId));
    const contacts = contactIds.length
      ? await this.prisma.contact.findMany({
          where: { id: { in: contactIds }, deletedAt: null },
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            company: true,
            timezone: true,
          },
        })
      : [];
    const contactMap = new Map(contacts.map((c) => [c.id, c]));

    return actions.map(({ contactId, ...action }) => ({
      ...action,
      contact: contactId ? (contactMap.get(contactId) ?? null) : null,
    }));
  }

  badgeCount(
    owner: PendingActionOwnerFilter,
    memberUserId?: string,
  ): Promise<number> {
    return this.prisma.pendingAction.count({
      where: this.badgeWhere(owner, memberUserId),
    });
  }

  updateStatus(
    id: string,
    status: PendingActionStatus,
    extra?: { completedAt?: Date | null; snoozedUntil?: Date | null },
  ): Promise<PendingAction> {
    return this.prisma.pendingAction.update({
      where: { id },
      data: {
        status,
        ...(extra?.completedAt !== undefined
          ? { completedAt: extra.completedAt }
          : {}),
        ...(extra?.snoozedUntil !== undefined
          ? { snoozedUntil: extra.snoozedUntil }
          : {}),
      },
    });
  }

  countActiveForContext(contextKey: string): Promise<number> {
    return this.prisma.pendingAction.count({
      where: { contextKey, status: PendingActionStatus.pending },
    });
  }

  findFollowUpForAction(
    ctx: OwnershipContext,
    actionId: string,
    memberUserId?: string,
  ) {
    return this.prisma.pendingActionFollowUp.findFirst({
      where: {
        pendingActionId: actionId,
        action: {
          ...buildOwnershipFilter(ctx),
          ...(memberUserId ? { userId: memberUserId } : {}),
        },
      },
    });
  }

  findFollowUpForHandoff(handoffId: string) {
    return this.prisma.pendingActionFollowUp.findUnique({
      where: { handoffId },
    });
  }

  listFollowUps(
    ctx: OwnershipContext,
    options: {
      memberUserId?: string;
      state?: FollowUpState;
      page: number;
      limit: number;
    },
  ) {
    const where: Prisma.PendingActionFollowUpWhereInput = {
      action: {
        ...buildOwnershipFilter(ctx),
        ...(options.memberUserId ? { userId: options.memberUserId } : {}),
      },
      ...(options.state ? { state: options.state } : {}),
    };
    return Promise.all([
      this.prisma.pendingActionFollowUp.findMany({
        where,
        include: {
          action: { select: { contactId: true } },
          events: {
            orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
            take: 1,
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
      this.prisma.pendingActionFollowUp.count({ where }),
    ]);
  }

  async planHumanFollowUpStep(
    id: string,
    revision: number,
    at: Date,
    kind: "recovery" | "agreed",
    agentCallId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const row = await lockFollowUp(tx, id);
      if (!row || row.sourceType !== "human_call_outcome") return null;
      // A proven-unplaced callback does not consume recoveryCount. Bind a new
      // recovery to this review revision while retaining the same replay key.
      const key = agentCallId
        ? `followup:${id}:agreed:${agentCallId}`
        : `followup:${id}:recovery:revision:${revision}`;
      const existing = await tx.callbackTask.findUnique({
        where: { agentCallbackKey: key },
      });
      if (existing) return existing;
      if (
        row.revision !== revision ||
        row.mode !== "automatic" ||
        ["paused", "blocked", "resolved", "closed"].includes(row.state) ||
        row.attemptCount >= row.maxAttempts ||
        (kind === "recovery" && row.recoveryCount >= row.maxRecoveries) ||
        at >= row.expiresAt
      )
        return null;
      const action = await tx.pendingAction.findUniqueOrThrow({
        where: { id: row.pendingActionId },
      });
      if (
        await tx.callbackTask.count({
          where: {
            followUpId: id,
            dispatchCommittedAt: null,
            status: { in: ["scheduled", "due", "in_progress"] },
          },
        })
      )
        return null;
      if (
        agentCallId &&
        !(await tx.callbackTask.count({
          where: {
            followUpId: id,
            agentCallId,
            dispatchCommittedAt: { not: null },
            sourceRevision: row.sourceRevision,
          },
        }))
      )
        return null;
      const callback = await tx.callbackTask.create({
        data: {
          userId: row.configuredByUserId,
          organizationId: action.organizationId,
          contactId: action.contactId!,
          callId: action.callId,
          followUpId: id,
          sourceRevision: row.sourceRevision,
          agentId: row.agentId,
          agentCallbackKind: kind,
          agentCallbackKey: key,
          scheduledAt: at,
          note: row.desiredResult,
        },
      });
      await applyFollowUpPlan(
        tx,
        row,
        {
          state: "scheduled",
          reason: kind === "agreed" ? "callback_agreed" : "policy_recovery",
          nextAction: "specialist_callback",
          nextActionAt: at,
          timingBasis: kind === "agreed" ? "agreed" : "policy",
          activeCallbackId: null,
        },
        {
          key,
          kind: "callback_scheduled",
          evidence: {
            callbackId: callback.id,
            timingBasis: kind === "agreed" ? "agreed" : "policy",
          },
        },
        new Date(),
      );
      return callback;
    });
  }

  followUpForAgentCall(agentCallId: string) {
    return this.prisma.callbackTask.findUnique({
      where: { agentCallId },
      include: { followUp: true },
    });
  }

  sourceCallback(ctx: OwnershipContext, callId: string) {
    return this.prisma.callbackTask.findFirst({
      where: {
        ...buildOwnershipFilter(ctx),
        callId,
        agentCallbackKind: null,
        status: { in: ["scheduled", "due"] },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  followUpSnapshot(id: string) {
    return this.prisma.pendingActionFollowUp.findUnique({
      where: { id },
      include: {
        action: true,
        handoff: {
          include: {
            agentCall: {
              select: {
                id: true,
                callId: true,
                userId: true,
                organizationId: true,
                providerCallControlId: true,
                status: true,
                aiChargedCredits: true,
                aiCostDebitedAt: true,
                call: {
                  select: {
                    id: true,
                    userId: true,
                    organizationId: true,
                    status: true,
                    endedAt: true,
                    answeredAt: true,
                    startedAt: true,
                    totalCost: true,
                    durationSeconds: true,
                  },
                },
              },
            },
          },
        },
        callbacks: {
          orderBy: { createdAt: "desc" },
          include: {
            agentCall: {
              select: {
                id: true,
                callId: true,
                userId: true,
                organizationId: true,
                providerCallControlId: true,
                status: true,
                aiChargedCredits: true,
                aiCostDebitedAt: true,
                call: {
                  select: {
                    id: true,
                    userId: true,
                    organizationId: true,
                    status: true,
                    endedAt: true,
                    answeredAt: true,
                    startedAt: true,
                    totalCost: true,
                    durationSeconds: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async ownsFollowUpEvent(followUpId: string, id: string) {
    return (
      (await this.prisma.pendingActionFollowUpEvent.count({
        where: { id, followUpId },
      })) === 1
    );
  }

  followUpEvents(id: string, after?: string) {
    return this.prisma.pendingActionFollowUpEvent.findMany({
      where: { followUpId: id },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      take: 100,
    });
  }

  listFollowUpsForReview(now: Date, limit: number) {
    return this.prisma.pendingActionFollowUp.findMany({
      where: { state: { notIn: FOLLOW_UP_TERMINAL }, reviewAt: { lte: now } },
      orderBy: [{ reviewAt: "asc" }, { id: "asc" }],
      take: limit,
      select: { id: true },
    });
  }

  /** A versioned plan: a pause, callback event or newer reconciler fences it. */
  async applyFollowUpTransition(input: {
    id: string;
    expectedRevision: number;
    plan: FollowUpPlan;
    key: string;
    kind: string;
    actorId?: string;
    now: Date;
    resumeAt?: Date;
    resumeBinding?: {
      agentId: string;
      calendarId: string;
      automationId: string;
    };
    meetingEvidence?: {
      id: string;
      revision: number;
      scheduledAt: Date;
      organizationId: string;
      contactId: string;
    };
  }) {
    return this.prisma.$transaction(async (tx) => {
      if (input.plan.state === "resolved") {
        const evidence = input.meetingEvidence;
        if (!evidence) return null;
        await tx.$queryRaw`SELECT "id" FROM "Meeting" WHERE "id" = ${evidence.id}::uuid FOR UPDATE`;
        const stillAuthoritative = await tx.meeting.count({
          where: {
            id: evidence.id,
            organizationId: evidence.organizationId,
            contactId: evidence.contactId,
            scheduleVersion: evidence.revision,
            scheduledAt: evidence.scheduledAt,
            status: { in: ["scheduled", "rescheduled"] },
          },
        });
        if (!stillAuthoritative) return null;
      }
      const row = await lockFollowUp(tx, input.id);
      if (
        !row ||
        row.revision !== input.expectedRevision ||
        FOLLOW_UP_TERMINAL.includes(row.state)
      )
        return null;
      const updated = await applyFollowUpPlan(
        tx,
        row,
        input.plan,
        {
          key: input.key,
          kind: input.kind,
          actorType: input.actorId ? "human" : "system",
          actorId: input.actorId,
          evidence: input.plan.evidence,
          at: input.now,
        },
        input.now,
      );
      if (input.resumeBinding && row.sourceType === "human_call_outcome") {
        await tx.pendingActionFollowUp.update({
          where: { id: row.id },
          data: input.resumeBinding,
        });
      }
      if (input.resumeAt) {
        // Restore at most one uncommitted step. All older steps stay withdrawn;
        // an already committed placement keeps its identity for reconciliation.
        const callback = await tx.callbackTask.findFirst({
          where: {
            followUpId: row.id,
            status: "cancelled",
            dispatchCommittedAt: null,
            reason: { in: ["objective_paused", "objective_blocked"] },
          },
          orderBy: { createdAt: "desc" },
        });
        if (callback) {
          await tx.callbackTask.update({
            where: { id: callback.id },
            data: {
              status: "scheduled",
              scheduledAt: input.resumeAt,
              ...(input.resumeBinding
                ? { agentId: input.resumeBinding.agentId }
                : {}),
              agentCallbackKind:
                input.plan.timingBasis === "agreed" ? "agreed" : "recovery",
              notBefore: null,
              dialTries: 0,
              dialReservedAt: null,
              claimToken: null,
              leaseExpiresAt: null,
              reason: null,
            },
          });
          await tx.pendingActionFollowUp.update({
            where: { id: row.id },
            data: {
              nextAction: "specialist_callback",
              nextActionAt: input.resumeAt,
              timingBasis: input.plan.timingBasis ?? "policy",
            },
          });
        }
      }
      return updated;
    });
  }

  async deferFollowUpReview(
    id: string,
    revision: number,
    until: Date,
    nextActionAt?: Date,
  ) {
    await this.prisma.pendingActionFollowUp.updateMany({
      where: { id, revision },
      data: { reviewAt: until, nextActionAt },
    });
  }

  private async enrich(
    actions: PendingAction[],
    owner: PendingActionOwnerFilter,
    memberUserId?: string,
  ): Promise<PendingActionDisplay[]> {
    const contactIds = unique(actions.map((a) => a.contactId));
    const callIds = unique(actions.map((a) => a.callId));
    const campaignIds = unique(actions.map((a) => a.campaignId));

    const [contacts, calls, campaigns] = await Promise.all([
      contactIds.length
        ? this.prisma.contact.findMany({
            where: {
              id: { in: contactIds },
              ...buildOwnershipFilter(owner),
              deletedAt: null,
            },
            select: { id: true, name: true, phoneNumber: true, company: true },
          })
        : Promise.resolve([]),
      callIds.length
        ? this.prisma.call.findMany({
            where: {
              id: { in: callIds },
              ...buildOwnershipFilter(owner),
              ...(memberUserId ? { userId: memberUserId } : {}),
            },
            select: { id: true, outcome: true, startedAt: true },
          })
        : Promise.resolve([]),
      campaignIds.length
        ? this.prisma.campaign.findMany({
            where: { id: { in: campaignIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    const contactMap = new Map(contacts.map((c) => [c.id, c]));
    const callMap = new Map(calls.map((c) => [c.id, c]));
    const campaignMap = new Map(campaigns.map((c) => [c.id, c]));

    return actions.map((a) => ({
      ...a,
      contact: a.contactId ? (contactMap.get(a.contactId) ?? null) : null,
      callId: a.callId && callMap.has(a.callId) ? a.callId : null,
      call: a.callId
        ? ((callMap.get(a.callId) as PendingActionDisplay["call"]) ?? null)
        : null,
      campaign: a.campaignId ? (campaignMap.get(a.campaignId) ?? null) : null,
    }));
  }
}

function unique(ids: (string | null)[]): string[] {
  return [...new Set(ids.filter((id): id is string => !!id))];
}
