#!/usr/bin/env node
/**
 * Dev watcher for the browser extension — edit a file, get a fresh loadable
 * `dist/`, then hit reload (⟳) on chrome://extensions.
 *
 * Why a full rebuild on every change instead of the usual watch modes?
 *
 *  - `vite` (dev server): CRXJS emits dev-mode HTML *stubs* for the extension
 *    pages that fetch the real app from a live server over HMR. The Chrome side
 *    panel can't reliably reach it, so it shows "This site can't be reached".
 *
 *  - `vite build --watch`: Vite empties the out dir on each rebuild, but this
 *    CRXJS beta's incremental rebuild only re-emits the *changed* module — the
 *    manifest, HTML pages and content-script loaders never come back, leaving a
 *    broken `dist/` (just `sounds/`).
 *
 * A full `vite build` per change is the only thing that reliably produces a
 * complete, loadable unpacked extension. It's a few seconds slower than HMR,
 * but it always works.
 */
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Sources that affect the build. `src`/`public` are watched recursively.
const TARGETS = [
  "src",
  "public",
  "manifest.config.ts",
  "vite.config.ts",
  ".env",
];

let building = false;
let queued = false;
let debounce = null;

function build() {
  if (building) {
    queued = true; // coalesce changes that land mid-build
    return;
  }
  building = true;
  const startedAt = Date.now();
  const child = spawn("pnpm", ["build"], {
    cwd: root,
    stdio: "inherit",
    shell: true, // resolve the pnpm shim on every platform
  });
  child.on("exit", (code) => {
    building = false;
    if (code === 0) {
      const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(
        `\n✓ extension rebuilt in ${secs}s — reload it at chrome://extensions (⟳)\n`,
      );
    } else {
      console.error(`\n✗ build failed (exit ${code}) — fix the error above\n`);
    }
    if (queued) {
      queued = false;
      build();
    }
  });
}

function scheduleBuild() {
  clearTimeout(debounce);
  debounce = setTimeout(build, 200); // collapse editor save bursts
}

for (const target of TARGETS) {
  try {
    watch(join(root, target), { recursive: true }, scheduleBuild);
  } catch {
    // optional path (e.g. missing .env) — skip it
  }
}

console.log("👀 watching src/, public/, manifest, vite config, .env\n");
build(); // initial build
