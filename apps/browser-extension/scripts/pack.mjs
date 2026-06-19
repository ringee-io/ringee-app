#!/usr/bin/env node
/**
 * Package the extension into a Chrome Web Store-ready .zip.
 *
 * Produces `releases/ringee-extension-v<version>.zip` whose ROOT is the
 * extension itself (manifest.json at the top level) — that's exactly what the
 * Web Store upload expects, NOT a zip that contains a `dist/` folder.
 *
 * By default it runs a clean production `pnpm build` first and strips source
 * maps (`.map`) so the published bundle stays small and doesn't ship the full
 * unminified source. Flags:
 *   --no-build    zip the existing dist/ as-is (skip the rebuild)
 *   --with-maps   keep .map files in the package
 *
 * Usage:  pnpm package
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const outDir = join(root, "releases");

const args = process.argv.slice(2);
const skipBuild = args.includes("--no-build");
const withMaps = args.includes("--with-maps");

// One string + shell:true (not an args array) so the pnpm shim resolves on every
// platform without tripping Node's DEP0190 warning.
function run(command, opts = {}) {
  const res = spawnSync(command, { stdio: "inherit", shell: true, ...opts });
  if (res.status !== 0) {
    console.error(`\n✗ \`${command}\` failed (exit ${res.status})`);
    process.exit(res.status ?? 1);
  }
}

// 1) Fresh production build (unless told to reuse dist/).
if (!skipBuild) {
  console.log("📦 building production bundle…\n");
  run("pnpm build", { cwd: root });
} else if (!existsSync(join(dist, "manifest.json"))) {
  console.error("✗ --no-build given but dist/manifest.json is missing. Run `pnpm build` first.");
  process.exit(1);
}

// 2) Version comes from the BUILT manifest (the single source of truth that
//    Chrome actually loads), so the filename always matches what's published.
const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
const version = manifest.version ?? "0.0.0";
const zipName = `ringee-extension-v${version}.zip`;
const zipPath = join(outDir, zipName);

mkdirSync(outDir, { recursive: true });
rmSync(zipPath, { force: true }); // a stale zip of the same name would be merged into

// 3) Zip the CONTENTS of dist/ (cwd: dist) so manifest.json lands at the root.
//    -r recurse, -X drop extra macOS attributes, exclude junk + (by default) maps.
const excludes = ["*.DS_Store", "__MACOSX/*"];
if (!withMaps) excludes.push("*.map");
const excludeArgs = excludes.map((p) => `-x "${p}"`).join(" ");

console.log(`\n🗜  zipping dist/ → releases/${zipName}${withMaps ? " (with source maps)" : ""}\n`);
run(`zip -r -X "${zipPath}" . ${excludeArgs}`, { cwd: dist });

console.log(`\n✓ packaged releases/${zipName}`);
console.log("  Upload it at https://chrome.google.com/webstore/devconsole\n");
