import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CampaignLead, CampaignLeadStatus, Prisma } from "@prisma/client";

export interface CampaignLeadWithContact extends CampaignLead {
  contact: {
    id: string;
    name: string | null;
    phoneNumber: string;
    email: string | null;
    company: string | null;
    jobTitle: string | null;
    locationRegion: string | null;
    websiteUrl: string | null;
    revenue: string | null;
    companySize: string | null;
  };
}

@Injectable()
export class CampaignLeadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    campaignId: string;
    contactId: string;
    userId?: string;
    metadata?: Prisma.JsonValue;
  }): Promise<CampaignLead> {
    return this.prisma.campaignLead.create({
      data: {
        campaign: { connect: { id: data.campaignId } },
        contact: { connect: { id: data.contactId } },
        user: data.userId ? { connect: { id: data.userId } } : undefined,
        metadata: data.metadata ?? Prisma.DbNull,
      },
    });
  }

  async createMany(
    campaignId: string,
    leads: Array<{ contactId: string; metadata?: Prisma.JsonValue }>,
  ): Promise<number> {
    const result = await this.prisma.campaignLead.createMany({
      data: leads.map((lead) => ({
        campaignId,
        contactId: lead.contactId,
        metadata: lead.metadata ?? Prisma.DbNull,
      })),
      skipDuplicates: true,
    });
    return result.count;
  }

  async findByIdWithContact(
    id: string,
  ): Promise<CampaignLeadWithContact | null> {
    const lead = await this.prisma.campaignLead.findUnique({
      where: { id },
      include: {
        contact: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            email: true,
            company: true,
            jobTitle: true,
            locationRegion: true,
            websiteUrl: true,
            revenue: true,
            companySize: true,
          },
        },
      },
    });
    return lead as CampaignLeadWithContact | null;
  }

  async findByCampaign(
    campaignId: string,
    options?: {
      page?: number;
      limit?: number;
      status?: string;
    },
  ): Promise<{
    data: CampaignLeadWithContact[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const { page = 1, limit = 20, status } = options || {};

    // Filter by the real CampaignLeadStatus enum column so it matches the
    // status badges shown in the UI. Legacy aggregate aliases ("called" /
    // "dead") are kept for backwards compatibility with older callers.
    let statusFilter: Prisma.CampaignLeadWhereInput = {};
    if (status === "called") {
      statusFilter = { attempts: { gt: 0 }, deadAt: null };
    } else if (status === "dead") {
      statusFilter = { deadAt: { not: null } };
    } else if (
      status &&
      (Object.values(CampaignLeadStatus) as string[]).includes(status)
    ) {
      statusFilter = { status: status as CampaignLeadStatus };
    }

    const where: Prisma.CampaignLeadWhereInput = {
      campaignId,
      ...statusFilter,
    };

    const total = await this.prisma.campaignLead.count({ where });

    const data = await this.prisma.campaignLead.findMany({
      where,
      include: {
        contact: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            email: true,
            company: true,
            jobTitle: true,
            locationRegion: true,
            websiteUrl: true,
            revenue: true,
            companySize: true,
          },
        },
      },
      orderBy: [{ nextCallAt: "asc" }, { createdAt: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: data as CampaignLeadWithContact[],
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Hard-delete a single campaign lead. Cascades to its CallAttempt and
   * CallbackTask rows (onDelete: Cascade in the schema). The underlying
   * Contact is left untouched — this only removes campaign membership.
   */
  async deleteById(id: string): Promise<void> {
    await this.prisma.campaignLead.delete({ where: { id } });
  }

  async findExistingContactIds(
    campaignId: string,
    contactIds: string[],
  ): Promise<string[]> {
    const existing = await this.prisma.campaignLead.findMany({
      where: {
        campaignId,
        contactId: { in: contactIds },
      },
      select: { contactId: true },
    });
    return existing.map((l) => l.contactId);
  }

  async updateAttempt(
    id: string,
    data: {
      attempts?: number;
      lastCallAt?: Date;
      nextCallAt?: Date | null;
      deadAt?: Date | null;
    },
  ): Promise<CampaignLead> {
    return this.prisma.campaignLead.update({
      where: { id },
      data,
    });
  }

  async incrementAttempt(id: string): Promise<CampaignLead> {
    return this.prisma.campaignLead.update({
      where: { id },
      data: {
        attempts: { increment: 1 },
        lastCallAt: new Date(),
      },
    });
  }

  async assignToAgent(leadId: string, userId: string): Promise<CampaignLead> {
    return this.prisma.campaignLead.update({
      where: { id: leadId },
      data: { user: { connect: { id: userId } } },
    });
  }

  async markAsDead(id: string): Promise<CampaignLead> {
    return this.prisma.campaignLead.update({
      where: { id },
      data: { deadAt: new Date(), status: CampaignLeadStatus.exhausted },
    });
  }

  async updateStatus(
    id: string,
    status: CampaignLeadStatus,
    extra?: Partial<
      Pick<
        CampaignLead,
        "lockedBy" | "lockedAt" | "nextCallAt" | "userId" | "priority"
      >
    >,
  ): Promise<CampaignLead> {
    return this.prisma.campaignLead.update({
      where: { id },
      data: { status, ...extra },
    });
  }

  /**
   * Atomically lock the next eligible lead for a campaign using
   * SELECT FOR UPDATE SKIP LOCKED to prevent double-assignment.
   */
  async lockNextLead(
    campaignId: string,
    agentSessionId: string,
    maxAttempts: number,
    organizationId: string,
  ): Promise<CampaignLeadWithContact | null> {
    const result = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE "CampaignLead" cl
      SET "lockedBy" = ${agentSessionId}::uuid,
          "lockedAt" = NOW(),
          "status" = 'locked'::"CampaignLeadStatus",
          "updatedAt" = NOW()
      FROM (
        SELECT cl2.id FROM "CampaignLead" cl2
        JOIN "Contact" c ON c.id = cl2."contactId"
        LEFT JOIN "DNCEntry" dnc ON dnc."phoneNumber" = c."phoneNumber"
          AND dnc."organizationId" = ${organizationId}::uuid
        WHERE cl2."campaignId" = ${campaignId}::uuid
          AND cl2."status" = 'queued'::"CampaignLeadStatus"
          AND cl2."lockedBy" IS NULL
          AND dnc.id IS NULL
          AND (cl2."nextCallAt" IS NULL OR cl2."nextCallAt" <= NOW())
          AND cl2."attempts" < ${maxAttempts}
        ORDER BY cl2."priority" DESC, cl2."nextCallAt" ASC NULLS FIRST, cl2."createdAt" ASC
        LIMIT 1
        FOR UPDATE OF cl2 SKIP LOCKED
      ) sub
      WHERE cl.id = sub.id
      RETURNING cl.id
    `;

    if (result.length === 0) return null;

    // Fetch the full lead with contact info
    const lead = await this.prisma.campaignLead.findUnique({
      where: { id: result[0].id },
      include: {
        contact: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            email: true,
            company: true,
            jobTitle: true,
            locationRegion: true,
            websiteUrl: true,
            revenue: true,
            companySize: true,
          },
        },
      },
    });

    return lead as CampaignLeadWithContact | null;
  }

  /**
   * Release a lead back to queued status.
   *
   * Only genuinely in-flight leads (locked / dialing / in_call / wrap_up) are
   * returned to the queue. A terminal lead (completed / dnc / exhausted) or one
   * already dispositioned must never be resurrected — re-queueing a DNC lead
   * would let it be dialed again, which is a compliance violation.
   *
   * Returns the number of leads actually released (0 if it was already terminal).
   */
  async releaseLock(id: string): Promise<number> {
    const result = await this.prisma.campaignLead.updateMany({
      where: {
        id,
        status: {
          in: [
            CampaignLeadStatus.locked,
            CampaignLeadStatus.dialing,
            CampaignLeadStatus.in_call,
            CampaignLeadStatus.wrap_up,
          ],
        },
      },
      data: {
        status: CampaignLeadStatus.queued,
        lockedBy: null,
        lockedAt: null,
      },
    });
    return result.count;
  }

  /**
   * Batch transition all pending leads to queued when campaign starts.
   */
  async queueAllPending(campaignId: string): Promise<number> {
    const result = await this.prisma.campaignLead.updateMany({
      where: { campaignId, status: CampaignLeadStatus.pending },
      data: { status: CampaignLeadStatus.queued },
    });
    return result.count;
  }

  /**
   * Safety net for orphaned locks: return leads that have been stuck in
   * `locked` longer than the threshold (e.g. an agent session that died mid-lock
   * before the call was placed and was never cleaned up) back to the queue.
   *
   * Retries themselves do NOT rely on this — evaluateRetry re-queues a lead
   * directly with a future nextCallAt and lockNextLead honours it. This only
   * recovers leads that would otherwise be locked forever.
   *
   * Returns the number of leads recovered.
   */
  async requeueStaleLocked(thresholdMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - thresholdMs);
    const result = await this.prisma.campaignLead.updateMany({
      where: {
        status: CampaignLeadStatus.locked,
        lockedAt: { lt: cutoff },
      },
      data: {
        status: CampaignLeadStatus.queued,
        lockedBy: null,
        lockedAt: null,
      },
    });
    return result.count;
  }

  /**
   * Count leads by status for a campaign.
   */
  async countByStatus(
    campaignId: string,
  ): Promise<{ status: CampaignLeadStatus; count: number }[]> {
    const results = await this.prisma.campaignLead.groupBy({
      by: ["status"],
      where: { campaignId },
      _count: true,
    });
    return results.map((r) => ({ status: r.status, count: r._count }));
  }

  /**
   * Check if all leads in a campaign are in terminal states.
   */
  async allLeadsTerminal(campaignId: string): Promise<boolean> {
    const terminalStatuses: CampaignLeadStatus[] = [
      CampaignLeadStatus.completed,
      CampaignLeadStatus.exhausted,
      CampaignLeadStatus.dnc,
    ];
    const nonTerminal = await this.prisma.campaignLead.count({
      where: {
        campaignId,
        status: { notIn: terminalStatuses },
      },
    });
    return nonTerminal === 0;
  }
}
