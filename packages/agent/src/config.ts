/**
 * Connection configuration for the Ringee agent layer.
 *
 * The agent never talks to the database — it speaks to the existing Ringee
 * backend MCP over SSE. The connection is identified the same way the backend
 * `McpController` expects: the user (and optionally organization) UUID embedded
 * in the URL path.
 */
export interface RingeeAgentConfig {
  /** Full MCP SSE URL, e.g. https://api.ringee.io/api/mcp/<userId>/sse */
  mcpUrl: string;
  /** Optional bearer token / API key sent as Authorization header. */
  apiKey?: string;
  /** Identity used to build the URL (kept for display/debugging). */
  userId?: string;
  organizationId?: string;
  backendUrl?: string;
}

const GLOBAL_PREFIX = "/api";

/** Build the MCP SSE URL the backend `McpController` serves. */
export function buildMcpUrl(
  backendUrl: string,
  userId: string,
  organizationId?: string | null,
): string {
  // Tolerate a backendUrl that already includes the /api prefix.
  const base = backendUrl.replace(/\/+$/, "").replace(/\/api$/, "");
  const path = organizationId
    ? `${GLOBAL_PREFIX}/mcp/${userId}/${organizationId}/sse`
    : `${GLOBAL_PREFIX}/mcp/${userId}/sse`;
  return `${base}${path}`;
}

export class RingeeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RingeeConfigError";
  }
}

/**
 * Resolve config from the environment. Precedence:
 *   1. RINGEE_MCP_URL                          (full SSE URL — preferred)
 *   2. RINGEE_BACKEND_URL + RINGEE_USER_ID     (+ optional RINGEE_ORG_ID)
 *
 * Optional: RINGEE_API_KEY for an Authorization header.
 */
export function resolveConfig(
  env: Record<string, string | undefined> = process.env,
): RingeeAgentConfig {
  const apiKey = env.RINGEE_API_KEY;

  if (env.RINGEE_MCP_URL) {
    return {
      mcpUrl: env.RINGEE_MCP_URL,
      apiKey,
      userId: env.RINGEE_USER_ID,
      organizationId: env.RINGEE_ORG_ID,
      backendUrl: env.RINGEE_BACKEND_URL,
    };
  }

  const backendUrl = env.RINGEE_BACKEND_URL;
  const userId = env.RINGEE_USER_ID;
  const organizationId = env.RINGEE_ORG_ID;

  if (!backendUrl || !userId) {
    throw new RingeeConfigError(
      "Missing Ringee connection config. Set RINGEE_MCP_URL, or " +
        "RINGEE_BACKEND_URL together with RINGEE_USER_ID (and optionally " +
        "RINGEE_ORG_ID). Get these from the dashboard: Settings → MCP / " +
        "Integrations (GET /api/mcp/connection-info).",
    );
  }

  return {
    mcpUrl: buildMcpUrl(backendUrl, userId, organizationId),
    apiKey,
    userId,
    organizationId,
    backendUrl,
  };
}

/** Whether the environment has enough to connect (no throw). */
export function hasConfig(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(
    env.RINGEE_MCP_URL || (env.RINGEE_BACKEND_URL && env.RINGEE_USER_ID),
  );
}
