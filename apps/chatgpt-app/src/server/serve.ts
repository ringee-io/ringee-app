import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { RingeeClient } from "@ringee-io/agent";
import { createRingeeAppServer } from "./mcp-server.js";
import { getRingeeClientForToken } from "./ringee-mcp.js";
import {
  buildProtectedResourceMetadata,
  extractBearer,
  getAuthConfig,
  verifyAccessToken,
  wwwAuthenticate,
} from "./auth.js";

/**
 * Standalone MCP endpoint for the Ringee ChatGPT App.
 *
 * This is what ChatGPT connects to. The visual components are inlined into the
 * tool result HTML resources, so this server is the only thing you deploy for
 * the app to work. Point a ChatGPT connector / the MCP Inspector at
 * https://<host>/mcp.
 *
 * Requires the agent env (RINGEE_MCP_URL, or RINGEE_BACKEND_URL +
 * RINGEE_USER_ID [+ RINGEE_ORG_ID]). For production, enable OAuth with
 * RINGEE_REQUIRE_AUTH=true (see auth.ts / README).
 */
const PORT = Number(process.env.RINGEE_MCP_PORT ?? 4250);
const auth = getAuthConfig();

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function text(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

/**
 * OpenAI Apps SDK domain-verification token for this MCP origin
 * (`chatgpt.ringee.io`). OpenAI issues a distinct token per verified origin,
 * so this is deliberately NOT the backend's `OPENAI_APPS_CHALLENGE_TOKEN`
 * (which verifies `api.ringee.io`) — reusing that var would serve the wrong
 * token here. Configurable via `OPENAI_APPS_CHALLENGE_TOKEN_CHATGPT`; the
 * fallback is the value OpenAI issued for chatgpt.ringee.io.
 */
const OPENAI_APPS_CHALLENGE_TOKEN =
  process.env.OPENAI_APPS_CHALLENGE_TOKEN_CHATGPT ?? "";

/** Largest request body accepted; an MCP call is a few kilobytes. */
const MAX_BODY_BYTES = 1024 * 1024;

/**
 * Most JSON-RPC messages one request may batch. The SDK's response bookkeeping
 * is quadratic in a batch's size, so a large batch of cheap pings would stall
 * every other request on this process.
 */
const MAX_BATCH_MESSAGES = 10;

class RequestTooLarge extends Error {}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new RequestTooLarge();
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}

const httpServer = createServer(async (req, res) => {
  const url = req.url ?? "/";

  if (req.method === "GET" && url === "/health") {
    return json(res, 200, { ok: true, service: "ringee-chatgpt-app-mcp" });
  }

  // OpenAI Apps SDK domain verification: serve the issued token verbatim at the
  // origin root, e.g. GET https://chatgpt.ringee.io/.well-known/openai-apps-challenge
  if (
    req.method === "GET" &&
    url.split("?")[0] === "/.well-known/openai-apps-challenge"
  ) {
    return text(res, 200, OPENAI_APPS_CHALLENGE_TOKEN);
  }

  // RFC 9728 — protected resource metadata (always exposed when auth is on).
  if (
    req.method === "GET" &&
    url.startsWith("/.well-known/oauth-protected-resource")
  ) {
    if (!auth.enabled) return json(res, 404, { error: "Auth not enabled" });
    return json(res, 200, buildProtectedResourceMetadata(auth));
  }

  if (url.startsWith("/mcp")) {
    // Per-request Ringee client. Stays undefined in dev (auth off), where
    // createRingeeAppServer falls back to the env-configured singleton.
    let ringeeClient: RingeeClient | undefined;

    // Enforce OAuth when enabled, then forward the caller's token downstream.
    if (auth.enabled) {
      const token = extractBearer(req);
      if (!token) {
        res.setHeader("WWW-Authenticate", wwwAuthenticate(auth));
        return json(res, 401, { error: "Unauthorized" });
      }
      // Verify locally when JWKS/issuer are configured so we can answer with a
      // clean 401 challenge before forwarding. The backend re-verifies the
      // token and is the single authority on which account it maps to.
      if (auth.jwksUrl && auth.issuer) {
        try {
          await verifyAccessToken(token, auth);
        } catch (err) {
          res.setHeader("WWW-Authenticate", wwwAuthenticate(auth));
          return json(res, 401, {
            error: err instanceof Error ? err.message : "Invalid token",
          });
        }
      }
      // Forward the token to the authenticated backend MCP, which resolves the
      // Ringee user — or active organization — from it.
      ringeeClient = getRingeeClientForToken(token);
    }

    try {
      let body: unknown;
      try {
        body = await readBody(req);
      } catch (err) {
        if (err instanceof RequestTooLarge)
          return json(res, 413, { error: "Request body too large" });
        throw err;
      }
      if (Array.isArray(body) && body.length > MAX_BATCH_MESSAGES) {
        return json(res, 400, {
          error: `A batch may carry at most ${MAX_BATCH_MESSAGES} messages`,
        });
      }
      const server = createRingeeAppServer(ringeeClient);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
      });
      res.on("close", () => {
        void transport.close();
        void server.close();
        // Close the per-request upstream client (never the env singleton).
        if (ringeeClient) void ringeeClient.close().catch(() => undefined);
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      if (!res.headersSent) json(res, 500, { error: message });
      else res.end();
    }
    return;
  }

  json(res, 404, { error: "Not found. Use POST /mcp." });
});

// Without OAuth every request runs as the operator's own env-configured
// account, so that mode answers this machine only — never the network.
const HOST = auth.enabled ? undefined : "127.0.0.1";
if (!auth.enabled && process.env.NODE_ENV === "production") {
  process.stderr.write(
    "RINGEE_REQUIRE_AUTH is not true: serving on 127.0.0.1 only. Set it (and the OAuth issuer/JWKS) to accept ChatGPT's connections.\n",
  );
}

httpServer.listen(PORT, HOST, () => {
  process.stdout.write(
    `Ringee ChatGPT App MCP on http://localhost:${PORT}/mcp` +
      (auth.enabled ? " (OAuth required)" : " (no auth — dev, local only)") +
      "\n",
  );
});
