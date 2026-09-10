import { Injectable } from "@nestjs/common";
import { Calendar, Prisma } from "@prisma/client";
import {
  OwnershipContext,
  buildOwnershipData,
  buildOwnershipFilter,
} from "@ringee/platform";
import { PrismaService } from "../prisma.service";

export interface CalendarCreateData {
  name: string;
  timezone: string;
  isDefault?: boolean;
  calendarIntegrationId?: string | null;
  externalCalendarId?: string | null;
}

export interface CalendarUpdateData {
  name?: string;
  timezone?: string;
  archivedAt?: Date | null;
  calendarIntegrationId?: string | null;
  externalCalendarId?: string | null;
}

/** The workspace's global calendar plus its additional ones. */
@Injectable()
export class CalendarRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(
    ctx: OwnershipContext,
    options?: { includeArchived?: boolean },
  ): Promise<Calendar[]> {
    return this.prisma.calendar.findMany({
      where: {
        ...buildOwnershipFilter(ctx),
        ...(options?.includeArchived ? {} : { archivedAt: null }),
      },
      // The global calendar first, then the rest oldest-first, so the list reads
      // the same everywhere it is rendered or offered.
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
  }

  /** Scoped by workspace: an id from another tenant reads as "not found". */
  findByIdForOwner(
    ctx: OwnershipContext,
    id: string,
  ): Promise<Calendar | null> {
    return this.prisma.calendar.findFirst({
      where: { id, ...buildOwnershipFilter(ctx) },
    });
  }

  findDefault(ctx: OwnershipContext): Promise<Calendar | null> {
    return this.prisma.calendar.findFirst({
      where: { ...buildOwnershipFilter(ctx), isDefault: true },
    });
  }

  /**
   * The workspace's global calendar, created on first use.
   *
   * Workspaces that existed before multiple calendars were introduced had their
   * row created by the migration; this covers the ones created since, and any
   * the migration could not see because they had no calendar data yet. The
   * workspace row lock is what keeps two concurrent first uses from producing
   * two global calendars — the same serialization the availability replace and
   * the protected booking use.
   */
  async ensureDefault(
    ctx: OwnershipContext,
    defaults: { name: string; timezone: string },
  ): Promise<Calendar> {
    const existing = await this.findDefault(ctx);
    if (existing) return existing;

    return this.prisma.$transaction(async (tx) => {
      await lockWorkspace(tx, ctx);
      const current = await tx.calendar.findFirst({
        where: { ...buildOwnershipFilter(ctx), isDefault: true },
      });
      if (current) return current;
      return tx.calendar.create({
        data: {
          ...buildOwnershipData(ctx),
          name: defaults.name,
          timezone: defaults.timezone,
          isDefault: true,
        },
      });
    });
  }

  create(ctx: OwnershipContext, data: CalendarCreateData): Promise<Calendar> {
    return this.prisma.calendar.create({
      data: {
        ...buildOwnershipData(ctx),
        name: data.name,
        timezone: data.timezone,
        isDefault: data.isDefault ?? false,
        calendarIntegrationId: data.calendarIntegrationId ?? null,
        externalCalendarId: data.externalCalendarId ?? null,
      },
    });
  }

  /** Scoped update: returns null when the id is not this workspace's. */
  async update(
    ctx: OwnershipContext,
    id: string,
    data: CalendarUpdateData,
  ): Promise<Calendar | null> {
    const { count } = await this.prisma.calendar.updateMany({
      where: { id, ...buildOwnershipFilter(ctx) },
      data,
    });
    if (count === 0) return null;
    return this.findByIdForOwner(ctx, id);
  }

  /** How many agents point at each calendar, for the management screen. */
  async countAgentsByCalendar(
    ctx: OwnershipContext,
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.aiVoiceAgent.groupBy({
      by: ["calendarId"],
      where: {
        ...buildOwnershipFilter(ctx),
        deletedAt: null,
        calendarId: { not: null },
      },
      _count: { _all: true },
    });
    return new Map(
      rows
        .filter((row) => row.calendarId)
        .map((row) => [row.calendarId!, row._count._all]),
    );
  }

  /** The agents that would lose their calendar if this one were archived. */
  listAgentsUsingCalendar(
    ctx: OwnershipContext,
    calendarId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.aiVoiceAgent.findMany({
      where: { ...buildOwnershipFilter(ctx), calendarId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }
}

/**
 * Serializes writes that must produce one row per workspace. Shared by the
 * global-calendar creation here and by the availability replace, so both take
 * the same lock and cannot interleave.
 */
export async function lockWorkspace(
  tx: Prisma.TransactionClient,
  ctx: OwnershipContext,
): Promise<void> {
  if (ctx.organizationId) {
    await tx.$queryRaw`
      SELECT "id"
      FROM "Organization"
      WHERE "id" = ${ctx.organizationId}::uuid
      FOR UPDATE
    `;
  } else {
    await tx.$queryRaw`
      SELECT "id"
      FROM "User"
      WHERE "id" = ${ctx.userId}::uuid
      FOR UPDATE
    `;
  }
}
