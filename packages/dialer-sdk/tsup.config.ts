import { defineConfig } from "tsup";

/**
 * Build targets:
 *   - `index`  — headless ESM + CJS + `.d.ts` (`@ringee/dialer-sdk`)
 *   - `ui/index` — turnkey Floating/Bar UI ESM + CJS + `.d.ts`
 *     (`@ringee/dialer-sdk/ui`)
 *   - `ringee.global.js` — self-contained IIFE exposing `window.Ringee` with
 *     the UI bundled, for a one-tag CDN embed.
 *
 * `@ringee/dialer-core` (and its `@telnyx/webrtc` dependency) is bundled in so
 * consumers install a single package.
 */
export default defineConfig([
  {
    entry: { index: "src/index.ts", "ui/index": "src/ui/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    noExternal: [/@ringee\/dialer-core/, /@telnyx\/webrtc/],
  },
  {
    entry: { ringee: "src/global-ui.ts" },
    format: ["iife"],
    globalName: "Ringee",
    outExtension: () => ({ js: ".global.js" }),
    minify: true,
    sourcemap: true,
    treeshake: true,
    noExternal: [/.*/],
    platform: "browser",
  },
]);
