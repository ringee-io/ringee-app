import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

/** One priced route of the carrier's per-minute rate deck, as imported. */
export type RatePerMinuteRoute = {
  iso: string;
  country: string;
  description: string | null;
  rate: number;
};

/**
 * Raw access to the imported rate deck. Classifying routes into mobile and
 * landline and applying the margin is pricing, so it lives in
 * `@ringee/services` (`country-rate.util.ts`), not here.
 */
@Injectable()
export class TelnyxRatePerMinuteRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every route in the deck, or only one country's when `codeOrName` is given
   * (its ISO code or its name as the deck spells it, case-insensitive).
   */
  findRoutes(codeOrName?: string): Promise<RatePerMinuteRoute[]> {
    const q = codeOrName?.trim();

    return this.prisma.telnyxRatePerMinute.findMany({
      ...(q
        ? {
            where: {
              OR: [
                { iso: { equals: q, mode: "insensitive" } },
                { country: { equals: q, mode: "insensitive" } },
              ],
            },
          }
        : {}),
      select: {
        iso: true,
        country: true,
        description: true,
        rate: true,
      },
    });
  }
}
