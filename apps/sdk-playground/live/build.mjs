/*
 * Live Playground builder — zero dependencies (pure Node).
 *
 *   node apps/sdk-playground/live/build.mjs            # copy SDK bundle → vendor/
 *   node apps/sdk-playground/live/build.mjs --build    # force-rebuild the SDK first
 *   node apps/sdk-playground/live/build.mjs --serve    # build, then serve on :5173
 *
 * Production defaults (optional) are injected from env at build time:
 *   RINGEE_PLAYGROUND_PK      → pk_live_… prefilled in the panel
 *   RINGEE_PLAYGROUND_API     → API base URL (no /api)
 *   RINGEE_PLAYGROUND_EMAIL   → agent email prefill
 *   RINGEE_PLAYGROUND_LOCALE  → "en" | "es"
 *
 * The result is a fully self-contained static folder (`apps/sdk-playground/live`)
 * that can be deployed to any static host (Vercel/Netlify/Cloudflare/S3/nginx).
 */
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  statSync,
} from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const distDir = resolve(repo, "packages/dialer-sdk/dist");
const vendor = resolve(here, "vendor");
const args = process.argv.slice(2);
const has = (f) => args.includes(f);

const BUNDLE = "ringee.global.js";
const MAP = "ringee.global.js.map";

function buildSdk() {
  console.log("• Building @ringee/dialer-sdk (tsup)…");
  execSync("pnpm --filter @ringee/dialer-sdk build", {
    cwd: repo,
    stdio: "inherit",
  });
}

// 1) Ensure the production SDK bundle exists.
if (has("--build") || !existsSync(resolve(distDir, BUNDLE))) {
  buildSdk();
}
if (!existsSync(resolve(distDir, BUNDLE))) {
  console.error(
    `✗ Missing ${BUNDLE} in ${distDir}. Run with --build or:\n` +
      "    pnpm --filter @ringee/dialer-sdk build",
  );
  process.exit(1);
}

// 2) Copy the bundle (+ sourcemap) into ./vendor.
mkdirSync(vendor, { recursive: true });
copyFileSync(resolve(distDir, BUNDLE), resolve(vendor, BUNDLE));
if (existsSync(resolve(distDir, MAP))) {
  copyFileSync(resolve(distDir, MAP), resolve(vendor, MAP));
}
const kb = (statSync(resolve(vendor, BUNDLE)).size / 1024).toFixed(0);
console.log(`✓ vendor/${BUNDLE} (${kb} KB)`);

// 3) Inject build-time defaults from env (safe no-op object if unset).
const defaults = {};
if (process.env.RINGEE_PLAYGROUND_PK) defaults.pk = process.env.RINGEE_PLAYGROUND_PK;
if (process.env.RINGEE_PLAYGROUND_API) defaults.apiUrl = process.env.RINGEE_PLAYGROUND_API;
if (process.env.RINGEE_PLAYGROUND_EMAIL) defaults.agentEmail = process.env.RINGEE_PLAYGROUND_EMAIL;
if (process.env.RINGEE_PLAYGROUND_LOCALE) defaults.locale = process.env.RINGEE_PLAYGROUND_LOCALE;
writeFileSync(
  resolve(vendor, "defaults.js"),
  "window.__RINGEE_PLAYGROUND_DEFAULTS__ = " + JSON.stringify(defaults) + ";\n",
);
console.log(
  Object.keys(defaults).length
    ? `✓ vendor/defaults.js (${Object.keys(defaults).join(", ")})`
    : "✓ vendor/defaults.js (empty — configure in the panel)",
);

// 4) Optional local static server.
if (has("--serve")) {
  const port = Number(process.env.PORT || 5173);
  const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
  };
  createServer((req, res) => {
    let path = decodeURIComponent((req.url || "/").split("?")[0]);
    if (path === "/") path = "/index.html";
    // Contain within `here` (no path traversal).
    const file = normalize(join(here, path));
    if (!file.startsWith(here) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "content-type": MIME[extname(file)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(readFileSync(file));
  }).listen(port, () => {
    console.log(`\n▶ Playground:  http://localhost:${port}\n`);
    console.log(
      `  Add "http://localhost:${port}" to your publishable key's allowedOrigins.`,
    );
  });
}
