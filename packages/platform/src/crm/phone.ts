import { parsePhoneNumberFromString } from "libphonenumber-js/max";

/**
 * Server-side E.164 normalization, used for CRM matching and any place the
 * backend has to reconcile a phone number it did not dial itself.
 *
 * libphonenumber is authoritative: it knows real numbering plans, so a number
 * normalized here agrees with what the browser dialer
 * (`@ringee/dialer-core/phone`) considers dialable. Previously this was a
 * regex that accepted any 6–15 digits, which meant the two could disagree — a
 * number the matcher accepted was not necessarily callable.
 *
 * The lenient path is KEPT as a fallback rather than removed. CRM records hold
 * plenty of numbers libphonenumber cannot parse (extensions, partial
 * international prefixes, country-less local numbers), and those rows already
 * matched against each other under the old behaviour. Tightening to
 * "valid or nothing" would silently stop syncing them, so an unparseable input
 * still gets the digits-only treatment it used to get.
 */

const DIGITS_ONLY = /[^\d+]/g;

/** Digit-count bounds for the fallback path, per E.164. */
const MIN_DIGITS = 6;
const MAX_DIGITS = 15;

function lenientE164(cleaned: string): string | null {
  if (cleaned.startsWith("+")) {
    const digits = cleaned.slice(1).replace(DIGITS_ONLY, "");
    if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return null;
    return `+${digits}`;
  }
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return null;
  return `+${digits}`;
}

export function normalizePhoneE164(
  raw: string | null | undefined,
  /**
   * Region used to resolve a number with no country code. Defaults to `US`,
   * matching `DEFAULT_REGION` in `@ringee/dialer-core/phone`.
   */
  region: string = "US",
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const parsed = parsePhoneNumberFromString(
    trimmed,
    region as Parameters<typeof parsePhoneNumberFromString>[1],
  );
  if (parsed?.isValid()) return parsed.number;

  return lenientE164(trimmed.replace(/[\s()\-.]/g, ""));
}

export function phoneSuffix(e164: string, length = 9): string {
  const digits = e164.replace(/\D/g, "");
  return digits.slice(-length);
}

export function phoneMatchesSuffix(a: string, b: string, length = 9): boolean {
  return phoneSuffix(a, length) === phoneSuffix(b, length);
}
