import { Injectable } from "@nestjs/common";
import { ProviderDispatchHour } from "@prisma/client";
import { PrismaService } from "../prisma.service";

export interface DispatchHourCounters {
  peakCps: number;
  attempts: number;
  /** Every other counter the limiter wrote that hour, by name. */
  counters: Record<string, number>;
}

/**
 * One row per provider billing account and UTC hour: what Ringee's own dispatch
 * counted (CPS-009). The in-progress hour is flushed repeatedly from Redis, so
 * a flush only ever RAISES what is stored — a Redis that lost its state in the
 * middle of an hour cannot lower a figure that was already persisted.
 */
@Injectable()
export class ProviderDispatchHourRepository {
  constructor(private readonly prisma: PrismaService) {}

  async merge(
    providerAccountKey: string,
    hourStart: Date,
    next: DispatchHourCounters,
  ): Promise<ProviderDispatchHour> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`dispatch-hour:${providerAccountKey}:${hourStart.toISOString()}`}, 0))`;
      const existing = await tx.providerDispatchHour.findUnique({
        where: {
          providerAccountKey_hourStart: { providerAccountKey, hourStart },
        },
      });
      const previous = (existing?.counters ?? {}) as Record<string, number>;
      const counters: Record<string, number> = { ...previous };
      for (const [name, value] of Object.entries(next.counters)) {
        counters[name] = Math.max(counters[name] ?? 0, value);
      }
      const data = {
        peakCps: Math.max(existing?.peakCps ?? 0, next.peakCps),
        attempts: Math.max(existing?.attempts ?? 0, next.attempts),
        counters,
      };
      return tx.providerDispatchHour.upsert({
        where: {
          providerAccountKey_hourStart: { providerAccountKey, hourStart },
        },
        create: { providerAccountKey, hourStart, ...data },
        update: data,
      });
    });
  }

  /** Hours in `[from, to)`, oldest first. */
  listBetween(
    providerAccountKey: string,
    from: Date,
    to: Date,
  ): Promise<ProviderDispatchHour[]> {
    return this.prisma.providerDispatchHour.findMany({
      where: { providerAccountKey, hourStart: { gte: from, lt: to } },
      orderBy: { hourStart: "asc" },
    });
  }

  /** The newest hour stored, to know where the next flush resumes. */
  latest(providerAccountKey: string): Promise<ProviderDispatchHour | null> {
    return this.prisma.providerDispatchHour.findFirst({
      where: { providerAccountKey },
      orderBy: { hourStart: "desc" },
    });
  }
}
