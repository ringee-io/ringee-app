import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/max";

/**
 * Default region used when a number has no country code. Salespeople on a
 * LinkedIn/CRM page rarely see fully-international numbers, so a sensible
 * default avoids dropping valid local numbers. Callers can override per-host.
 */
export const DEFAULT_REGION: CountryCode = "US";

/**
 * Validate + normalize a single string to E.164, or return null if it is not a
 * valid phone number for the region. Used by the dial pad and the prepare-call
 * gate so we never attempt a call on garbage input.
 */
export function normalize(
  input: string,
  region: CountryCode = DEFAULT_REGION,
): string | null {
  if (!input) return null;
  const n = parsePhoneNumberFromString(input.trim(), region);
  return n && n.isValid() ? n.number : null;
}

/** True when `input` is already a valid, dialable number. */
export function isValidPhoneNumber(
  input: string,
  region: CountryCode = DEFAULT_REGION,
): boolean {
  return normalize(input, region) !== null;
}

/** Human-friendly international formatting for display (falls back to input). */
export function formatForDisplay(
  input: string,
  region: CountryCode = DEFAULT_REGION,
): string {
  const n = parsePhoneNumberFromString(input.trim(), region);
  return n && n.isValid() ? n.formatInternational() : input;
}

export type { CountryCode };
