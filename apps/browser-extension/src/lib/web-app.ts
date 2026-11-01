const PRODUCTION_WEB_APP = "https://www.ringee.io";

/**
 * The configured web app, or production when it is unset, blank or not an
 * absolute http(s) URL — so a link always opens a real page and the sign-in
 * screen can always read its host.
 */
function webAppBase(configured: string | undefined): string {
  const value = configured?.trim();
  if (!value) return PRODUCTION_WEB_APP;
  try {
    const { protocol } = new URL(value);
    if (protocol === "https:" || protocol === "http:") {
      return value.replace(/\/+$/, "");
    }
  } catch {
    // Not a URL: production below.
  }
  return PRODUCTION_WEB_APP;
}

/**
 * The Ringee web app the panel sends people to: making a list, upgrading,
 * signing in. Navigation only — Clerk's session sync keeps its own host
 * (`VITE_CLERK_SYNC_HOST`), which in production is Clerk's domain, not the app.
 */
const WEB_APP_URL = webAppBase(import.meta.env.VITE_RINGEE_WEB_URL);

/** A page of the web app, e.g. `webAppUrl("/dashboard/lists")`. */
export function webAppUrl(path = "/"): string {
  return `${WEB_APP_URL}${path}`;
}
