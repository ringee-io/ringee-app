import { describe, expect, it } from "vitest";
import {
  estimateMonthlyCpsSurcharge,
  hourStartOf,
  hourlyPeaksFromAttempts,
  monthRangeUtc,
  percentileInterpolated,
  percentileNearestRank,
  type HourlyPeak,
} from "./cps-estimate";

const HOUR = 3_600_000;
const hour = (
  index: number,
  peakCps: number,
  attempts = peakCps,
): HourlyPeak => ({
  hourStartMs: Date.UTC(2026, 11, 1) + index * HOUR,
  peakCps,
  attempts,
});

describe("percentiles", () => {
  it("nearest rank takes the smallest value with at least p% at or below", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentileNearestRank(values, 95)).toBe(95);
    expect(percentileNearestRank(values, 100)).toBe(100);
    expect(percentileNearestRank(values, 1)).toBe(1);
    expect(percentileNearestRank([7], 95)).toBe(7);
    expect(percentileNearestRank([], 95)).toBe(0);
  });

  it("does not let floating point move an exact rank (57th of 60 stays 57th)", () => {
    // 0.95 * 60 is 56.99999999999999 or 57.00000000000001 depending on the
    // operands; the rank must be 57 either way.
    const values = Array.from({ length: 60 }, (_, i) => i + 1);
    expect(percentileNearestRank(values, 95)).toBe(57);
    for (let n = 1; n <= 400; n++) {
      const sample = Array.from({ length: n }, (_, i) => i + 1);
      expect(percentileNearestRank(sample, 95)).toBe(Math.ceil((95 * n) / 100));
    }
  });

  it("interpolates linearly between the two surrounding ranks", () => {
    expect(percentileInterpolated([4], 95)).toBe(4);
    expect(percentileInterpolated([], 95)).toBe(0);
    expect(percentileInterpolated([10, 20], 50)).toBe(15);
    // 100 values 1..100: position 0.95 * 99 = 94.05, between the 95th and 96th.
    const hundred = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentileInterpolated(hundred, 95)).toBeCloseTo(95.05, 10);
  });

  it("neither definition always dominates, so the estimate prices the larger", () => {
    // Ten values: nearest rank is the maximum, interpolation falls below it.
    const ten = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55];
    expect(percentileNearestRank(ten, 95)).toBe(55);
    expect(percentileInterpolated(ten, 95)).toBeLessThan(55);
    // A hundred values: interpolation is a little above nearest rank.
    const hundred = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentileInterpolated(hundred, 95)).toBeGreaterThan(
      percentileNearestRank(hundred, 95),
    );
  });
});

describe("hourly peaks from attempt times", () => {
  it("takes the busiest second of each UTC hour", () => {
    const base = Date.UTC(2026, 11, 1, 10, 0, 0);
    const peaks = hourlyPeaksFromAttempts([
      // 10:00:00 — three in one second
      base + 100,
      base + 400,
      base + 900,
      // 10:00:01 — one
      base + 1_500,
      // 11:00:07 — two
      base + HOUR + 7_100,
      base + HOUR + 7_800,
    ]);
    expect(peaks).toEqual([
      { hourStartMs: base, peakCps: 3, attempts: 4 },
      { hourStartMs: base + HOUR, peakCps: 2, attempts: 2 },
    ]);
  });

  it("counts a second by its clock edge, not by a sliding window", () => {
    // Two calls 200 ms apart straddling :00 land in different seconds.
    const edge = Date.UTC(2026, 11, 1, 10, 0, 1);
    const [only] = hourlyPeaksFromAttempts([edge - 100, edge + 100]);
    expect(only.peakCps).toBe(1);
    expect(only.attempts).toBe(2);
  });

  it("ignores values that are not times and leaves idle hours out", () => {
    const base = Date.UTC(2026, 11, 1, 10);
    const peaks = hourlyPeaksFromAttempts([base, base + 3 * HOUR, Number.NaN]);
    expect(peaks.map((p) => p.hourStartMs)).toEqual([base, base + 3 * HOUR]);
  });

  it("rounds an instant down to its hour", () => {
    expect(hourStartOf(Date.UTC(2026, 11, 1, 10, 59, 59, 999))).toBe(
      Date.UTC(2026, 11, 1, 10),
    );
  });
});

describe("monthly estimate", () => {
  it("excludes hours with no attempts instead of counting them as zero", () => {
    const hours = [hour(0, 3), hour(1, 0, 0), hour(2, 0, 0), hour(3, 4)];
    const estimate = estimateMonthlyCpsSurcharge(hours);
    expect(estimate.activeHours).toBe(2);
    expect(estimate.excludedHours).toBe(2);
    expect(estimate.p95).toBe(4);
  });

  it("matches Telnyx's example: five high hours out of 100 are outliers", () => {
    const hours = [
      ...Array.from({ length: 95 }, (_, i) => hour(i, 4)),
      ...Array.from({ length: 5 }, (_, i) => hour(95 + i, 80)),
    ];
    const estimate = estimateMonthlyCpsSurcharge(hours);
    expect(estimate.activeHours).toBe(100);
    expect(estimate.p95).toBe(4);
    expect(estimate.surcharge.totalUsd).toBe(0);
    expect(estimate.hoursAboveFree).toBe(5);
    expect(estimate.hoursToClear).toBe(0);
  });

  it("raises the figure once the bursts are no longer outliers", () => {
    const hours = [
      ...Array.from({ length: 94 }, (_, i) => hour(i, 4)),
      ...Array.from({ length: 6 }, (_, i) => hour(94 + i, 80)),
    ];
    const estimate = estimateMonthlyCpsSurcharge(hours);
    expect(estimate.p95).toBe(80);
    // 20 * $12 + 55 * $16
    expect(estimate.surcharge.totalUsd).toBe(1_120);
    expect(estimate.hoursToClear).toBe(1);
  });

  it("never understates: the upper figure is at least the nearest-rank one", () => {
    for (const total of [10, 37, 60, 100, 101, 250]) {
      const hours = Array.from({ length: total }, (_, i) =>
        hour(i, 1 + ((i * 7) % 40)),
      );
      const estimate = estimateMonthlyCpsSurcharge(hours);
      expect(estimate.surchargeUpper.totalUsd).toBeGreaterThanOrEqual(
        estimate.surcharge.totalUsd,
      );
    }
  });

  it("is zero for a month with no outbound activity at all", () => {
    const estimate = estimateMonthlyCpsSurcharge([]);
    expect(estimate).toMatchObject({
      activeHours: 0,
      p95: 0,
      maxPeakCps: 0,
    });
    expect(estimate.surcharge.totalUsd).toBe(0);
  });

  it("keeps every active hour at or under 5 CPS free", () => {
    const hours = Array.from({ length: 300 }, (_, i) => hour(i, 4 + (i % 2)));
    const estimate = estimateMonthlyCpsSurcharge(hours);
    expect(estimate.maxPeakCps).toBe(5);
    expect(estimate.surcharge.totalUsd).toBe(0);
    expect(estimate.surchargeUpper.totalUsd).toBe(0);
  });
});

describe("billing month", () => {
  it("is the UTC calendar month, half open", () => {
    expect(monthRangeUtc(2026, 12)).toEqual({
      startMs: Date.UTC(2026, 11, 1),
      endMs: Date.UTC(2027, 0, 1),
    });
    expect(() => monthRangeUtc(2026, 13)).toThrow(RangeError);
  });
});
