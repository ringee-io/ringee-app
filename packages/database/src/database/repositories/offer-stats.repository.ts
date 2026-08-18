import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

export interface PersonalWorkspaceStats {
  user: { id: string; createdAt: Date; totalCalls: number };
  balance: number;
}

export interface OrganizationMemberStats {
  userId: string;
  role: string;
  totalCalls: number;
}

export interface OrganizationWorkspaceStats {
  organization: {
    id: string;
    createdAt: Date;
    totalCalls: number;
    memberCount: number;
  };
  members: OrganizationMemberStats[];
  balance: number;
}

/**
 * Read model behind the offer eligibility context.
 *
 * Ringee keeps no pre-aggregated call counters (`UserActivitySnapshot` only
 * stores timestamps), so the counts come from `Call` — but each workspace is
 * resolved in a fixed, small number of queries. In particular the organization
 * shape gets every member's call count from ONE `groupBy`, never a count per
 * member, and the org total is the sum of those groups.
 */
@Injectable()
export class OfferStatsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Immutable identity facts, cached far longer than the call counts. */
  async userProfile(
    userId: string,
  ): Promise<{ id: string; createdAt: Date } | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, createdAt: true },
    });
  }

  async personalStats(userId: string): Promise<PersonalWorkspaceStats | null> {
    const [user, totalCalls, credit] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, createdAt: true },
      }),
      // Personal workspace = the user's own calls, excluding org calls.
      this.prisma.call.count({ where: { userId, organizationId: null } }),
      this.prisma.credit.findFirst({
        where: { userId, organizationId: null },
        select: { amount: true },
      }),
    ]);

    if (!user) return null;
    return {
      user: { id: user.id, createdAt: user.createdAt, totalCalls },
      balance: credit?.amount ?? 0,
    };
  }

  async organizationStats(
    organizationId: string,
  ): Promise<OrganizationWorkspaceStats | null> {
    const [organization, callGroups, memberships, credit] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, createdAt: true },
      }),
      this.prisma.call.groupBy({
        by: ["userId"],
        where: { organizationId },
        _count: { _all: true },
      }),
      this.prisma.organizationMembership.findMany({
        where: { organizationId, userId: { not: null } },
        select: { userId: true, role: true },
      }),
      this.prisma.credit.findFirst({
        where: { organizationId },
        select: { amount: true },
      }),
    ]);

    if (!organization) return null;

    const callsByUser = new Map<string, number>();
    let totalCalls = 0;
    for (const group of callGroups) {
      totalCalls += group._count._all;
      // Calls survive their caller (onDelete: SetNull), so a null group still
      // counts toward the organization total but belongs to no member.
      if (group.userId) callsByUser.set(group.userId, group._count._all);
    }

    const members: OrganizationMemberStats[] = memberships
      .filter((m): m is { userId: string; role: string } => !!m.userId)
      .map((m) => ({
        userId: m.userId,
        role: m.role,
        totalCalls: callsByUser.get(m.userId) ?? 0,
      }));

    return {
      organization: {
        id: organization.id,
        createdAt: organization.createdAt,
        totalCalls,
        memberCount: members.length,
      },
      members,
      balance: credit?.amount ?? 0,
    };
  }
}
