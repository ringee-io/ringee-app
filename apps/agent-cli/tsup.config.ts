import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  // Bundle ONLY the workspace agent layer (which exports TS source and is not
  // published to npm) into the binary. Real npm dependencies — the MCP SDK
  // (which pulls in ajv via dynamic requires that do not bundle cleanly), zod
  // and commander — stay external and are installed from the published
  // package.json `dependencies`.
  noExternal: ["@ringee-io/agent"],
  external: ["@modelcontextprotocol/sdk", "zod", "commander"],
  banner: { js: "#!/usr/bin/env node" },
  clean: true,
  sourcemap: true,
  dts: false,
  minify: false,
});
