import {
  findPhoneNumbersInText,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/max";
import { DEFAULT_REGION, normalize } from "./normalize";

export interface FoundNumber {
  /** raw substring as it appeared in the page */
  raw: string;
  /** normalized E.164, e.g. +18095551234 */
  e164: string;
  /** char offset within the scanned text */
  startsAt: number;
  endsAt: number;
}

/**
 * Extract every *valid* phone number from a chunk of text.
 *
 * libphonenumber's `findPhoneNumbersInText` is deliberately conservative — it
 * ignores order numbers, dates, ZIP codes and other digit soup that a naive
 * regex would happily turn into a call button. We additionally require the
 * match to be `isValid()` for its region so we never inject a dead button, and
 * we dedupe by E.164 so the same number scanned twice yields one result.
 */
export function extractNumbers(
  text: string,
  region: CountryCode = DEFAULT_REGION,
): FoundNumber[] {
  if (!text || text.length < 7) return [];
  const out: FoundNumber[] = [];
  const seen = new Set<string>();
  for (const match of findPhoneNumbersInText(text, region)) {
    const num = match.number;
    if (!num.isValid()) continue;
    if (seen.has(num.number)) continue;
    seen.add(num.number);
    out.push({
      raw: text.slice(match.startsAt, match.endsAt),
      e164: num.number,
      startsAt: match.startsAt,
      endsAt: match.endsAt,
    });
  }
  return out;
}

/**
 * Resolve a single dialable E.164 number from arbitrary user input — a typed
 * dial-pad value or a right-click text selection — accepting numbers from
 * anywhere in the world, or return null.
 *
 * It is deliberately more forgiving than {@link normalize}: the user's intent
 * here is explicit (they typed it or selected it), so we accept anything
 * dialable rather than only strictly-valid numbers. The ladder is:
 *   1. a strictly valid number (best),
 *   2. a *possible* number — right shape/length for its country even if the
 *      exact range isn't in libphonenumber's tables (this is what lets the dial
 *      button light up for any `+<countrycode>` number worldwide),
 *   3. the first valid number recovered from surrounding label text
 *      ("Tel: +1 809 555 1234", "Llámame al +44 20 7946 0958").
 * Any `+`-prefixed number resolves without the right region; `region` only
 * matters for a bare local number.
 */
export function resolveDialNumber(
  input: string,
  region: CountryCode = DEFAULT_REGION,
): string | null {
  if (!input) return null;
  const clean = normalize(input, region);
  if (clean) return clean;
  const parsed = parsePhoneNumberFromString(input.trim(), region);
  if (parsed?.isPossible()) return parsed.number;
  return extractNumbers(input, region)[0]?.e164 ?? null;
}
