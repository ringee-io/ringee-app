import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AiPipelineType, NumberPurchased, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { DEFAULT_OUTBOUND_SOURCES } from "./number.purchased.repository";

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
  userSettings: {
    canCall: boolean;
    minimumCreditPurchase: number;
    freeCallTrial: boolean;
    numberPurchaseLimit: number | null;
    phoneRequired: boolean;
  } | null;
}

/** `retired`: its subscription ended and it left the inventory (soft-deleted). */
export type NumberInventoryStatus =
  | "available"
  | "assigned"
  | "retired"
  | "all";

export interface NumberListItem {
  id: string;
  phoneNumber: string;
  isoCountry: string;
  status: string | null;
  assigned: boolean;
  userId: string | null;
  organizationId: string | null;
  phoneNumberType: string | null;
  /** When its subscription ended and it left the inventory; null while in it. */
  retiredAt: Date | null;
  createdAt: Date;
  assignedDate: Date | null;
  /** The member holding it — for an organization's number, one of its members. */
  user: { id: string; name: string; email: string | null } | null;
  organization: { id: string; name: string; slug: string | null } | null;
}

/** A number as the backoffice registers it: Ringee's own record, nothing more. */
export interface NumberRegistration {
  phoneNumber: string;
  isoCountry: string;
  phoneNumberType: string | null;
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
        canCall: true,
        minimumCreditPurchase: true,
        freeCallTrial: true,
        numberPurchaseLimit: true,
        phoneRequired: true,
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
      userSettings: {
        canCall: u.canCall,
        minimumCreditPurchase: u.minimumCreditPurchase,
        freeCallTrial: u.freeCallTrial ?? false,
        numberPurchaseLimit: u.numberPurchaseLimit,
        phoneRequired: u.phoneRequired,
      },
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
      userSettings: null,
    };
  }

  // ── Numbers ────────────────────────────────────────────────

  /**
   * Ringee DIDs only: a verified caller ID is a customer's own number, never
   * part of the inventory. A retired number keeps its row for call history and
   * is listed only as `retired` (or under `all`). Newest first.
   */
  async listNumbers(params: {
    status: NumberInventoryStatus;
    search?: string;
    limit: number;
  }): Promise<NumberListItem[]> {
    const search = params.search?.trim();
    const state: Prisma.NumberPurchasedWhereInput =
      params.status === "available"
        ? { deletedAt: null, userId: null, organizationId: null }
        : params.status === "assigned"
          ? {
              deletedAt: null,
              OR: [
                { userId: { not: null } },
                { organizationId: { not: null } },
              ],
            }
          : params.status === "retired"
            ? { deletedAt: { not: null } }
            : {};

    const where: Prisma.NumberPurchasedWhereInput = {
      kind: "purchased",
      ...state,
      ...(search ? { AND: [{ OR: this.numberSearch(search) }] } : {}),
    };

    const rows = await this.prisma.numberPurchased.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: params.limit,
      select: {
        id: true,
        phoneNumber: true,
        isoCountry: true,
        status: true,
        userId: true,
        organizationId: true,
        phoneNumberType: true,
        deletedAt: true,
        createdAt: true,
        assignedDate: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            emails: { select: { email: true, isPrimary: true } },
          },
        },
        organization: { select: { id: true, name: true, slug: true } },
      },
    });

    return rows.map(({ deletedAt, user, organization, ...r }) => ({
      ...r,
      assigned: !!(r.userId || r.organizationId),
      retiredAt: deletedAt,
      user: user
        ? {
            id: user.id,
            name: fullName(user) || primaryEmail(user.emails) || user.id,
            email: primaryEmail(user.emails),
          }
        : null,
      organization: organization
        ? {
            id: organization.id,
            name: organization.name || organization.id,
            slug: organization.slug,
          }
        : null,
    }));
  }

  /** A phone number typed any way ("+1 (305) 555"), or its owner's name. */
  private numberSearch(search: string): Prisma.NumberPurchasedWhereInput[] {
    const digits = search.replace(/\D/g, "");
    return [
      ...(digits ? [{ phoneNumber: { contains: digits } }] : []),
      {
        user: {
          is: {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              {
                emails: {
                  some: { email: { contains: search, mode: "insensitive" } },
                },
              },
            ],
          },
        },
      },
      {
        organization: {
          is: {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { slug: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      },
    ];
  }

  /**
   * Put a number into the inventory, unassigned. Only Ringee's records change:
   * nothing is ordered, moved or configured at the carrier.
   *
   * `phoneNumber` is unique and a retired number keeps its row (the calls made
   * from it still point at it), so registering one again revives that row —
   * `retiredId` — instead of creating a second one, and drops whatever its
   * last workspace left behind.
   */
  async adminRegister(
    registration: NumberRegistration,
    retiredId: string | null,
  ): Promise<NumberPurchased> {
    if (!retiredId) {
      return this.prisma.numberPurchased.create({
        data: { ...registration, status: "active", voiceEnabled: true },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const revived = await tx.numberPurchased.updateMany({
        where: { id: retiredId, kind: "purchased", deletedAt: { not: null } },
        data: {
          ...registration,
          deletedAt: null,
          active: true,
          status: "active",
          voiceEnabled: true,
          userId: null,
          organizationId: null,
          assignedDate: null,
          // The last owner's order and subscription price, not this number's.
          purchaseDate: null,
          monthlyCost: null,
          upfrontCost: null,
          currency: null,
          // For this inventory the number starts now, as a revived purchase does.
          createdAt: new Date(),
        },
      });
      if (revived.count === 0) {
        throw new ConflictException("This number is already in Ringee");
      }
      // Retiring a number left its inbound route behind, still naming the
      // last workspace's people.
      await this.detachWorkspaceLinks(tx, retiredId);
      return tx.numberPurchased.findUniqueOrThrow({ where: { id: retiredId } });
    });
  }

  /**
   * Assign an unassigned number to an owner and create an enabled UserNumber so
   * the owner can actually place calls — their primary number when they have
   * none, as a purchase does. The existing
   * NumberPurchasedRepository.assignToOwner only re-enables a pre-existing
   * disabled UserNumber, so the backoffice needs its own path that creates one.
   *
   * The number is claimed with a conditional update, so two admins assigning it
   * at once cannot both win. A retired number comes back through
   * `adminRegister`, never through here.
   */
  async adminAssign(
    numberId: string,
    owner: { userId: string; organizationId: string | null },
  ): Promise<NumberPurchased> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.numberPurchased.updateMany({
        where: {
          id: numberId,
          kind: "purchased",
          deletedAt: null,
          userId: null,
          organizationId: null,
        },
        data: {
          userId: owner.userId,
          organizationId: owner.organizationId,
          status: "assigned",
          assignedDate: new Date(),
        },
      });
      if (claimed.count === 0) {
        const existing = await tx.numberPurchased.findUnique({
          where: { id: numberId },
          select: { kind: true, deletedAt: true },
        });
        if (!existing) throw new NotFoundException("Number not found");
        if (existing.kind !== "purchased") {
          throw new BadRequestException(
            "A verified caller ID cannot be assigned",
          );
        }
        if (existing.deletedAt) {
          throw new BadRequestException(
            "Number is retired — add it again from Numbers first",
          );
        }
        throw new BadRequestException(
          "Number is already assigned — unassign it first",
        );
      }

      // The backoffice used to unassign numbers without detaching them, so an
      // unassigned number may still carry its last workspace's links.
      await this.detachWorkspaceLinks(tx, numberId);
      // The previous owner's verification answers (addresses, documents) are
      // theirs: the next owner starts the requirements from scratch.
      await tx.numberRequirementValue.deleteMany({
        where: { numberPurchasedId: numberId },
      });

      const number = await tx.numberPurchased.findUniqueOrThrow({
        where: { id: numberId },
      });
      const primaries = await tx.userNumber.count({
        where: {
          userId: owner.userId,
          organizationId: owner.organizationId,
          enabled: true,
          isPrimary: true,
        },
      });
      await tx.userNumber.create({
        data: {
          userId: owner.userId,
          organizationId: owner.organizationId,
          numberId,
          enabled: true,
          isPrimary: primaries === 0,
          canCall: true,
          canReceive: true,
          canSendSms: number.smsEnabled,
          canReceiveSms: number.smsEnabled,
          canSendMms: number.mmsEnabled,
          canReceiveMms: number.mmsEnabled,
        },
      });
      return number;
    });
  }

  /**
   * Take a number back from its owner into the inventory, detached from the
   * workspace it leaves. A verified caller ID is refused: it is the customer's
   * own number, and orphaning it would keep them from verifying it again.
   */
  async adminUnassign(numberId: string): Promise<NumberPurchased> {
    return this.prisma.$transaction(async (tx) => {
      const number = await tx.numberPurchased.findUnique({
        where: { id: numberId },
        select: { kind: true },
      });
      if (!number) throw new NotFoundException("Number not found");
      if (number.kind !== "purchased") {
        throw new BadRequestException(
          "A verified caller ID belongs to the customer who verified it",
        );
      }

      await this.detachWorkspaceLinks(tx, numberId);
      return tx.numberPurchased.update({
        where: { id: numberId },
        data: {
          userId: null,
          organizationId: null,
          status: "released",
          assignedDate: null,
        },
      });
    });
  }

  /**
   * Cut every link a number has to the workspace that held it: the clean-up
   * `NumberPurchasedRepository.releasePermanently` does, plus the inbound
   * route, without retiring the number. Left in place, the old workspace's
   * campaigns and desk phones kept presenting the number and its route kept
   * naming the old workspace's people (NUM-009), whoever held it next. Its
   * calls keep pointing at it, so history stays attributable.
   */
  private async detachWorkspaceLinks(
    tx: Prisma.TransactionClient,
    numberId: string,
  ): Promise<void> {
    await tx.sipDevice.updateMany({
      where: { assignedPhoneNumberId: numberId },
      data: { assignedPhoneNumberId: null, callerId: null },
    });
    await tx.campaign.updateMany({
      where: { numberPurchasedId: numberId },
      data: { numberPurchasedId: null },
    });
    await tx.campaign.updateMany({
      where: { callerIdId: numberId },
      data: { callerIdId: null },
    });

    const rotationCampaigns = await tx.campaign.findMany({
      where: { rotationNumberIds: { has: numberId } },
      select: { id: true, rotationNumberIds: true },
    });
    for (const campaign of rotationCampaigns) {
      await tx.campaign.update({
        where: { id: campaign.id },
        data: {
          rotationNumberIds: {
            set: campaign.rotationNumberIds.filter((id) => id !== numberId),
          },
        },
      });
    }

    await tx.callerIdPoolMember.deleteMany({ where: { numberId } });
    await tx.callerIdDailyUsage.deleteMany({ where: { numberId } });
    await tx.userNumber.deleteMany({ where: { numberId } });
    await tx.numberRequirementValue.deleteMany({
      where: { numberPurchasedId: numberId },
    });
    await tx.inboundRoute.deleteMany({ where: { numberId } });
    await tx.numberPurchased.update({
      where: { id: numberId },
      data: {
        inboundMode: "ringee_default",
        inboundSipDeviceId: null,
        allowedOutboundUserIds: [],
        allowedOutboundSources: DEFAULT_OUTBOUND_SOURCES,
      },
    });
  }

  async userExists(id: string): Promise<boolean> {
    return (await this.prisma.user.count({ where: { id } })) > 0;
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
