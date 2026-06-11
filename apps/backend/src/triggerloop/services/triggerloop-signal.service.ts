import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@ringee/database";
import { UserBusinessSignals } from "../types/triggerloop.types";

const ACTIVE_WINDOW_DAYS = 14;

@Injectable()
export class TriggerLoopSignalService {
  private readonly logger = new Logger(TriggerLoopSignalService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Collects the real business signals TriggerLoop evaluators need to decide
   * the next workflow step. One query bundle per evaluate() — cheap and
   * authoritative. Do not cache: evaluation is rare and correctness matters.
   */
  async collectForUser(userId: string): Promise<UserBusinessSignals> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        createdAt: true,
        emails: {
          where: { isPrimary: true },
          select: { email: true, status: true },
          take: 1,
        },
        organizationMemberships: {
          select: {
            organizationId: true,
            role: true,
            organization: { select: { name: true } },
          },
          orderBy: { createdAt: "asc" as const },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const primaryEmail = user.emails[0];
    const primaryMembership = user.organizationMemberships[0] ?? null;
    const organizationId = primaryMembership?.organizationId ?? null;
    const organizationName = primaryMembership?.organization?.name ?? null;

    const activeSince = new Date(
      Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const [
      numberAssignment,
      creditRow,
      contactCount,
      firstCompletedCall,
      lastCall,
      campaignCount,
      callbackCount,
      dncCount,
      teamMembersCount,
    ] = await Promise.all([
      this.prisma.userNumber.findFirst({
        where: {
          OR: organizationId ? [{ userId }, { organizationId }] : [{ userId }],
          enabled: true,
        },
        select: { id: true },
      }),
      this.prisma.credit.findFirst({
        where: organizationId
          ? { OR: [{ userId }, { organizationId }] }
          : { userId },
        select: { amount: true, lastPurchaseDate: true },
      }),
      this.prisma.contact.count({
        where: {
          deletedAt: null,
          OR: organizationId ? [{ userId }, { organizationId }] : [{ userId }],
        },
      }),
      this.prisma.call.findFirst({
        where: {
          userId,
          status: "completed",
          durationSeconds: { gt: 0 },
        },
        orderBy: { endedAt: "asc" },
        select: { id: true, endedAt: true, createdAt: true },
      }),
      // Most recent *completed* call — ringing/failed calls are not meaningful
      // activity signals.
      this.prisma.call.findFirst({
        where: { userId, status: "completed" },
        orderBy: { endedAt: "desc" },
        select: { endedAt: true },
      }),
      // hasCampaign: only active/paused campaigns signal real adoption; drafts
      // and completed ones don't count.
      this.prisma.campaign.count({
        where: {
          status: { in: ["active", "paused"] },
          OR: organizationId ? [{ userId }, { organizationId }] : [{ userId }],
        },
      }),
      // hasCallbacks: only pending/in-flight callbacks (scheduled, due,
      // in_progress) — completed and cancelled are historical, not signals of
      // active adoption.
      organizationId
        ? this.prisma.callbackTask.count({
            where: {
              status: { in: ["scheduled", "due", "in_progress"] },
              campaignLead: { campaign: { organizationId } },
            },
          })
        : Promise.resolve(0),
      organizationId
        ? this.prisma.dNCEntry.count({ where: { organizationId } })
        : Promise.resolve(0),
      // teamMembersCount: exclude pending invites (userId is null when the
      // invitation has not yet been accepted).
      organizationId
        ? this.prisma.organizationMembership.count({
            where: { organizationId, userId: { not: null } },
          })
        : Promise.resolve(1),
    ]);

    const creditsAdded =
      !!creditRow?.lastPurchaseDate || (creditRow?.amount ?? 0) > 0;

    // lastActivityAt: prefer the most recent completed call's endedAt.
    // Fall back to firstCompletedCall only when lastCall is the same record
    // (i.e. user has exactly one completed call).
    const lastActivityAt =
      lastCall?.endedAt ?? firstCompletedCall?.endedAt ?? null;

    const active = lastActivityAt ? lastActivityAt >= activeSince : false;

    return {
      userId: user.id,
      firstName: user.firstName ?? null,
      organizationId,
      organizationName,
      email: primaryEmail?.email ?? null,
      isTeamAccount: !!organizationId,
      registered: true,
      emailVerified: primaryEmail?.status === "verified",
      workspaceCreated: !!organizationId,
      phoneNumberAssigned: !!numberAssignment,
      creditsAdded,
      contactsImported: contactCount > 0,
      firstCallCompleted: !!firstCompletedCall,
      firstCallCompletedAt:
        firstCompletedCall?.endedAt ?? firstCompletedCall?.createdAt ?? null,
      lastActivityAt,
      active,
      hasCampaign: campaignCount > 0,
      hasCallbacks: callbackCount > 0,
      hasDncEntries: dncCount > 0,
      teamMembersCount,
    };
  }
}
