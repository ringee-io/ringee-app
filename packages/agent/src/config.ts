/**
 * Connection configuration for the Ringee agent layer.
 *
 * The agent never talks to the database — it speaks to the Ringee backend MCP.
 * Two ways to authenticate, both supported:
 *
 *  - **API key** (recommended): `Authorization: Bearer ringee_sk_…` against the
 *    single endpoint `<backend>/api/mcp` (Streamable HTTP). The key comes from
 *    `RINGEE_API_KEY` or from `ringee login`.
 *  - **Legacy capability URL**: the user (and optionally organization) UUID
 *    embedded in the SSE URL path, as `McpController` serves it.
 */

/** How the MCP client talks to the server. */
export type RingeeTransport = "streamable-http" | "sse";

/** Where a resolved connection came from — shown by `ringee config show`. */
export type RingeeConfigSource =
  | "env:RINGEE_MCP_URL"
  | "env:RINGEE_USER_ID"
  | "env:RINGEE_API_KEY"
  | "login";

export interface RingeeAgentConfig {
  /** Full MCP endpoint URL. */
  mcpUrl: string;
  transport: RingeeTransport;
  /** Bearer token sent as the Authorization header (a personal API key). */
  apiKey?: string;
  /** Identity used to build a legacy URL (kept for display/debugging). */
  userId?: string;
  organizationId?: string;
  backendUrl?: string;
  source: RingeeConfigSource;
}

/** Credentials persisted by `ringee login`. */
export interface StoredRingeeCredentials {
  apiKey: string;
  backendUrl?: string;
}

export const DEFAULT_BACKEND_URL = "https://api.ringee.io";

const GLOBAL_PREFIX = "/api";

/** Backend origin without a trailing slash or `/api` suffix. */
export function normalizeBackendUrl(backendUrl: string): string {
  // Trimmed by hand: /\/+$/ backtracks quadratically on a long run of "/".
  let end = backendUrl.length;
  while (end > 0 && backendUrl[end - 1] === "/") end--;
  return backendUrl.slice(0, end).replace(/\/api$/, "");
}

/** Build the legacy MCP SSE URL the backend `McpController` serves. */
export function buildMcpUrl(
  backendUrl: string,
  userId: string,
  organizationId?: string | null,
): string {
  const base = normalizeBackendUrl(backendUrl);
  const path = organizationId
    ? `${GLOBAL_PREFIX}/mcp/${userId}/${organizationId}/sse`
    : `${GLOBAL_PREFIX}/mcp/${userId}/sse`;
  return `${base}${path}`;
}

/** The API-key MCP endpoint (Streamable HTTP). */
export function buildApiKeyMcpUrl(backendUrl: string): string {
  return `${normalizeBackendUrl(backendUrl)}${GLOBAL_PREFIX}/mcp`;
}

/** SSE endpoints end in `/sse`; anything else is Streamable HTTP. */
export function inferTransport(mcpUrl: string): RingeeTransport {
  try {
    return new URL(mcpUrl).pathname.replace(/\/+$/, "").endsWith("/sse")
      ? "sse"
      : "streamable-http";
  } catch {
    return "sse";
  }
}

export class RingeeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RingeeConfigError";
  }
}

/**
 * Resolve the connection. Environment variables win over a saved login, so a
 * CI job or an agent harness is never silently redirected. Precedence:
 *
 *   1. RINGEE_MCP_URL                        (explicit URL, + RINGEE_API_KEY if set)
 *   2. RINGEE_BACKEND_URL + RINGEE_USER_ID   (+ RINGEE_ORG_ID) — legacy URL
 *   3. RINGEE_API_KEY                        (+ RINGEE_BACKEND_URL)
 *   4. `stored` — the credentials saved by `ringee login`
 */
export function resolveConfig(
  env: Record<string, string | undefined> = process.env,
  stored?: StoredRingeeCredentials | null,
): RingeeAgentConfig {
  const apiKey = env.RINGEE_API_KEY || undefined;

  if (env.RINGEE_MCP_URL) {
    return {
      mcpUrl: env.RINGEE_MCP_URL,
      transport: inferTransport(env.RINGEE_MCP_URL),
      apiKey,
      userId: env.RINGEE_USER_ID,
      organizationId: env.RINGEE_ORG_ID,
      backendUrl: env.RINGEE_BACKEND_URL,
      source: "env:RINGEE_MCP_URL",
    };
  }

  if (env.RINGEE_BACKEND_URL && env.RINGEE_USER_ID) {
    return {
      mcpUrl: buildMcpUrl(
        env.RINGEE_BACKEND_URL,
        env.RINGEE_USER_ID,
        env.RINGEE_ORG_ID,
      ),
      transport: "sse",
      apiKey,
      userId: env.RINGEE_USER_ID,
      organizationId: env.RINGEE_ORG_ID,
      backendUrl: env.RINGEE_BACKEND_URL,
      source: "env:RINGEE_USER_ID",
    };
  }

  if (apiKey) {
    const backendUrl = env.RINGEE_BACKEND_URL || DEFAULT_BACKEND_URL;
    return {
      mcpUrl: buildApiKeyMcpUrl(backendUrl),
      transport: "streamable-http",
      apiKey,
      backendUrl,
      source: "env:RINGEE_API_KEY",
    };
  }

  if (stored?.apiKey) {
    const backendUrl =
      stored.backendUrl || env.RINGEE_BACKEND_URL || DEFAULT_BACKEND_URL;
    return {
      mcpUrl: buildApiKeyMcpUrl(backendUrl),
      transport: "streamable-http",
      apiKey: stored.apiKey,
      backendUrl,
      source: "login",
    };
  }

  throw new RingeeConfigError(
    "Not logged in to Ringee. Run `ringee login`, or set RINGEE_API_KEY " +
      "(create one in the dashboard: Settings → Connectors). The legacy " +
      "RINGEE_MCP_URL / RINGEE_BACKEND_URL + RINGEE_USER_ID still work.",
  );
}

/** Whether there is enough to connect (no throw). */
export function hasConfig(
  env: Record<string, string | undefined> = process.env,
  stored?: StoredRingeeCredentials | null,
): boolean {
  return Boolean(
    env.RINGEE_MCP_URL ||
      (env.RINGEE_BACKEND_URL && env.RINGEE_USER_ID) ||
      env.RINGEE_API_KEY ||
      stored?.apiKey,
  );
}
