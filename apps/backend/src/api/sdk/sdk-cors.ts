import type { Request, Response, NextFunction } from "express";

/**
 * Dynamic CORS for the browser Dialer SDK, scoped to `/api/v1/sdk/*`.
 *
 * The rest of the API keeps its static, credentialed allow-list (see
 * `main.ts`). SDK endpoints are different: they are called cross-origin from
 * arbitrary CRM domains and are NON-credentialed (bearer token + `X-Ringee-Key`,
 * never cookies). CORS is therefore not the security boundary — the publishable
 * key, origin allow-list and OTP are. This middleware reflects the requesting
 * `Origin` (with `Vary: Origin`) so the browser can read responses, and answers
 * preflights; the actual authorization always happens in the handlers.
 *
 * Must be registered BEFORE the global `app.enableCors(...)` so it can fully
 * own the preflight for SDK paths.
 */

const SDK_PATH_PREFIX = "/api/v1/sdk";
const ALLOWED_METHODS = "GET,POST,OPTIONS";
const ALLOWED_HEADERS =
  "Authorization,Content-Type,X-Ringee-Key,Idempotency-Key";
const MAX_AGE_SECONDS = "600";

export function sdkCors(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith(SDK_PATH_PREFIX)) {
    next();
    return;
  }

  const origin = req.headers.origin;
  if (typeof origin === "string" && origin) {
    // Reflect exactly the requesting origin — never a wildcard.
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
    res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
    res.setHeader("Access-Control-Max-Age", MAX_AGE_SECONDS);
  }

  if (req.method === "OPTIONS") {
    // Preflight cannot carry the pk/session (custom headers aren't sent on
    // preflight), so we approve the mechanics here; the real request is still
    // authorized server-side. End the response so the global CORS never runs.
    res.status(204).end();
    return;
  }

  next();
}
