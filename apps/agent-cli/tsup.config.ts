import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  // Bundle the workspace agent layer (which exports TS source) into the binary
  // so the published `ringee` command is self-contained.
  noExternal: ["@ringee-io/agent"],
  banner: { js: "#!/usr/bin/env node" },
  clean: true,
  sourcemap: true,
  dts: false,
  minify: false,
});
