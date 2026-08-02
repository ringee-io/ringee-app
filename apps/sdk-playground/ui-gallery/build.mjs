// Bundles the visual playground. Run: node apps/sdk-playground/ui-gallery/build.mjs
// (esbuild is resolved from the monorepo store; the SDK's dialer-core alias is
// wired so the source tree bundles without a prior package build.)
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");

await build({
  entryPoints: [resolve(here, "gallery.ts")],
  bundle: true,
  format: "iife",
  outfile: resolve(here, "gallery.js"),
  platform: "browser",
  target: "es2020",
  sourcemap: true,
  logLevel: "info",
  alias: {
    "@ringee/dialer-core": resolve(repo, "packages/dialer-core/src/index.ts"),
    "@ringee/dialer-core/engine": resolve(repo, "packages/dialer-core/src/engine/index.ts"),
  },
});

console.log("✓ built apps/sdk-playground/ui-gallery/gallery.js");
