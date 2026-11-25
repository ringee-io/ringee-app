/**
 * Telnyx's monthly Outbound Calls-Per-Second Peak surcharge (CPS-008).
 *
 * Source: https://support.telnyx.com/en/articles/7834487-calls-per-second-cps-surcharge
 * (read 2026-11-24). The surcharge is graduated and priced per CPS of the
 * account's monthly 95th-percentile hourly peak:
 *
 *   first 5 CPS free · 6-25 $12 · 26-200 $16 · 201-250 $24 · 251+ $30
 *
 * so a monthly P95 of 163 CPS is `20 × $12 + 138 × $16 = $2,448`.
 *
 * INTERNAL FORECASTING ONLY. Nothing here charges a customer, and the numbers
 * are an estimate until reconciled against Telnyx's own invoice line
 * ("Outbound Calls-Per-Second Peak Usage Surcharge").
 *
 * Money is computed in integer cents, then reported in USD, so a future tier
 * priced in cents cannot drift through floating point (BILL-014 keeps amounts
 * as USD floats at the edges; arithmetic here never accumulates one).
 */
export interface CpsPricingTier {
  /** Highest CPS this tier prices, inclusive; `null` has no upper bound. */
  upToCps: number | null;
  /** USD per additional CPS, per month, inside this tier. */
  usdPerCps: number;
}

export interface CpsPricingSchedule {
  id: string;
  /**
   * The first day (UTC, `YYYY-MM-DD`) the surcharge applies to Programmable
   * Voice, Voice API, TeXML and Programmable Fax traffic. SIP Trunking was
   * already billed this way before.
   */
  programmableVoiceFrom: string;
  tiers: readonly CpsPricingTier[];
  /** Where the numbers come from, so a change is traceable. */
  source: string;
}

export const TELNYX_CPS_PRICING_2026_12: CpsPricingSchedule = {
  id: "telnyx-cps-2026-12",
  programmableVoiceFrom: "2026-12-01",
  tiers: [
    { upToCps: 5, usdPerCps: 0 },
    { upToCps: 25, usdPerCps: 12 },
    { upToCps: 200, usdPerCps: 16 },
    { upToCps: 250, usdPerCps: 24 },
    { upToCps: null, usdPerCps: 30 },
  ],
  source:
    "https://support.telnyx.com/en/articles/7834487-calls-per-second-cps-surcharge",
};

/** Newest last. Add a schedule here when Telnyx publishes a price change. */
export const CPS_PRICING_SCHEDULES: readonly CpsPricingSchedule[] = [
  TELNYX_CPS_PRICING_2026_12,
];

/**
 * The schedule in force at `asOf`: the newest whose start is not in the future,
 * else the first known one (the tiers are the best estimate available, and the
 * result says whether the surcharge actually bills Programmable Voice yet).
 */
export function pricingScheduleAt(
  asOf: Date | number = Date.now(),
  schedules: readonly CpsPricingSchedule[] = CPS_PRICING_SCHEDULES,
): CpsPricingSchedule {
  if (schedules.length === 0) throw new RangeError("No CPS pricing schedule");
  const at = asOf instanceof Date ? asOf.getTime() : asOf;
  if (!Number.isFinite(at)) throw new RangeError("Invalid pricing date");
  let chosen = schedules[0];
  for (const schedule of schedules) {
    if (Date.parse(`${schedule.programmableVoiceFrom}T00:00:00Z`) <= at)
      chosen = schedule;
  }
  return chosen;
}

export interface CpsSurchargeSlice {
  /** Exclusive lower bound of the slice, in CPS. */
  fromCps: number;
  /** Inclusive upper bound of the slice, in CPS. */
  toCps: number;
  /** CPS of the peak that fall inside the slice. */
  cps: number;
  usdPerCps: number;
  cents: number;
}

export interface CpsSurcharge {
  /** The peak as given. */
  peakCps: number;
  /** The peak rounded up to a whole CPS, which is what is priced. */
  billableCps: number;
  totalCents: number;
  totalUsd: number;
  slices: CpsSurchargeSlice[];
  scheduleId: string;
  /** Whether the surcharge bills Programmable Voice traffic at `asOf`. */
  billsProgrammableVoice: boolean;
}

export interface CpsSurchargeOptions {
  schedule?: CpsPricingSchedule;
  /** When the month being priced falls; defaults to now. */
  asOf?: Date | number;
}

/** The surcharge for a monthly 95th-percentile hourly peak of `peakCps`. */
export function calculateCpsSurcharge(
  peakCps: number,
  options: CpsSurchargeOptions = {},
): CpsSurcharge {
  if (!Number.isFinite(peakCps) || peakCps < 0) {
    throw new RangeError(`Invalid peak CPS: ${peakCps}`);
  }
  const asOf = options.asOf ?? Date.now();
  const schedule = options.schedule ?? pricingScheduleAt(asOf);
  const billableCps = Math.ceil(peakCps);
  if (!Number.isSafeInteger(billableCps))
    throw new RangeError("Peak CPS exceeds financial precision");
  if (
    !schedule.tiers.length ||
    schedule.tiers[schedule.tiers.length - 1]?.upToCps !== null
  )
    throw new RangeError("CPS pricing needs a final unbounded tier");
  let previous = 0;
  for (const [index, tier] of schedule.tiers.entries()) {
    if (
      !Number.isFinite(tier.usdPerCps) ||
      tier.usdPerCps < 0 ||
      (tier.upToCps === null
        ? index !== schedule.tiers.length - 1
        : !Number.isSafeInteger(tier.upToCps) || tier.upToCps <= previous)
    ) {
      throw new RangeError("Invalid CPS pricing tier");
    }
    previous = tier.upToCps ?? previous;
  }

  const slices: CpsSurchargeSlice[] = [];
  let from = 0;
  let totalCents = 0;
  for (const tier of schedule.tiers) {
    const to = tier.upToCps ?? Number.POSITIVE_INFINITY;
    const cps = Math.max(0, Math.min(billableCps, to) - from);
    const cents = cps * Math.round(tier.usdPerCps * 100);
    if (cps > 0) {
      slices.push({
        fromCps: from,
        toCps: Math.min(billableCps, to),
        cps,
        usdPerCps: tier.usdPerCps,
        cents,
      });
    }
    totalCents += cents;
    if (!Number.isSafeInteger(totalCents))
      throw new RangeError("CPS price exceeds financial precision");
    if (billableCps <= to) break;
    from = to;
  }

  return {
    peakCps,
    billableCps,
    totalCents,
    totalUsd: totalCents / 100,
    slices,
    scheduleId: schedule.id,
    billsProgrammableVoice:
      (asOf instanceof Date ? asOf.getTime() : asOf) >=
      Date.parse(`${schedule.programmableVoiceFrom}T00:00:00Z`),
  };
}
