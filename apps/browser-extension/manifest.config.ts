import { defineManifest } from "@crxjs/vite-plugin";
import { loadEnv } from "vite";
import packageJson from "./package.json";

/**
 * Pages where Ringee auto-detects phone numbers and drops a "Call with Ringee"
 * pill. The detector runs on every http(s) page so a valid number anywhere gets
 * a one-click call button automatically — no need to select text and right-click
 * (that menu still works as a second method, see the service worker). The
 * detector itself is non-privileged: it only validates visible numbers and emits
 * a typed DIAL_REQUEST; all gated work happens in the background + backend.
 */
const DETECTION_MATCHES = ["http://*/*", "https://*/*"];

/** `https://host:port/*` match pattern for a URL (host_permissions). */
function originPattern(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/*`;
  } catch {
    return null;
  }
}

/** `https://host:port` origin for a URL (CSP connect-src). */
function originBase(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function unique<T>(arr: (T | null | undefined)[]): T[] {
  return Array.from(new Set(arr.filter(Boolean) as T[]));
}

/**
 * Clerk's Frontend API origin, decoded from the publishable key. Every Clerk
 * key embeds its Frontend API host as base64 (with a trailing `$`):
 *   pk_live_Y2xlcmsucmluZ2VlLmlvJA → "clerk.ringee.io" → https://clerk.ringee.io
 * The Sync Host session-sharing reads the session cookie from this origin, so it
 * MUST be in host_permissions. In production that's the custom domain
 * (clerk.ringee.io); in development it's a *.clerk.accounts.dev host. Deriving it
 * keeps the manifest correct for whichever instance the .env points at.
 */
function clerkFrontendApiOrigin(
  publishableKey: string | undefined,
): string | null {
  if (!publishableKey) return null;
  const b64 = publishableKey.replace(/^pk_(test|live)_/, "");
  try {
    const host = Buffer.from(b64, "base64").toString("utf8").replace(/\$$/, "");
    return host ? `https://${host}` : null;
  } catch {
    return null;
  }
}

export default defineManifest((env) => {
  // Read VITE_* from the extension's .env so host_permissions + CSP match the
  // configured Ringee web app / backend (e.g. localhost in dev). This is what
  // lets the Sync Host session-sharing and the backend calls actually work.
  const e = loadEnv(env.mode, process.cwd(), "");
  const syncHost = e.VITE_CLERK_SYNC_HOST || "https://www.ringee.io";
  const apiUrl = e.VITE_RINGEE_API_URL || "https://api.ringee.io/api";
  // The Clerk Frontend API origin (e.g. https://clerk.ringee.io in production).
  // Required for Sync Host to read the signed-in session cookie — without it the
  // extension can't pick up the web-app session and stays signed out.
  const clerkApi = clerkFrontendApiOrigin(e.VITE_CLERK_PUBLISHABLE_KEY);

  // Base64 public key that pins a stable extension ID (derived from the matching
  // private key in key.pem). The ID must be constant because it's the
  // `chrome-extension://<id>` origin registered in Clerk's allowed_origins; an
  // unpinned ID changes per machine/install and breaks Sync Host in production.
  const crxKey = e.CRX_KEY || undefined;

  const host_permissions = unique<string>([
    originPattern(syncHost),
    originPattern(apiUrl),
    clerkApi ? originPattern(clerkApi) : null,
    "https://api.ringee.io/*",
    "https://www.ringee.io/*",
    "https://*.clerk.accounts.dev/*",
  ]);

  const connectSrc = unique<string>([
    "'self'",
    originBase(syncHost),
    originBase(apiUrl),
    clerkApi,
    "https://api.ringee.io",
    "https://www.ringee.io",
    "https://*.clerk.accounts.dev",
    "https://clerk.ringee.io",
    "wss://*.telnyx.com",
    "https://*.telnyx.com",
  ]).join(" ");

  return {
    manifest_version: 3,
    // Present only when CRX_KEY is set, so the extension ID stays stable.
    ...(crxKey ? { key: crxKey } : {}),
    name: "Ringee — Low-cost outbound dialing",
    version: packageJson.version,
    description:
      "Modern, low-cost outbound dialing. Call any number on any page with the real Ringee dialer over WebRTC — no per-seat tax.",
    minimum_chrome_version: "116", // offscreen + sidePanel APIs

    action: { default_title: "Ringee" },

    background: {
      service_worker: "src/background/service-worker.ts",
      type: "module",
    },

    side_panel: { default_path: "src/sidepanel/index.html" },

    content_scripts: [
      {
        matches: DETECTION_MATCHES,
        js: ["src/content/detector.ts"],
        css: ["src/content/content.css"],
        run_at: "document_idle",
      },
    ],

    permissions: [
      "offscreen", // host the WebRTC engine (never the service worker)
      "sidePanel", // mount the shared Active Call Modal
      "storage", // settings + cached snapshot
      "contextMenus", // right-click "Call with Ringee" on selected text
      "cookies", // read the Ringee web-app session (Clerk Sync Host)
    ],

    // Includes the configured sync host + API origin (localhost in dev) so the
    // extension can read the Ringee session and call the backend.
    host_permissions,

    // The user can opt into number detection on additional sites without a new
    // release (the "Enable Ringee on this site" flow).
    optional_host_permissions: ["https://*/*"],

    content_security_policy: {
      extension_pages: `script-src 'self'; object-src 'self'; connect-src ${connectSrc};`,
    },

    web_accessible_resources: [
      {
        // sounds + the Ringee mark shown inside the in-page popover.
        resources: ["sounds/*", "src/icons/*"],
        matches: ["<all_urls>"],
      },
    ],

    icons: {
      16: "src/icons/16.png",
      48: "src/icons/48.png",
      128: "src/icons/128.png",
    },
  };
});
