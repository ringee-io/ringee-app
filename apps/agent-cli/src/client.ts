import {
  AGENT_VERSION,
  RingeeAgentConfig,
  RingeeClient,
  RingeeConfigError,
  hasConfig,
  resolveConfig as resolveAgentConfig,
} from "@ringee-io/agent";
import { readSavedLogin } from "./credentials.js";
import { c, fail, line } from "./ui.js";

/**
 * The `clientInfo` this CLI sends over MCP. Ringee counts CLI usage by it, so
 * keep it stable.
 */
export const CLI_CLIENT_NAME = "ringee-cli";
export const CLI_USER_AGENT = `${CLI_CLIENT_NAME}/${AGENT_VERSION}`;

let cached: RingeeClient | null = null;

/** Environment first (CI, agent harnesses), then the saved `ringee login`. */
export function resolveConfig(): RingeeAgentConfig {
  return resolveAgentConfig(process.env, readSavedLogin());
}

/**
 * Build (once) a RingeeClient from the environment or the saved login. Exits
 * with a friendly message if neither is there.
 */
export function getClient(): RingeeClient {
  if (cached) return cached;
  try {
    cached = RingeeClient.fromConfig(resolveConfig(), {
      clientName: CLI_CLIENT_NAME,
      clientVersion: AGENT_VERSION,
    });
    return cached;
  } catch (err) {
    if (err instanceof RingeeConfigError) {
      fail("You're not logged in to Ringee.");
      line("");
      line(
        `  Run ${c.bold("ringee login")} to authorize this terminal in your browser.`,
      );
      line("");
      line(
        c.dim(
          "  For CI or agents: set RINGEE_API_KEY (Settings → Connectors → API keys).",
        ),
      );
      process.exit(1);
    }
    throw err;
  }
}

export { hasConfig };

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
