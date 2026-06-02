#!/usr/bin/env node
/**
 * Build the ChatGPT widget bundle: one self-contained JS module that mounts the
 * Ringee components, plus the compiled Tailwind CSS. Both are inlined into the
 * MCP HTML resources at serve time (see src/server/mcp-server.ts).
 *
 *   pnpm --filter @ringee-io/chatgpt-app build:widgets
 *
 * Output: dist/widgets/widget.js and dist/widgets/widget.css
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = resolve(root, "dist/widgets");

// 1) Bundle the React widget entry (resolves @/* via tsconfig paths).
await build({
  entryPoints: [resolve(root, "widgets/entry.tsx")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  minify: true,
  sourcemap: false,
  outfile: resolve(outdir, "widget.js"),
  tsconfig: resolve(root, "tsconfig.json"),
  logLevel: "info",
});

// 2) Compile Tailwind from the app's globals.css (tokens + utilities).
const tailwindBin = resolve(root, "node_modules/.bin/tailwindcss");
const bin = existsSync(tailwindBin) ? tailwindBin : "tailwindcss";
execFileSync(
  bin,
  [
    "--input",
    resolve(root, "src/app/globals.css"),
    "--output",
    resolve(outdir, "widget.css"),
    "--minify",
  ],
  { stdio: "inherit", cwd: root },
);

console.log(`\n✓ Widgets built → ${outdir}`);
