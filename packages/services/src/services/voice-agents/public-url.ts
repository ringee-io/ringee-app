import { BadRequestException } from "@nestjs/common";

/**
 * Parses a user-supplied web address that Ringee is about to fetch on their
 * behalf.
 *
 * Both places that do this — drafting company context from a website, and
 * crawling a page into a knowledge base — take a URL from the browser and make
 * a server-side request with it. Without this check that turns the API into a
 * request forwarder aimed at Ringee's own network, so loopback, link-local and
 * private ranges are refused and only http(s) is allowed.
 */
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

/** Loopback, link-local and RFC1918 targets. */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "[::1]" || host === "::1") return true;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;

  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}
