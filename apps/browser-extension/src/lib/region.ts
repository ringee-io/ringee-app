import type { CountryCode } from "@ringee/dialer-core/phone";

/** Default region for numbers detected without a country code. */
export const DEFAULT_REGION = (import.meta.env.VITE_DEFAULT_REGION ??
  "US") as CountryCode;
