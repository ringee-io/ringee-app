import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config";

// The extension bundles the shared Ringee packages (dialer-core, dialer-ui,
// frontend-shared) directly — no second implementation of the dialer or the
// Active Call Modal. Vite tree-shakes so each context only pulls what it uses:
// only the offscreen document ends up with @telnyx/webrtc.
export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest })],
  build: {
    target: "esnext",
    sourcemap: true,
    rollupOptions: {
      // Build the extension pages through Vite's normal HTML pipeline:
      //  - offscreen is created at runtime (not in the manifest), so it must be
      //    an explicit input;
      //  - permission is opened in a tab on demand (the only context Chrome lets
      //    us prompt for the mic), so it also isn't in the manifest;
      //  - sidepanel is declared in the manifest, but this CRX beta emits a
      //    broken dev-mode loader for manifest HTML during `vite build`, so we
      //    register it here too to get the real production page.
      input: {
        offscreen: "src/offscreen/offscreen.html",
        permission: "src/permission/index.html",
        sidepanel: "src/sidepanel/index.html",
      },
    },
  },
  // Telnyx WebRTC expects a Node-style global; harmless in extension pages.
  define: { global: "globalThis" },
});
