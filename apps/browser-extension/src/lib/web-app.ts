/**
 * The Ringee web app the panel sends people to: making a list, upgrading,
 * signing in. Navigation only — Clerk's session sync keeps its own host
 * (`VITE_CLERK_SYNC_HOST`), which in production is Clerk's domain, not the app.
 */
const WEB_APP_URL = (
  import.meta.env.VITE_RINGEE_WEB_URL ?? "https://www.ringee.io"
).replace(/\/+$/, "");

/** A page of the web app, e.g. `webAppUrl("/dashboard/lists")`. */
export function webAppUrl(path = "/"): string {
  return `${WEB_APP_URL}${path}`;
}
