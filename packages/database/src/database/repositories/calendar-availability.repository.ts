import { Injectable } from "@nestjs/common";
import { CalendarAvailabilityRule } from "@prisma/client";
import {
  OwnershipContext,
  buildOwnershipData,
  buildOwnershipFilter,
} from "@ringee/platform";
import { PrismaService } from "../prisma.service";

export interface CalendarAvailabilityRuleData {
  daysOfWeek: number[];
  startMinute: number;
  endMinute: number;
  /** Maximum simultaneous meetings; null means unlimited. */
  capacity: number | null;
}

@Injectable()
export class CalendarAvailabilityRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(ctx: OwnershipContext): Promise<CalendarAvailabilityRule[]> {
    return this.prisma.calendarAvailabilityRule.findMany({
      where: buildOwnershipFilter(ctx),
      orderBy: [{ startMinute: "asc" }, { createdAt: "asc" }],
    });
  }

  /** Replaces one workspace's recurring schedule as a single transaction. */
  replace(
    ctx: OwnershipContext,
    rules: CalendarAvailabilityRuleData[],
  ): Promise<CalendarAvailabilityRule[]> {
    const owner = buildOwnershipData(ctx);

    return this.prisma.$transaction(async (tx) => {
      // Two admins saving at once must produce one complete schedule, not the
      // union of both replace operations.
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
      await tx.calendarAvailabilityRule.deleteMany({
        where: buildOwnershipFilter(ctx),
      });
      if (rules.length > 0) {
        await tx.calendarAvailabilityRule.createMany({
          data: rules.map((rule) => ({ ...owner, ...rule })),
        });
      }
      return tx.calendarAvailabilityRule.findMany({
        where: buildOwnershipFilter(ctx),
        orderBy: [{ startMinute: "asc" }, { createdAt: "asc" }],
      });
    });
  }
}
