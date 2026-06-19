import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AiPipelineType, NumberPurchased, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

/**
 * Cross-tenant reads + admin mutations for the internal super-admin
 * (backoffice) area. Unlike every other repository here it intentionally
 * ignores OwnershipContext scoping — access is gated by the SuperAdminGuard at
 * the controller, never by the data layer.
 */

export type AccountType = "user" | "org";

export interface CallerActivityRow {
  id: string;
  type: AccountType;
  name: string;
  email: string | null;
  calls: number;
  answered: number;
  totalCost: number;
  totalDurationSec: number;
  lastCallAt: Date | null;
}

export interface BackofficeDashboard {
  range: { start: string; end: string };
  totals: {
    calls: number;
    totalCost: number;
    users: number;
    organizations: number;
  };
  users: CallerActivityRow[];
  organizations: CallerActivityRow[];
}

export interface AccountListItem {
  id: string;
  type: AccountType;
  name: string;
  email: string | null;
  slug: string | null;
  creditBalance: number;
  numbersCount: number;
  callsCount: number;
  recordAllCalls: boolean;
  transcribeRealtime: boolean;
  transcribeRecordings: boolean;
  aiPipelineEnabled: boolean;
  createdAt: Date;
}

export interface AccountListResult {
  items: AccountListItem[];
  total: number;
}

export interface AssignedNumber {
  id: string;
  phoneNumber: string;
  isoCountry: string;
  status: string | null;
}

export interface AccountDetail extends AccountListItem {
  numbers: AssignedNumber[];
  pipelineRows: { pipelineType: AiPipelineType; enabled: boolean }[];
}

export interface NumberListItem {
  id: string;
  phoneNumber: string;
  isoCountry: string;
  status: string | null;
  assigned: boolean;
  userId: string | null;
  organizationId: string | null;
}

function round2(n: number | null | undefined): number {
  return Math.round((n ?? 0) * 100) / 100;
}

