import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import {
  PendingAction,
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

    const data = await this.enrich(actions);
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

  private async enrich(
    actions: PendingAction[],
  ): Promise<PendingActionDisplay[]> {
    const contactIds = unique(actions.map((a) => a.contactId));
    const callIds = unique(actions.map((a) => a.callId));
    const campaignIds = unique(actions.map((a) => a.campaignId));

    const [contacts, calls, campaigns] = await Promise.all([
      contactIds.length
        ? this.prisma.contact.findMany({
            where: { id: { in: contactIds } },
            select: { id: true, name: true, phoneNumber: true, company: true },
          })
        : Promise.resolve([]),
      callIds.length
        ? this.prisma.call.findMany({
            where: { id: { in: callIds } },
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
