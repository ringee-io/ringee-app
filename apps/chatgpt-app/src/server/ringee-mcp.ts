import { RingeeClient, resolveConfig } from "@ringee-io/agent";

/**
 * Server-only access to the Ringee backend/MCP. The ChatGPT App never reaches
 * the database — it proxies through this client to the existing MCP, which is
 * the single source of truth.
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

/** Base URL where this Next app is hosted (for widget asset URLs). */
export function getAppBaseUrl(): string {
  return (
    process.env.RINGEE_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:4202"
  ).replace(/\/+$/, "");
}
