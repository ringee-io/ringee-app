import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_BACKEND_URL,
  RingeeConfigError,
  hasConfig,
  inferTransport,
  normalizeBackendUrl,
  resolveConfig,
} from "./config.js";

const KEY = `ringee_sk_${"a".repeat(64)}`;
const USER = "11111111-1111-4111-8111-111111111111";

describe("resolveConfig", () => {
  it("keeps the legacy RINGEE_MCP_URL working, over SSE", () => {
    const cfg = resolveConfig({
      RINGEE_MCP_URL: `https://api.ringee.io/api/mcp/${USER}/sse`,
    });
    assert.equal(cfg.transport, "sse");
    assert.equal(cfg.apiKey, undefined);
    assert.equal(cfg.source, "env:RINGEE_MCP_URL");
  });

  it("keeps RINGEE_BACKEND_URL + RINGEE_USER_ID working", () => {
    const cfg = resolveConfig({
      RINGEE_BACKEND_URL: "http://localhost:3000/api/",
      RINGEE_USER_ID: USER,
    });
    assert.equal(cfg.mcpUrl, `http://localhost:3000/api/mcp/${USER}/sse`);
    assert.equal(cfg.transport, "sse");
  });

  it("uses the API-key endpoint for RINGEE_API_KEY", () => {
    const cfg = resolveConfig({ RINGEE_API_KEY: KEY });
    assert.equal(cfg.mcpUrl, `${DEFAULT_BACKEND_URL}/api/mcp`);
    assert.equal(cfg.transport, "streamable-http");
    assert.equal(cfg.apiKey, KEY);
  });

  it("falls back to the saved login, and lets the environment win", () => {
    const stored = { apiKey: KEY, backendUrl: "http://localhost:3000" };
    const fromLogin = resolveConfig({}, stored);
    assert.equal(fromLogin.source, "login");
    assert.equal(fromLogin.mcpUrl, "http://localhost:3000/api/mcp");

    const fromEnv = resolveConfig(
      { RINGEE_MCP_URL: `https://api.ringee.io/api/mcp/${USER}/sse` },
      stored,
    );
    assert.equal(fromEnv.source, "env:RINGEE_MCP_URL");
  });

  it("explains how to log in when nothing is configured", () => {
    assert.equal(hasConfig({}, null), false);
    assert.throws(() => resolveConfig({}), RingeeConfigError);
    assert.throws(() => resolveConfig({}), /ringee login/);
  });
});

describe("normalizeBackendUrl", () => {
  it("drops trailing slashes and the /api suffix", () => {
    assert.equal(
      normalizeBackendUrl("https://api.ringee.io"),
      DEFAULT_BACKEND_URL,
    );
    assert.equal(
      normalizeBackendUrl("https://api.ringee.io///"),
      DEFAULT_BACKEND_URL,
    );
    assert.equal(
      normalizeBackendUrl("https://api.ringee.io/api/"),
      DEFAULT_BACKEND_URL,
    );
    assert.equal(
      normalizeBackendUrl("https://x.io/api/v1"),
      "https://x.io/api/v1",
    );
  });

  it("stays linear on a long run of slashes", () => {
    const started = Date.now();
    normalizeBackendUrl(`x${"/".repeat(100_000)}x`);
    // The old /\/+$/ took seconds here.
    assert.ok(Date.now() - started < 1000);
  });
});

describe("inferTransport", () => {
  it("reads SSE from the path and defaults to Streamable HTTP", () => {
    assert.equal(inferTransport("https://api.ringee.io/api/mcp/sse"), "sse");
    assert.equal(
      inferTransport("https://api.ringee.io/api/mcp"),
      "streamable-http",
    );
  });
});
