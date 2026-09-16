export interface TelephonyCountryRate {
  countryCode: string;

  countryName: string;

  currency: string;

  mobileMinRatePerMinute: number;
  mobileMaxRatePerMinute: number;
  mobileAvgRatePerMinute: number;
  /**
   * How many priced routes the mobile figures came from. Zero means the rate
   * deck priced none, so the figures are a placeholder and must not be quoted
   * as a price.
   */
  mobileRouteCount?: number;

  landlineMinRatePerMinute: number;
  landlineMaxRatePerMinute: number;
  landlineAvgRatePerMinute: number;
  /** Priced landline routes behind the landline figures. See above. */
  landlineRouteCount?: number;

  provider: string;
  effectiveDate?: string;

  updatedAt?: Date;
}
