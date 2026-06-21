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
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
const manifestPath = join(dist, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const version = manifest.version ?? "0.0.0";
const zipName = `ringee-extension-v${version}.zip`;
const zipPath = join(outDir, zipName);

mkdirSync(outDir, { recursive: true });
rmSync(zipPath, { force: true }); // a stale zip of the same name would be merged into

// 3) Strip the `key` field from the PUBLISHED package. `key` (from CRX_KEY)
//    only exists to pin a stable extension ID for LOCAL unpacked development.
//    The Chrome Web Store signs each item with its OWN key and records the
//    resulting ID; uploading a package whose `key` derives a different ID than
//    the store item is rejected with "The value of the 'key' field in the
//    manifest does not match the current item." We remove it just for the zip,
//    then restore dist/manifest.json so loading dist/ unpacked keeps its ID.
const originalManifestText = readFileSync(manifestPath, "utf8");
let manifestStripped = false;
if (manifest.key !== undefined) {
  const { key: _omit, ...withoutKey } = manifest;
  writeFileSync(manifestPath, `${JSON.stringify(withoutKey, null, 2)}\n`);
  manifestStripped = true;
  console.log("🔑 stripped dev `key` field — the Chrome Web Store assigns the published ID\n");
}

try {
  // 4) Zip the CONTENTS of dist/ (cwd: dist) so manifest.json lands at the root.
  //    -r recurse, -X drop extra macOS attributes, exclude junk + (by default) maps.
  const excludes = ["*.DS_Store", "__MACOSX/*"];
  if (!withMaps) excludes.push("*.map");
  const excludeArgs = excludes.map((p) => `-x "${p}"`).join(" ");

  console.log(`🗜  zipping dist/ → releases/${zipName}${withMaps ? " (with source maps)" : ""}\n`);
  run(`zip -r -X "${zipPath}" . ${excludeArgs}`, { cwd: dist });
} finally {
  // Always put the unpacked dist/ manifest back the way it was built.
  if (manifestStripped) writeFileSync(manifestPath, originalManifestText);
}

console.log(`\n✓ packaged releases/${zipName}`);
console.log("  Upload it at https://chrome.google.com/webstore/devconsole\n");
