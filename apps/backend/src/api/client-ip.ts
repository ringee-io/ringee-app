import { isIP } from "node:net";
import type { Request } from "express";

/**
 * The address a request came from, as abuse limits count it.
 *
 * Railway documents X-Real-IP as the client address it sets at its edge. Only
 * trust it when Railway's own deployment marker is present; otherwise a direct
 * client could forge this header to rotate limiter identities. Elsewhere it is
 * `req.ip`, which honours `TRUST_PROXY_HOPS` — behind a proxy nobody declared,
 * that is the proxy's address, shared by every client.
 */
export function clientIp(request: Request): string {
  const railwayIp = process.env.RAILWAY_ENVIRONMENT_ID
    ? validIpHeader(request.headers["x-real-ip"])
    : null;
  return normalizeIp(
    railwayIp || request.ip || request.socket.remoteAddress || "unknown",
  );
}

function validIpHeader(value: string | string[] | undefined): string | null {
  const candidate = (Array.isArray(value) ? value[0] : value)
    ?.split(",")[0]
    ?.trim();
  if (!candidate) return null;
  const normalized = normalizeIp(candidate);
  return isIP(normalized) ? normalized : null;
}

function normalizeIp(value: string): string {
  return value
    .trim()
    .replace(/^::ffff:/, "")
    .replace(/%.+$/, "")
    .toLowerCase();
}
