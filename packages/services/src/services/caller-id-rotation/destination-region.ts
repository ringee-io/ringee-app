import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { US_STATE_BY_AREA_CODE } from "./us-area-codes";

export interface DestinationRegion {
  /** ISO-3166 alpha-2 country (e.g. "US"), or null if undeterminable. */
  country: string | null;
  /** International calling code without '+', including shared/non-geographic plans. */
  callingCode: string | null;
  /** US postal abbreviation, including DC, only for geographic +1 numbers. */
  state: string | null;
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
  const unknown = {
    country: null,
    callingCode: null,
    state: null,
    areaCode: null,
  };
  if (typeof e164OrRaw !== "string" || !e164OrRaw.trim()) return unknown;
  // Dial surfaces supply E.164. Also accept explicit international access
  // prefixes; never guess a country for an unqualified national number.
  const international = e164OrRaw.trim().replace(/^(?:00|011)(?=\s*\d)/, "+");
  const parsed = parsePhoneNumberFromString(international, { extract: false });
  if (!parsed?.isPossible()) return unknown;
  const prefix = deriveAreaCode(parsed.nationalNumber);
  const state =
    parsed.countryCallingCode === "1"
      ? (US_STATE_BY_AREA_CODE.get(prefix ?? "") ?? null)
      : null;
  const type = parsed.getType();
  if (
    !state &&
    !parsed.country &&
    !parsed.isNonGeographic() &&
    type !== "TOLL_FREE"
  ) {
    return unknown;
  }
  return {
    // NANPA also covers new US overlays not yet present in libphonenumber.
    country:
      parsed.countryCallingCode === "1" && type === "TOLL_FREE"
        ? null
        : state
          ? "US"
          : (parsed.country ?? null),
    callingCode: parsed.countryCallingCode,
    state,
    areaCode:
      parsed.isNonGeographic() ||
      type === "TOLL_FREE" ||
      type === "PREMIUM_RATE"
        ? null
        : prefix,
  };
}
