import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CalendarIntegration, CalendarProvider } from "@prisma/client";
import { buildOwnershipFilter, OwnershipContext } from "@ringee/platform";
import { lockWorkspace } from "./calendar.repository";

/**
 * Connected calendar accounts (Google, Microsoft). An account belongs to the
 * workspace it was connected in, and only that workspace reads, lists or uses
 * it (CAL-004): an organization sees the accounts connected in it, a personal
 * workspace the ones its owner connected there — never the same person's
 * accounts from their other workspace.
 */
@Injectable()
export class CalendarIntegrationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Connects an external calendar account to the workspace `ctx` names, or
   * refreshes the one that person already connected there.
   *
   * A workspace may hold several accounts of the same provider, because
   * different Ringee calendars may push their events to different Google
   * accounts. "The same account" is the same provider and the same email, which
   * is what reconnecting updates in place — so re-authorizing an account that
   * three calendars already point at renews one credential rather than orphaning
   * them behind a fourth row. An account whose email the provider did not
   * return has no identity to match on and is treated as the workspace's single
   * unnamed account of that provider, which is how every connection made before
   * this existed behaves. Connecting the same account in another workspace
   * gives that workspace its own row and never touches this one.
   *
   * The workspace lock is what keeps two concurrent OAuth callbacks from
   * creating the same account twice.
   */
  async connectAccount(
    ctx: OwnershipContext,
    provider: CalendarProvider,
    data: {
      accessToken: string;
      refreshToken?: string;
      expiresAt?: Date;
      calendarId?: string;
      email?: string;
    },
  ): Promise<CalendarIntegration> {
    const email = data.email ?? null;

    return this.prisma.$transaction(async (tx) => {
      await lockWorkspace(tx, ctx);
      const existing = await tx.calendarIntegration.findFirst({
        where: {
          ...buildOwnershipFilter(ctx),
          userId: ctx.userId,
          provider,
          email,
        },
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
        data: {
          userId: ctx.userId,
          organizationId: ctx.organizationId ?? null,
          provider,
          ...credentials,
        },
      });
    });
  }

  /**
   * Workspace-scoped, so an id from another workspace — another tenant's, or
   * the same person's other workspace — reads as "not found".
   */
  findByIdForOwner(
    ctx: OwnershipContext,
    id: string,
  ): Promise<CalendarIntegration | null> {
    return this.prisma.calendarIntegration.findFirst({
      where: { id, isActive: true, ...buildOwnershipFilter(ctx) },
    });
  }

  /** The workspace's connected accounts. */
  listForWorkspace(ctx: OwnershipContext): Promise<CalendarIntegration[]> {
    return this.prisma.calendarIntegration.findMany({
      where: { isActive: true, ...buildOwnershipFilter(ctx) },
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
