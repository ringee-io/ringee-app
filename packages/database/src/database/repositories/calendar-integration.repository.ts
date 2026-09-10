import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CalendarIntegration, CalendarProvider } from "@prisma/client";
import { OwnershipContext } from "@ringee/platform";
import { lockWorkspace } from "./calendar.repository";

@Injectable()
export class CalendarIntegrationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Connects an external calendar account, or refreshes the one already
   * connected.
   *
   * A workspace may hold several accounts of the same provider, because
   * different Ringee calendars may push their events to different Google
   * accounts. "The same account" is the same provider and the same email, which
   * is what reconnecting updates in place — so re-authorizing an account that
   * three calendars already point at renews one credential rather than orphaning
   * them behind a fourth row. An account whose email the provider did not
   * return has no identity to match on and is treated as the workspace's single
   * unnamed account of that provider, which is how every connection made before
   * this existed behaves.
   *
   * The workspace lock is what keeps two concurrent OAuth callbacks from
   * creating the same account twice.
   */
  async connectAccount(
    userId: string,
    provider: CalendarProvider,
    data: {
      accessToken: string;
      refreshToken?: string;
      expiresAt?: Date;
      calendarId?: string;
      email?: string;
      organizationId?: string | null;
    },
  ): Promise<CalendarIntegration> {
    const organizationId = data.organizationId ?? null;
    const ctx: OwnershipContext = { userId, organizationId };
    const email = data.email ?? null;

    return this.prisma.$transaction(async (tx) => {
      await lockWorkspace(tx, ctx);
      const existing = await tx.calendarIntegration.findFirst({
        where: { userId, provider, email },
        orderBy: { createdAt: "asc" },
      });

      const credentials = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        calendarId: data.calendarId,
        email: data.email,
      };

      if (existing) {
        return tx.calendarIntegration.update({
          where: { id: existing.id },
          data: { ...credentials, isActive: true },
        });
      }
      return tx.calendarIntegration.create({
        data: { userId, provider, organizationId, ...credentials },
      });
    });
  }

  /**
   * Workspace-scoped, so an id from another tenant reads as "not found".
   *
   * Visibility is deliberately the same rule `findByUserOrOrg` already applies
   * to this model — the account a member connected personally is reachable in
   * their organization context — rather than the stricter
   * `buildOwnershipFilter`, which would hide accounts agents are already
   * pointed at.
   */
  findByIdForOwner(
    ctx: OwnershipContext,
    id: string,
  ): Promise<CalendarIntegration | null> {
    return this.prisma.calendarIntegration.findFirst({
      where: {
        id,
        isActive: true,
        OR: [
          { userId: ctx.userId },
          ...(ctx.organizationId
            ? [{ organizationId: ctx.organizationId }]
            : []),
        ],
      },
    });
  }

  async findByUser(userId: string): Promise<CalendarIntegration[]> {
    return this.prisma.calendarIntegration.findMany({
      where: { userId, isActive: true },
    });
  }

  async findByOrganization(
    organizationId: string,
  ): Promise<CalendarIntegration[]> {
    return this.prisma.calendarIntegration.findMany({
      where: { organizationId, isActive: true },
    });
  }

  async findByUserOrOrg(
    userId: string,
    organizationId?: string | null,
  ): Promise<CalendarIntegration[]> {
    return this.prisma.calendarIntegration.findMany({
      where: {
        isActive: true,
        OR: [{ userId }, ...(organizationId ? [{ organizationId }] : [])],
      },
    });
  }

  async findByOrgAndProvider(
    organizationId: string,
    provider: CalendarProvider,
  ): Promise<CalendarIntegration | null> {
    return this.prisma.calendarIntegration.findFirst({
      where: { organizationId, provider, isActive: true },
    });
  }

  async updateTokens(
    id: string,
    data: {
      accessToken: string;
      refreshToken?: string;
      expiresAt?: Date;
    },
  ): Promise<CalendarIntegration> {
    return this.prisma.calendarIntegration.update({
      where: { id },
      data,
    });
  }

  async deactivate(id: string): Promise<CalendarIntegration> {
    return this.prisma.calendarIntegration.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async delete(id: string): Promise<CalendarIntegration> {
    return this.prisma.calendarIntegration.delete({ where: { id } });
  }
}
