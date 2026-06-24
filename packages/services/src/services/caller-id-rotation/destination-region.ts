import { parsePhoneNumberFromString } from "libphonenumber-js/max";

export interface DestinationRegion {
  /** ISO-3166 alpha-2 country (e.g. "US"), or null if undeterminable. */
  country: string | null;
  /**
   * A coarse "local presence" prefix used only as a *soft* preference. For NANP
   * (+1) this is the 3-digit area code; elsewhere it's the leading significant
   * digits of the national number. The hard guarantee is always `country`.
   */
  areaCode: string | null;
}

/** Leading significant digits used to approximate a "same area" preference. */
function deriveAreaCode(nationalNumber: string): string | null {
  if (!nationalNumber) return null;
  return nationalNumber.length >= 3
    ? nationalNumber.slice(0, 3)
    : nationalNumber;
}

/**
 * Parse an E.164 number into the country (hard filter) and an area-code-like
 * prefix (soft local-presence preference). Tolerant: returns nulls rather than
 * throwing on unparseable input so the caller can fall back to a fixed number.
 */
export function resolveRegion(e164OrRaw: string): DestinationRegion {
  if (!e164OrRaw) return { country: null, areaCode: null };
  const parsed = parsePhoneNumberFromString(e164OrRaw.trim());
  if (!parsed) return { country: null, areaCode: null };
  return {
    country: parsed.country ?? null,
    areaCode: deriveAreaCode(parsed.nationalNumber),
  };
}
