import { defineConfig } from "vitest/config";

// The extension's pure logic (call-flow, API error mapping, message validation)
// is tested in plain Node. Shared-package subpaths resolve via their package
// exports, the same way the Vite build resolves them.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
