import { RingeeClient, resolveConfig } from "@ringee-io/agent";

/**
 * Server-only access to the Ringee backend/MCP. The ChatGPT App never reaches
 * the database — it proxies through this client to the existing MCP, which is
 * the single source of truth.
 *
 * Two modes:
 *   - `getRingeeClient()`          single account from the env (dev only).
 *   - `getRingeeClientForToken()`  forwards the caller's OAuth token to the
 *                                  backend's authenticated MCP, which resolves
 *                                  the right Ringee user OR organization.
 */
let client: RingeeClient | null = null;

export function getRingeeClient(): RingeeClient {
  if (!client) {
    // Throws a descriptive RingeeConfigError if env is missing.
    resolveConfig();
    client = RingeeClient.fromEnv();
  }
  return client;
}

/**
 * Build a per-request Ringee client for one authenticated caller by forwarding
 * their OAuth bearer token to the backend's authenticated ChatGPT MCP endpoint
 * (`/api/mcp/chatgpt/sse`). The backend verifies the token with Clerk and maps
 * it to the caller's Ringee user — or, when the Clerk session has an active
 * organization, to that organization. No account ids live in this proxy.
 *
 * Requires RINGEE_BACKEND_URL (the Ringee API origin).
 */
export function getRingeeClientForToken(token: string): RingeeClient {
  const backendUrl = process.env.RINGEE_BACKEND_URL;
  if (!backendUrl) {
    throw new Error(
      "Multi-tenant mode needs RINGEE_BACKEND_URL to reach the authenticated MCP endpoint.",
    );
  }

  // Tolerate a backend URL with or without a trailing /api.
  const base = backendUrl.replace(/\/+$/, "").replace(/\/api$/, "");
  const url = `${base}/api/mcp/chatgpt/sse`;

  // The token rides as the bearer on both the SSE stream and the POST messages.
  return new RingeeClient({ url, apiKey: token });
}

/** Base URL where this Next app is hosted (for widget asset URLs). */
export function getAppBaseUrl(): string {
  return (
    process.env.RINGEE_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:4202"
  ).replace(/\/+$/, "");
}
