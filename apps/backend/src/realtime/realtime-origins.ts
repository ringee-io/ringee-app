import { apiConfiguration } from "@ringee/configuration";

/**
 * Browser origins allowed to open a realtime socket.
 *
 * WebSockets are NOT covered by CORS: a page on any origin can open one, so the
 * `Origin` header has to be checked by hand or an attacker's page could ride a
 * logged-in user's session. This mirrors the credentialed allow-list in
 * `main.ts`; keep the two in step.
 */
const STATIC_ALLOWED_ORIGINS = [
  apiConfiguration.FRONTEND_URL,
  "https://phone.ringee.io",
  "http://localhost:4200",
  "http://localhost:4201",
  "http://localhost:8081",
  "http://localhost:19006",
].filter((origin): origin is string => Boolean(origin));

/**
 * Non-browser clients (the mobile app, integration tests) send no `Origin` at
 * all; they are authenticated by the Clerk token in the auth frame like
 * everyone else. Chrome extensions are allowed by scheme because the published
 * and pinned-dev extension ids differ per build.
 */
export function isAllowedRealtimeOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (origin.startsWith("chrome-extension://")) return true;
  if (origin === "null") return false;
  return STATIC_ALLOWED_ORIGINS.includes(origin);
}
