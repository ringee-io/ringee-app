export interface TelephonyCountryRate {
  countryCode: string;

  countryName: string;

  currency: string;

  mobileMinRatePerMinute: number;
  mobileMaxRatePerMinute: number;
  mobileAvgRatePerMinute: number;

  landlineMinRatePerMinute: number;
  landlineMaxRatePerMinute: number;
  landlineAvgRatePerMinute: number;

  provider: string;
  effectiveDate?: string;

  updatedAt?: Date;
}
