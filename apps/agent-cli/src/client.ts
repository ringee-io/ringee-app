import {
  RingeeClient,
  RingeeConfigError,
  hasConfig,
  resolveConfig,
} from "@ringee-io/agent";
import { c, fail, line } from "./ui.js";

let cached: RingeeClient | null = null;

/**
 * Build (once) a RingeeClient from the environment. Exits with a friendly
 * message if the connection is not configured.
 */
export function getClient(): RingeeClient {
  if (cached) return cached;
  try {
    cached = RingeeClient.fromEnv();
    return cached;
  } catch (err) {
    if (err instanceof RingeeConfigError) {
      fail("Ringee is not configured.");
      line("");
      line(`  Set ${c.bold("RINGEE_MCP_URL")} to your MCP SSE URL, or set`);
      line(
        `  ${c.bold("RINGEE_BACKEND_URL")} + ${c.bold("RINGEE_USER_ID")} (and optionally RINGEE_ORG_ID).`,
      );
      line("");
      line(
        c.dim("  Find these in the dashboard: Settings → MCP / Integrations"),
      );
      line(
        c.dim(
          "  (GET /api/mcp/connection-info). Then run `ringee config show`.",
        ),
      );
      process.exit(1);
    }
    throw err;
  }
}

export { hasConfig, resolveConfig };

/** Standard error handler for command actions. */
export async function run(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    fail(message);
    process.exitCode = 1;
  } finally {
    if (cached) {
      await cached.close().catch(() => undefined);
    }
  }
}
