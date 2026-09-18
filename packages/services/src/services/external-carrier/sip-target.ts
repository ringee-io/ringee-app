/**
 * `sip:user@host`, as a webhook reports a leg's `to` or `from`, reduced to the
 * parts a route is compared on: the user exactly (percent-decoded), the host
 * lower-cased, ignoring a scheme, port, URI parameters or angle brackets.
 * `null` for a value that is not `user@host`, such as a plain number.
 */
export function parseSipTarget(
  raw: string | null | undefined,
): { user: string; host: string } | null {
  const match = raw
    ?.trim()
    .match(/^<?(?:sips?:)?([^@\s<>;:]+)@([^\s<>;:]+)(?::\d+)?(?:[;>].*)?$/i);
  if (!match) return null;
  try {
    return { user: decodeURIComponent(match[1]), host: match[2].toLowerCase() };
  } catch {
    return null;
  }
}

/** The user part of a SIP URI, or the value itself when it is not one. */
export function sipUser(raw: string | null | undefined): string {
  return parseSipTarget(raw)?.user ?? raw?.trim().replace(/^sips?:/i, "") ?? "";
}
