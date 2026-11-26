import { describe, expect, it } from "vitest";
import {
  CPS_PRICING_SCHEDULES,
  TELNYX_CPS_PRICING_2026_12,
  calculateCpsSurcharge,
  pricingScheduleAt,
  type CpsPricingSchedule,
} from "./telnyx-cps-surcharge";

const usd = (cps: number) => calculateCpsSurcharge(cps).totalUsd;

describe("Telnyx CPS surcharge calculator", () => {
  it("refuses malformed tier schedules and unsafe financial precision", () => {
    for (const tiers of [
      [{ upToCps: 5, usdPerCps: 0 }],
      [
        { upToCps: 5, usdPerCps: 0 },
        { upToCps: 4, usdPerCps: 12 },
        { upToCps: null, usdPerCps: 30 },
      ],
      [{ upToCps: null, usdPerCps: -1 }],
    ])
      expect(() =>
        calculateCpsSurcharge(10, {
          schedule: { ...TELNYX_CPS_PRICING_2026_12, tiers },
        }),
      ).toThrow(RangeError);
    expect(() => calculateCpsSurcharge(Number.MAX_VALUE)).toThrow(RangeError);
    expect(() =>
      calculateCpsSurcharge(5, { asOf: new Date("invalid") }),
    ).toThrow(RangeError);
  });
  // The worked examples of the brief and of Telnyx's own article.
  it.each([
    [0, 0],
    [5, 0],
    [10, 60],
    [25, 240],
    [50, 640],
    [100, 1_440],
    [163, 2_448],
    [200, 3_040],
    [250, 4_240],
    [500, 11_740],
  ])("a monthly P95 of %i CPS costs $%i", (cps, expected) => {
    expect(usd(cps)).toBe(expected);
  });

  // Every tier edge, on both sides: the price changes exactly where Telnyx's
  // table says it does ("first 5 free, up to 25, up to 200, up to 250, 251+").
  it.each([
    [1, 0],
    [4, 0],
    [5, 0],
    [6, 12],
    [7, 24],
    [24, 228],
    [25, 240],
    [26, 256],
    [27, 272],
    [199, 3_024],
    [200, 3_040],
    [201, 3_064],
    [249, 4_216],
    [250, 4_240],
    [251, 4_270],
    [252, 4_300],
    [1_000, 26_740],
  ])("tier boundary: %i CPS is $%i", (cps, expected) => {
    expect(usd(cps)).toBe(expected);
  });

  it("is monotonic and never decreases from one CPS to the next", () => {
    let previous = -1;
    for (let cps = 0; cps <= 600; cps++) {
      const total = usd(cps);
      expect(total).toBeGreaterThanOrEqual(previous);
      previous = total;
    }
  });

  it("charges each CPS the rate of its own tier (marginal price)", () => {
    const marginal = (cps: number) => usd(cps) - usd(cps - 1);
    expect(marginal(5)).toBe(0);
    expect(marginal(6)).toBe(12);
    expect(marginal(25)).toBe(12);
    expect(marginal(26)).toBe(16);
    expect(marginal(200)).toBe(16);
    expect(marginal(201)).toBe(24);
    expect(marginal(250)).toBe(24);
    expect(marginal(251)).toBe(30);
  });

  it("explains the total slice by slice, exactly as Telnyx's example does", () => {
    const result = calculateCpsSurcharge(163);
    expect(result.slices.filter((slice) => slice.cents > 0)).toEqual([
      { fromCps: 5, toCps: 25, cps: 20, usdPerCps: 12, cents: 24_000 },
      { fromCps: 25, toCps: 163, cps: 138, usdPerCps: 16, cents: 220_800 },
    ]);
    expect(result.totalCents).toBe(244_800);
  });

  it("prices a fractional peak at the next whole CPS (the conservative reading)", () => {
    const result = calculateCpsSurcharge(5.01);
    expect(result.billableCps).toBe(6);
    expect(result.totalUsd).toBe(12);
    expect(calculateCpsSurcharge(4.9).totalUsd).toBe(0);
  });

  it("works in integer cents, so a sum of many slices cannot drift", () => {
    for (let cps = 0; cps <= 1_000; cps++) {
      const result = calculateCpsSurcharge(cps);
      expect(Number.isInteger(result.totalCents)).toBe(true);
      expect(result.totalUsd).toBe(result.totalCents / 100);
      expect(result.slices.reduce((sum, slice) => sum + slice.cents, 0)).toBe(
        result.totalCents,
      );
    }
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses an invalid peak (%s)",
    (cps) => {
      expect(() => calculateCpsSurcharge(cps)).toThrow(RangeError);
    },
  );

  describe("effective date", () => {
    it("says whether the surcharge bills Programmable Voice yet", () => {
      expect(
        calculateCpsSurcharge(10, { asOf: Date.parse("2026-11-30T23:59:59Z") })
          .billsProgrammableVoice,
      ).toBe(false);
      expect(
        calculateCpsSurcharge(10, { asOf: Date.parse("2026-12-01T00:00:00Z") })
          .billsProgrammableVoice,
      ).toBe(true);
      expect(
        calculateCpsSurcharge(10, { asOf: new Date("2027-01-15T00:00:00Z") })
          .billsProgrammableVoice,
      ).toBe(true);
    });

    it("still prices a month before the date, as a what-if", () => {
      const november = calculateCpsSurcharge(100, {
        asOf: Date.parse("2026-11-10T00:00:00Z"),
      });
      expect(november.totalUsd).toBe(1_440);
      expect(november.billsProgrammableVoice).toBe(false);
    });

    it("selects the newest schedule in force and accepts a replacement table", () => {
      const next: CpsPricingSchedule = {
        id: "telnyx-cps-2027-07",
        programmableVoiceFrom: "2027-07-01",
        tiers: [
          { upToCps: 10, usdPerCps: 0 },
          { upToCps: null, usdPerCps: 20 },
        ],
        source: "test",
      };
      const schedules = [TELNYX_CPS_PRICING_2026_12, next];
      expect(
        pricingScheduleAt(Date.parse("2027-06-30T00:00:00Z"), schedules).id,
      ).toBe(TELNYX_CPS_PRICING_2026_12.id);
      expect(
        pricingScheduleAt(Date.parse("2027-07-01T00:00:00Z"), schedules).id,
      ).toBe("telnyx-cps-2027-07");
      expect(
        calculateCpsSurcharge(15, {
          schedule: next,
          asOf: Date.parse("2027-08-01"),
        }).totalUsd,
      ).toBe(100);
    });

    it("falls back to the first known schedule before any of them starts", () => {
      expect(pricingScheduleAt(Date.parse("2020-01-01T00:00:00Z")).id).toBe(
        CPS_PRICING_SCHEDULES[0].id,
      );
    });
  });
});
