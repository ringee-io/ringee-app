/**
 * Origin allow-listing for the Dialer SDK.
 *
 * The publishable key is signed with the exact set of origins a given CRM
 * installation may embed from. An `Origin` header is only accepted when, after
 * safe normalization, it matches one of the signed origins EXACTLY. There is no
 * implicit scheme upgrade, no subdomain wildcard, and no suffix matching — so
 * `https://crm.example.com` never authorizes `http://crm.example.com`,
 * `https://sub.crm.example.com`, or `https://crm.example.com.attacker.com`.
 */

/**
 * Normalize a browser `Origin` (or a configured allowed origin) to its
 * canonical `scheme://host[:port]` form, dropping any path/query/fragment and
 * the default port for the scheme. Returns `null` for anything that is not a
 * valid absolute http(s) origin.
 */
export function normalizeOrigin(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  // Only real web origins can embed the SDK.
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  // A bare origin has no path/search/hash. Reject values that carry extra parts
  // so a configured allow entry can never be a path-scoped URL by accident.
  if (
    (url.pathname && url.pathname !== "/") ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    return null;
  }

  const scheme = url.protocol.replace(":", "");
  const host = url.hostname.toLowerCase();
  const isDefaultPort =
    !url.port ||
    (scheme === "https" && url.port === "443") ||
    (scheme === "http" && url.port === "80");

  return isDefaultPort
    ? `${scheme}://${host}`
    : `${scheme}://${host}:${url.port}`;
}

/**
 * True when `requestOrigin` is present, valid, and exactly matches one of the
 * `allowedOrigins` after both sides are normalized. Fails closed on any invalid
 * input.
 */
export function isOriginAllowed(
  requestOrigin: string | undefined | null,
  allowedOrigins: readonly string[],
): boolean {
  const normalized = normalizeOrigin(requestOrigin);
  if (!normalized) return false;
  for (const candidate of allowedOrigins) {
    const allowed = normalizeOrigin(candidate);
    if (allowed && allowed === normalized) return true;
  }
  return false;
}

/**
 * Validate a caller-supplied list of allowed origins at key-mint time. Throws
 * on any entry that is not a clean absolute origin, and de-duplicates the
 * normalized result. `http://localhost:*` is permitted so integrators can test
 * from a dev server, but only when listed explicitly.
 */
export function normalizeAllowedOrigins(input: readonly string[]): string[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("At least one allowed origin is required");
  }
  const out = new Set<string>();
  for (const entry of input) {
    const normalized = normalizeOrigin(entry);
    if (!normalized) {
      throw new Error(`Invalid allowed origin: ${String(entry)}`);
    }
    out.add(normalized);
  }
  return [...out];
}
