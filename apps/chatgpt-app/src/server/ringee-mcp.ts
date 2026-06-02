import { RingeeClient, buildMcpUrl, resolveConfig } from "@ringee-io/agent";
import type { RingeeIdentity } from "./auth.js";

/**
 * Server-only access to the Ringee backend/MCP. The ChatGPT App never reaches
 * the database — it proxies through this client to the existing MCP, which is
 * the single source of truth.
 *
 * Two modes:
 *   - `getRingeeClient()`     single account from the env (dev / single-tenant).
 *   - `getRingeeClientFor()`  one account per authenticated caller (multi-tenant).
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
 * Per-caller clients, keyed by `userId:organizationId`. We cache so each
 * tenant reuses one backend SSE connection across requests instead of opening
 * a new one every call. A soft cap evicts the oldest tenant to bound memory.
 */
const MAX_TENANT_CLIENTS = 500;
const perTenantClients = new Map<string, RingeeClient>();

/**
 * Build (or reuse) a Ringee client scoped to a single authenticated account.
 * The privileged capability URL is constructed server-side from the verified
 * identity and never leaves this process.
 *
 * Requires RINGEE_BACKEND_URL so we can build `/api/mcp/<userId>[/<orgId>]/sse`.
 */
export function getRingeeClientFor(identity: RingeeIdentity): RingeeClient {
  const key = `${identity.userId}:${identity.organizationId ?? ""}`;
  const cached = perTenantClients.get(key);
  if (cached) return cached;

  const backendUrl = process.env.RINGEE_BACKEND_URL;
  if (!backendUrl) {
    throw new Error(
      "Multi-tenant mode needs RINGEE_BACKEND_URL to build a per-user MCP URL.",
    );
  }

  const url = buildMcpUrl(backendUrl, identity.userId, identity.organizationId);
  const created = new RingeeClient({ url, apiKey: process.env.RINGEE_API_KEY });

  // Evict the oldest tenant if we hit the cap (Map keeps insertion order).
  if (perTenantClients.size >= MAX_TENANT_CLIENTS) {
    const oldest = perTenantClients.keys().next().value;
    if (oldest !== undefined) {
      const stale = perTenantClients.get(oldest);
      perTenantClients.delete(oldest);
      void stale?.close().catch(() => undefined);
    }
  }

  perTenantClients.set(key, created);
  return created;
}

/** Base URL where this Next app is hosted (for widget asset URLs). */
export function getAppBaseUrl(): string {
  return (
    process.env.RINGEE_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:4202"
  ).replace(/\/+$/, "");
}
