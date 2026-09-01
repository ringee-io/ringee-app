import { BadRequestException } from "@nestjs/common";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Parsing and fetching a user-supplied web address that Ringee retrieves on
 * their behalf.
 *
 * Two places do this — drafting company context from a website, and crawling a
 * page into a knowledge base — and both take the address from the browser and
 * make a server-side request with it. Without this the API is a request
 * forwarder aimed at Ringee's own network.
 *
 * A hostname check alone is not enough, so this module enforces three things:
 * only http(s); the host must not *resolve* to a reserved address (a public
 * name can point at 127.0.0.1 or at a cloud metadata endpoint); and every
 * redirect hop is checked again, because the first response is free to send the
 * request somewhere the first check would have refused.
 */

/** How many redirects to follow before giving up. */
const MAX_REDIRECTS = 5;

export function requirePublicUrl(raw: string | null | undefined): URL {
  const trimmed = raw?.trim();
  if (!trimmed) {
    throw new BadRequestException("A web address is required.");
  }

  let url: URL;
  try {
    url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new BadRequestException(`"${raw}" is not a valid web address.`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new BadRequestException(
      "Only http and https addresses are supported.",
    );
  }
  if (isPrivateHost(url.hostname)) {
    throw new BadRequestException("That address is not a public website.");
  }
  return url;
}

/**
 * Fetches a URL that has already passed `requirePublicUrl`, re-checking the
 * target before every request.
 *
 * Redirects are followed by hand rather than by `redirect: "follow"`: the
 * built-in follow never re-runs the check, so one 302 to `http://169.254.169.254`
 * is all it takes to read a cloud metadata endpoint through this API.
 *
 * Returns null when the address cannot be retrieved. Callers treat that as "no
 * content", never as an error worth surfacing — the address came from a user
 * and being unreachable is an ordinary outcome.
 */
export async function fetchPublicPage(
  url: URL,
  init: { timeoutMs: number; headers?: Record<string, string> },
): Promise<Response | null> {
  let target = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertResolvesToPublicAddress(target);

    const response = await fetch(target, {
      // Manual, so the next hop goes back through the check above.
      redirect: "manual",
      signal: AbortSignal.timeout(init.timeoutMs),
      headers: init.headers,
    });

    if (!isRedirect(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) return response;

    // A relative Location resolves against the hop it came from.
    const next = new URL(location, target);
    if (next.protocol !== "https:" && next.protocol !== "http:") return null;
    if (isPrivateHost(next.hostname)) return null;
    target = next;
  }

  return null;
}

function isRedirect(status: number): boolean {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  );
}

/**
 * Resolves the hostname and refuses the request when any address it answers
 * with is reserved.
 *
 * Every address is checked, not just the first: a name that answers with one
 * public and one loopback address must not be fetched, because which one the
 * socket picks is not ours to decide.
 */
async function assertResolvesToPublicAddress(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "");

  // An IP literal was already checked by `isPrivateHost`; there is nothing to
  // resolve, and asking DNS about it would only add a round trip.
  if (isIP(host)) return;

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    // A name that does not resolve cannot be fetched either way. Refusing here
    // keeps the failure on this side of the socket.
    throw new BadRequestException("That address could not be resolved.");
  }

  if (addresses.some((entry) => isReservedAddress(entry.address))) {
    throw new BadRequestException("That address is not a public website.");
  }
}

/** Loopback, link-local, private and other reserved targets, by hostname. */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  return isIP(host) ? isReservedAddress(host) : false;
}

/**
 * Whether an IP literal is in a range Ringee must never fetch.
 *
 * Deliberately broader than RFC1918: carrier-grade NAT, benchmarking and the
 * IPv6 unique-local range all reach infrastructure a tenant has no business
 * pointing this API at, and 169.254.169.254 — cloud instance metadata — is the
 * single most valuable target an SSRF has.
 */
function isReservedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isReservedIpv4(address);
  if (version === 6) return isReservedIpv6(address);
  return false;
}

function isReservedIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n)))
    return true;
  const [a, b] = parts as [number, number, number, number];

  if (a === 0) return true; // "this" network
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

function isReservedIpv6(address: string): boolean {
  const host = address.toLowerCase();
  if (host === "::" || host === "::1") return true; // unspecified, loopback

  // An IPv4-mapped address is an IPv4 target wearing an IPv6 hat.
  const mapped = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped?.[1]) return isReservedIpv4(mapped[1]);

  if (/^f[cd]/.test(host)) return true; // unique-local (fc00::/7)
  if (host.startsWith("fe8") || host.startsWith("fe9")) return true; // link-local
  if (host.startsWith("fea") || host.startsWith("feb")) return true;
  if (host.startsWith("ff")) return true; // multicast
  return false;
}
