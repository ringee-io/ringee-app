import {
  calculateCpsSurcharge,
  type CpsPricingSchedule,
  type CpsSurcharge,
} from "./telnyx-cps-surcharge";

/**
 * Estimating Telnyx's monthly CPS surcharge from what Ringee measured (CPS-009).
 *
 * Telnyx's method, from its published article (read 2026-11-24):
 *   1. for each ACTIVE hour of the billing month, take the highest number of
 *      outbound call attempts initiated within the same second;
 *   2. hours with no outbound attempts are excluded, not counted as 0;
 *   3. the surcharge is priced on the 95th percentile of those hourly peaks.
 *
 * Telnyx does not publish which percentile definition it uses. Its own example
 * (100 active hours, 5 of them unusually high, "treated as outliers") matches
 * nearest rank, which is what `p95` reports. The linear-interpolation
 * definition is reported beside it, and neither always dominates the other, so
 * the conservative figure prices the larger of the two.
 *
 * What this is NOT: Telnyx counts attempts from its own CDRs, only ACCEPTED
 * ones, and Ringee measures when it dispatched. The two differ by network
 * timing, by attempts Ringee cannot see (a browser that dials Telnyx directly
 * is observed only through its webhook) and by the hour boundary (UTC is
 * assumed). Reconcile against the invoice before trusting a dollar figure.
 */
export interface HourlyPeak {
  /** Start of the UTC hour, in epoch milliseconds. */
  hourStartMs: number;
  /** Highest attempts counted in a single second of the hour. */
  peakCps: number;
  /** Attempts counted in the hour; an hour with none is not active. */
  attempts: number;
}

const HOUR_MS = 3_600_000;

export function hourStartOf(epochMs: number): number {
  return Math.floor(epochMs / HOUR_MS) * HOUR_MS;
}

/** The `[start, end)` of a UTC calendar month, in epoch milliseconds. */
export function monthRangeUtc(
  year: number,
  month: number,
): { startMs: number; endMs: number } {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new RangeError(`Invalid month ${year}-${month}`);
  }
  return {
    startMs: Date.UTC(year, month - 1, 1),
    endMs: Date.UTC(year, month, 1),
  };
}

/**
 * Hourly peaks from raw attempt timestamps: the per-second count, then the
 * highest of those in each UTC hour. This is the same computation Telnyx
 * describes, so it also turns a CDR export into a figure to compare against.
 */
export function hourlyPeaksFromAttempts(
  attemptTimesMs: Iterable<number>,
): HourlyPeak[] {
  const perSecond = new Map<number, number>();
  for (const time of attemptTimesMs) {
    if (!Number.isFinite(time)) continue;
    const second = Math.floor(time / 1000);
    perSecond.set(second, (perSecond.get(second) ?? 0) + 1);
  }
  const hours = new Map<number, HourlyPeak>();
  for (const [second, count] of perSecond) {
    const hourStartMs = hourStartOf(second * 1000);
    const hour = hours.get(hourStartMs) ?? {
      hourStartMs,
      peakCps: 0,
      attempts: 0,
    };
    hour.peakCps = Math.max(hour.peakCps, count);
    hour.attempts += count;
    hours.set(hourStartMs, hour);
  }
  return [...hours.values()].sort((a, b) => a.hourStartMs - b.hourStartMs);
}

/** Nearest-rank percentile: the smallest value with at least `p`% at or below. */
export function percentileNearestRank(
  values: readonly number[],
  p: number,
): number {
  if (values.length === 0) return 0;
  if (!(p >= 0 && p <= 100)) throw new RangeError(`Invalid percentile ${p}`);
  const sorted = [...values].sort((a, b) => a - b);
  // `p * n` first: `0.95 * n` is not exact in floating point, so an exact rank
  // such as 57 of 60 could round up to 58.
  const rank = Math.min(
    sorted.length,
    Math.max(1, Math.ceil((p * sorted.length) / 100)),
  );
  return sorted[rank - 1];
}

/** Linear-interpolation percentile (the definition numpy uses by default). */
export function percentileInterpolated(
  values: readonly number[],
  p: number,
): number {
  if (values.length === 0) return 0;
  if (!(p >= 0 && p <= 100)) throw new RangeError(`Invalid percentile ${p}`);
  const sorted = [...values].sort((a, b) => a - b);
  const position = (p * (sorted.length - 1)) / 100;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export interface CpsEstimateOptions {
  /** Which percentile prices the month. Telnyx uses 95. */
  percentile?: number;
  schedule?: CpsPricingSchedule;
  /** When the month falls, for the effective date of the schedule. */
  asOf?: Date | number;
  /** Peaks at or below this are free; used to count the hours above it. */
  freeCps?: number;
}

export interface CpsEstimate {
  /** Hours with at least one attempt: the only ones Telnyx counts. */
  activeHours: number;
  /** Hours handed in with no attempts, left out as Telnyx does. */
  excludedHours: number;
  /** Highest hourly peak seen. */
  maxPeakCps: number;
  /** The nearest-rank percentile of the active hourly peaks. */
  p95: number;
  /** The linearly interpolated percentile (it can fall either side of `p95`). */
  p95Interpolated: number;
  /** Active hours whose peak went above the free CPS. */
  hoursAboveFree: number;
  /** The surcharge at `p95` (nearest rank). */
  surcharge: CpsSurcharge;
  /** The surcharge at `ceil(max(p95, p95Interpolated))`: the conservative figure. */
  surchargeUpper: CpsSurcharge;
  /** Active hours that would have to drop below the free CPS for $0. */
  hoursToClear: number;
}

export function estimateMonthlyCpsSurcharge(
  hours: readonly HourlyPeak[],
  options: CpsEstimateOptions = {},
): CpsEstimate {
  const percentile = options.percentile ?? 95;
  const freeCps = options.freeCps ?? 5;
  const active = hours.filter((hour) => hour.attempts > 0 && hour.peakCps > 0);
  const peaks = active.map((hour) => hour.peakCps);

  const p95 = percentileNearestRank(peaks, percentile);
  const p95Interpolated = percentileInterpolated(peaks, percentile);
  const hoursAboveFree = peaks.filter((peak) => peak > freeCps).length;
  const pricing = { schedule: options.schedule, asOf: options.asOf };

  // The percentile reaches the free CPS once at most (100 - p)% of the active
  // hours are above it.
  const allowedAbove = Math.floor(((100 - percentile) * active.length) / 100);
  return {
    activeHours: active.length,
    excludedHours: hours.length - active.length,
    maxPeakCps: peaks.length ? Math.max(...peaks) : 0,
    p95,
    p95Interpolated,
    hoursAboveFree,
    surcharge: calculateCpsSurcharge(p95, pricing),
    surchargeUpper: calculateCpsSurcharge(
      Math.ceil(Math.max(p95, p95Interpolated)),
      pricing,
    ),
    hoursToClear: Math.max(0, hoursAboveFree - allowedAbove),
  };
}