function fullName(u: { firstName: string | null; lastName: string | null }) {
  return [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
}

function primaryEmail(
  emails: { email: string; isPrimary: boolean }[],
): string | null {
  return emails.find((e) => e.isPrimary)?.email ?? emails[0]?.email ?? null;
}

const numberSelect = {
  id: true,
  phoneNumber: true,
  isoCountry: true,
  status: true,
} satisfies Prisma.NumberPurchasedSelect;

@Injectable()
export class BackofficeRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Dashboard ──────────────────────────────────────────────

  async getDashboard(start: Date, end: Date): Promise<BackofficeDashboard> {
    const where: Prisma.CallWhereInput = {
      createdAt: { gte: start, lte: end },
    };

    const [userAll, userAnswered, orgAll, orgAnswered, totalAgg] =
      await Promise.all([
        this.prisma.call.groupBy({
          by: ["userId"],
          where: { ...where, userId: { not: null } },
          _count: { _all: true },
          _sum: { totalCost: true, durationSeconds: true },
          _max: { createdAt: true },
        }),
        this.prisma.call.groupBy({
          by: ["userId"],
          where: { ...where, userId: { not: null }, answeredAt: { not: null } },
          _count: { _all: true },
        }),
        this.prisma.call.groupBy({
          by: ["organizationId"],
          where: { ...where, organizationId: { not: null } },
          _count: { _all: true },
          _sum: { totalCost: true, durationSeconds: true },
          _max: { createdAt: true },
        }),
        this.prisma.call.groupBy({
          by: ["organizationId"],
          where: {
            ...where,
            organizationId: { not: null },
            answeredAt: { not: null },
          },
          _count: { _all: true },
        }),
        this.prisma.call.aggregate({
          where,
          _count: { _all: true },
          _sum: { totalCost: true },
        }),
      ]);

    const userIds = userAll
      .map((r) => r.userId)
      .filter((id): id is string => !!id);
    const orgIds = orgAll
      .map((r) => r.organizationId)
      .filter((id): id is string => !!id);

    const [users, orgs] = await Promise.all([
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              emails: { select: { email: true, isPrimary: true } },
            },
          })
        : [],
      orgIds.length
        ? this.prisma.organization.findMany({
            where: { id: { in: orgIds } },
            select: { id: true, name: true, slug: true },
          })
        : [],
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));
    const orgMap = new Map(orgs.map((o) => [o.id, o]));
    const userAnsweredMap = new Map(
      userAnswered.map((r) => [r.userId, r._count._all]),
    );
    const orgAnsweredMap = new Map(
      orgAnswered.map((r) => [r.organizationId, r._count._all]),
    );

    const userRows: CallerActivityRow[] = userAll
      .map((r) => {
        const u = userMap.get(r.userId!);
        const email = u ? primaryEmail(u.emails) : null;
        return {
          id: r.userId!,
          type: "user" as const,
          name: (u && fullName(u)) || email || r.userId!,
          email,
          calls: r._count._all,
          answered: userAnsweredMap.get(r.userId!) ?? 0,
          totalCost: round2(r._sum.totalCost),
          totalDurationSec: r._sum.durationSeconds ?? 0,
          lastCallAt: r._max.createdAt,
        };
      })
      .sort((a, b) => b.calls - a.calls);

    const orgRows: CallerActivityRow[] = orgAll
      .map((r) => {
        const o = orgMap.get(r.organizationId!);
        return {
          id: r.organizationId!,
          type: "org" as const,
          name: o?.name || r.organizationId!,
          email: o?.slug ?? null,
          calls: r._count._all,
          answered: orgAnsweredMap.get(r.organizationId!) ?? 0,
          totalCost: round2(r._sum.totalCost),
          totalDurationSec: r._sum.durationSeconds ?? 0,
          lastCallAt: r._max.createdAt,
        };
      })
      .sort((a, b) => b.calls - a.calls);

    return {
      range: { start: start.toISOString(), end: end.toISOString() },
      totals: {
        calls: totalAgg._count._all,
        totalCost: round2(totalAgg._sum.totalCost),
        users: userRows.length,
        organizations: orgRows.length,
      },
      users: userRows,
      organizations: orgRows,
    };
  }

  // ── Account listing ────────────────────────────────────────

  async listAccounts(params: {
    type: AccountType;
    search?: string;
    skip: number;
    take: number;
  }): Promise<AccountListResult> {
    return params.type === "org"
      ? this.listOrgAccounts(params)
      : this.listUserAccounts(params);
  }

  private async listUserAccounts(params: {
    search?: string;
    skip: number;
    take: number;
  }): Promise<AccountListResult> {
    const search = params.search?.trim();
    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            {
              emails: {
                some: { email: { contains: search, mode: "insensitive" } },
              },
            },
          ],
        }
      : {};

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          createdAt: true,
          emails: { select: { email: true, isPrimary: true } },
          Credit: {
            where: { organizationId: null },
            select: { amount: true },
          },
          callRecordingSettings: {
            select: {
              recordAllCalls: true,
              transcribeRealtime: true,
              transcribeRecordings: true,
            },
          },
          _count: { select: { numbersOwned: true, calls: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const enabled = await this.enabledPipelineKeys(
      rows.map((r) => `personal:${r.id}`),
    );

    const items: AccountListItem[] = rows.map((r) => ({
      id: r.id,
      type: "user",
      name: fullName(r) || primaryEmail(r.emails) || r.id,
      email: primaryEmail(r.emails),
      slug: null,
      creditBalance: round2(r.Credit[0]?.amount),
      numbersCount: r._count.numbersOwned,
      callsCount: r._count.calls,
      recordAllCalls: r.callRecordingSettings?.recordAllCalls ?? false,
      transcribeRealtime: r.callRecordingSettings?.transcribeRealtime ?? false,
      transcribeRecordings:
        r.callRecordingSettings?.transcribeRecordings ?? false,
      aiPipelineEnabled: enabled.has(`personal:${r.id}`),
      createdAt: r.createdAt,
    }));

    return { items, total };
  }

  private async listOrgAccounts(params: {
    search?: string;
    skip: number;
    take: number;
  }): Promise<AccountListResult> {
    const search = params.search?.trim();
    const where: Prisma.OrganizationWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    const [rows, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          credits: { select: { amount: true } },
          callRecordingSettings: {
            select: {
              recordAllCalls: true,
              transcribeRealtime: true,
              transcribeRecordings: true,
            },
          },
          _count: {
            select: { numbersPurchased: true, calls: true, members: true },
          },
        },
      }),
      this.prisma.organization.count({ where }),
    ]);

    const enabled = await this.enabledPipelineKeys(
      rows.map((r) => `org_no_campaign:${r.id}`),
    );

    const items: AccountListItem[] = rows.map((r) => ({
      id: r.id,
      type: "org",
      name: r.name || r.id,
      email: null,
      slug: r.slug,
      creditBalance: round2(r.credits[0]?.amount),
      numbersCount: r._count.numbersPurchased,
      callsCount: r._count.calls,
      recordAllCalls: r.callRecordingSettings?.recordAllCalls ?? false,
      transcribeRealtime: r.callRecordingSettings?.transcribeRealtime ?? false,
      transcribeRecordings:
        r.callRecordingSettings?.transcribeRecordings ?? false,
      aiPipelineEnabled: enabled.has(`org_no_campaign:${r.id}`),
      createdAt: r.createdAt,
    }));

    return { items, total };
  }

  // ── Account detail ─────────────────────────────────────────

  async getAccount(type: AccountType, id: string): Promise<AccountDetail> {
    if (type === "org") return this.getOrgAccount(id);
    return this.getUserAccount(id);
  }

  private async getUserAccount(id: string): Promise<AccountDetail> {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        emails: { select: { email: true, isPrimary: true } },
        Credit: { where: { organizationId: null }, select: { amount: true } },
        callRecordingSettings: {
          select: {
            recordAllCalls: true,
            transcribeRealtime: true,
            transcribeRecordings: true,
          },
        },
        _count: { select: { numbersOwned: true, calls: true } },
      },
    });
    if (!u) throw new NotFoundException("User not found");

    const [numbers, pipelineRows, enabled] = await Promise.all([
      this.prisma.numberPurchased.findMany({
        where: { userId: id },
        select: numberSelect,
        orderBy: { phoneNumber: "asc" },
      }),
      this.pipelineRows(`personal:${id}`),
      this.enabledPipelineKeys([`personal:${id}`]),
    ]);

    return {
      id: u.id,
      type: "user",
      name: fullName(u) || primaryEmail(u.emails) || u.id,
      email: primaryEmail(u.emails),
      slug: null,
      creditBalance: round2(u.Credit[0]?.amount),
      numbersCount: u._count.numbersOwned,
      callsCount: u._count.calls,
      recordAllCalls: u.callRecordingSettings?.recordAllCalls ?? false,
      transcribeRealtime: u.callRecordingSettings?.transcribeRealtime ?? false,
      transcribeRecordings:
        u.callRecordingSettings?.transcribeRecordings ?? false,
      aiPipelineEnabled: enabled.has(`personal:${id}`),
      createdAt: u.createdAt,
      numbers,
      pipelineRows,
    };
  }

  private async getOrgAccount(id: string): Promise<AccountDetail> {
    const o = await this.prisma.organization.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        credits: { select: { amount: true } },
        callRecordingSettings: {
          select: {
            recordAllCalls: true,
            transcribeRealtime: true,
            transcribeRecordings: true,
          },
        },
        _count: { select: { numbersPurchased: true, calls: true } },
      },
    });
    if (!o) throw new NotFoundException("Organization not found");

    const [numbers, pipelineRows, enabled] = await Promise.all([
      this.prisma.numberPurchased.findMany({
        where: { organizationId: id },
        select: numberSelect,
        orderBy: { phoneNumber: "asc" },
      }),
      this.pipelineRows(`org_no_campaign:${id}`),
      this.enabledPipelineKeys([`org_no_campaign:${id}`]),
    ]);

    return {
      id: o.id,
      type: "org",
      name: o.name || o.id,
      email: null,
      slug: o.slug,
      creditBalance: round2(o.credits[0]?.amount),
      numbersCount: o._count.numbersPurchased,
      callsCount: o._count.calls,
      recordAllCalls: o.callRecordingSettings?.recordAllCalls ?? false,
      transcribeRealtime: o.callRecordingSettings?.transcribeRealtime ?? false,
      transcribeRecordings:
        o.callRecordingSettings?.transcribeRecordings ?? false,
      aiPipelineEnabled: enabled.has(`org_no_campaign:${id}`),
      createdAt: o.createdAt,
      numbers,
      pipelineRows,
    };
  }

  // ── Numbers ────────────────────────────────────────────────

  async listNumbers(params: {
    status: "available" | "assigned" | "all";
    search?: string;
  }): Promise<NumberListItem[]> {
    const search = params.search?.trim();
    const ownership: Prisma.NumberPurchasedWhereInput =
      params.status === "available"
        ? { userId: null, organizationId: null }
        : params.status === "assigned"
          ? {
              OR: [
                { userId: { not: null } },
                { organizationId: { not: null } },
              ],
            }
          : {};

    const where: Prisma.NumberPurchasedWhereInput = {
      ...ownership,
      ...(search ? { phoneNumber: { contains: search } } : {}),
    };

    const rows = await this.prisma.numberPurchased.findMany({
      where,
      orderBy: { phoneNumber: "asc" },
      take: 200,
      select: {
        id: true,
        phoneNumber: true,
        isoCountry: true,
        status: true,
        userId: true,
        organizationId: true,
      },
    });

    return rows.map((r) => ({
      ...r,
      assigned: !!(r.userId || r.organizationId),
    }));
  }

  /**
   * Assign a purchased number to an owner and create an enabled UserNumber so
   * the owner can actually place calls. The existing
   * NumberPurchasedRepository.assignToOwner only re-enables a pre-existing
   * disabled UserNumber, so the backoffice needs its own path that creates one.
   */
  async adminAssign(
    numberId: string,
    owner: { userId: string; organizationId: string | null },
  ): Promise<NumberPurchased> {
    const number = await this.prisma.numberPurchased.findUnique({
      where: { id: numberId },
    });
    if (!number) throw new NotFoundException("Number not found");
    if (number.userId || number.organizationId) {
      throw new BadRequestException(
        "Number is already assigned — unassign it first",
      );
    }

    // Start clean so the unique (userId, numberId, enabled) tuple can't clash.
    await this.prisma.userNumber.deleteMany({
      where: { numberId, userId: owner.userId },
    });
    await this.prisma.userNumber.create({
      data: {
        userId: owner.userId,
        organizationId: owner.organizationId,
        numberId,
        enabled: true,
        canCall: true,
        canReceive: true,
      },
    });

    return this.prisma.numberPurchased.update({
      where: { id: numberId },
      data: {
        userId: owner.userId,
        organizationId: owner.organizationId,
        status: "assigned",
        assignedDate: new Date(),
      },
    });
  }

  /** Detach a number from its owner and disable the enabled UserNumber(s). */
  async adminUnassign(numberId: string): Promise<NumberPurchased> {
    const number = await this.prisma.numberPurchased.findUnique({
      where: { id: numberId },
    });
    if (!number) throw new NotFoundException("Number not found");

    await this.prisma.userNumber.deleteMany({
      where: { numberId, enabled: true },
    });

    return this.prisma.numberPurchased.update({
      where: { id: numberId },
      data: {
        userId: null,
        organizationId: null,
        status: "released",
        assignedDate: null,
      },
    });
  }

  /** Pick a concrete member to own an org-assigned number's UserNumber. */
  async resolveOrgOwnerUserId(orgId: string): Promise<string | null> {
    const m = await this.prisma.organizationMembership.findFirst({
      where: { organizationId: orgId, userId: { not: null } },
      // "org:admin" sorts before "org:member" so an admin is preferred.
      orderBy: { role: "asc" },
      select: { userId: true },
    });
    return m?.userId ?? null;
  }

  // ── helpers ────────────────────────────────────────────────

  private async enabledPipelineKeys(keys: string[]): Promise<Set<string>> {
    if (keys.length === 0) return new Set();
    const rows = await this.prisma.aiPipelineActivation.findMany({
      where: { contextKey: { in: keys }, enabled: true },
      select: { contextKey: true },
    });
    return new Set(rows.map((r) => r.contextKey));
  }

  private async pipelineRows(
    contextKey: string,
  ): Promise<{ pipelineType: AiPipelineType; enabled: boolean }[]> {
    return this.prisma.aiPipelineActivation.findMany({
      where: { contextKey },
      select: { pipelineType: true, enabled: true },
    });
  }
}
