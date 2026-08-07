import {
  parsePhoneNumberFromString,
  getCountryCallingCode,
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

/**
 * The E.164 calling code for a country (e.g. "1" for US, "34" for ES).
 *
 * Tap-to-dial keypads mimic a physical phone: users tap the *local* digits,
 * not a full international number. A bare "+" plus those local digits is
 * only a valid destination by coincidence for NANP countries, where the "1"
 * trunk prefix users habitually dial doubles as the correct calling code —
 * everywhere else (e.g. Spain, "+" + 9 local digits) it produces an invalid
 * or wrong-country number. Callers should seed the first tapped digit with
 * this code for the currently selected country instead.
 */
export function countryCallingCode(
  region: CountryCode = DEFAULT_REGION,
): string {
  try {
    return getCountryCallingCode(region);
  } catch {
    return "1";
  }
}

export type { CountryCode };
