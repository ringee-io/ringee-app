import { Injectable } from "@nestjs/common";
import { CalendarAvailabilityRule } from "@prisma/client";
import {
  OwnershipContext,
  buildOwnershipData,
  buildOwnershipFilter,
} from "@ringee/platform";
import { PrismaService } from "../prisma.service";
import { lockWorkspace } from "./calendar.repository";

export interface CalendarAvailabilityRuleData {
  daysOfWeek: number[];
  startMinute: number;
  endMinute: number;
  /** Maximum simultaneous meetings; null means unlimited. */
  capacity: number | null;
}

const ORDER = [{ startMinute: "asc" as const }, { createdAt: "asc" as const }];

@Injectable()
export class CalendarAvailabilityRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** One calendar's windows. Windows never span calendars. */
  list(
    ctx: OwnershipContext,
    calendarId: string,
  ): Promise<CalendarAvailabilityRule[]> {
    return this.prisma.calendarAvailabilityRule.findMany({
      where: { ...buildOwnershipFilter(ctx), calendarId },
      orderBy: ORDER,
    });
  }

  /** Replaces one calendar's recurring schedule as a single transaction. */
  replace(
    ctx: OwnershipContext,
    calendarId: string,
    rules: CalendarAvailabilityRuleData[],
  ): Promise<CalendarAvailabilityRule[]> {
    const owner = buildOwnershipData(ctx);
    const scope = { ...buildOwnershipFilter(ctx), calendarId };

    return this.prisma.$transaction(async (tx) => {
      // Two admins saving at once must produce one complete schedule, not the
      // union of both replace operations.
      await lockWorkspace(tx, ctx);
      await tx.calendarAvailabilityRule.deleteMany({ where: scope });
      if (rules.length > 0) {
        await tx.calendarAvailabilityRule.createMany({
          data: rules.map((rule) => ({ ...owner, calendarId, ...rule })),
        });
      }
      return tx.calendarAvailabilityRule.findMany({
        where: scope,
        orderBy: ORDER,
      });
    });
  }
}
